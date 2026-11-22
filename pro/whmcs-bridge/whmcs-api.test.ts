import { describe, expect, it } from "vitest";
import { whmcsApi, WhmcsUnavailable } from "./whmcs-api";

function api(answer: unknown, status = 200) {
  const calls: { url: string; body: URLSearchParams; init: RequestInit }[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body as URLSearchParams, init });
    return new Response(typeof answer === "string" ? answer : JSON.stringify(answer), { status });
  };
  return {
    calls,
    a: whmcsApi({
      url: "https://billing.example.test",
      identifier: "ID",
      secret: "SECRET",
      fetcher,
    }),
  };
}

describe("whmcsApi", () => {
  it("refuses a URL that is not plain https", () => {
    for (const url of ["http://billing.example.test", "https://u:p@billing.example.test"]) {
      expect(() => whmcsApi({ url, identifier: "a", secret: "b" })).toThrow();
    }
  });

  it("reads an invoice with GetInvoice and parses its lines", async () => {
    const { a, calls } = api({
      result: "success",
      invoiceid: 1001,
      userid: 7,
      status: "Paid",
      balance: "0.00",
      total: "25.00",
      items: { item: [{ description: "TryAWS.now wallet top-up", amount: "25.00" }] },
    });
    expect(await a.getInvoice("1001")).toEqual({
      invoiceId: "1001",
      userId: "7",
      status: "Paid",
      balance: "0.00",
      total: "25.00",
      items: [{ description: "TryAWS.now wallet top-up", amount: "25.00" }],
    });
    expect(calls[0]!.url).toBe("https://billing.example.test/includes/api.php");
    expect(calls[0]!.body.get("action")).toBe("GetInvoice");
    expect(calls[0]!.body.get("invoiceid")).toBe("1001");
    expect(calls[0]!.init.redirect).toBe("error");
  });

  it("does not call WHMCS for an id that cannot be one", async () => {
    const { a, calls } = api({});
    expect(await a.getInvoice("1 OR 1=1")).toBeNull();
    expect(await a.getClient("-3")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("treats an answer for another invoice, a broken shape, an HTTP error or non-JSON as unavailable", async () => {
    await expect(
      api({
        result: "success",
        invoiceid: 9,
        userid: 7,
        status: "Paid",
        balance: "0",
        total: "1",
      }).a.getInvoice("1001"),
    ).rejects.toBeInstanceOf(WhmcsUnavailable);
    await expect(
      api({ result: "success", invoiceid: 1001 }).a.getInvoice("1001"),
    ).rejects.toBeInstanceOf(WhmcsUnavailable);
    await expect(api("oops", 500).a.getInvoice("1001")).rejects.toBeInstanceOf(WhmcsUnavailable);
    await expect(api("<html>").a.getInvoice("1001")).rejects.toBeInstanceOf(WhmcsUnavailable);
  });

  it("reads the client's e-mail and currency", async () => {
    const { a } = api({
      result: "success",
      client: { email: "b@example.test", currency_code: "USD" },
    });
    expect(await a.getClient("7")).toEqual({ email: "b@example.test", currencyCode: "USD" });
  });

  it("a WHMCS error answer is no invoice", async () => {
    expect(
      await api({ result: "error", message: "Invoice ID Not Found" }).a.getInvoice("5"),
    ).toBeNull();
  });
});
