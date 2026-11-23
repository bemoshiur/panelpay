import { describe, expect, it } from "vitest";
import { createBridgeHandler, sign, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./server";

const SECRET = "s".repeat(48);
const NOW = new Date("2026-12-01T00:00:00Z");
const ts = String(Math.floor(NOW.getTime() / 1000));

function setup(perMinute?: number) {
  const credited: string[] = [];
  const changedIds: string[] = [];
  const handle = createBridgeHandler({
    secret: SECRET,
    clock: { now: () => NOW },
    credit: async (id) => {
      credited.push(id);
      return "credited";
    },
    changed: async (id) => {
      changedIds.push(id);
      return "flagged";
    },
    ...(perMinute === undefined ? {} : { perMinute }),
  });
  return { handle, credited, changedIds };
}

const req = (body: string, at = ts, sig = sign(SECRET, at, body)) => ({
  method: "POST",
  path: "/bridge/whmcs/invoice-paid",
  headers: { [TIMESTAMP_HEADER]: at, [SIGNATURE_HEADER]: sig },
  body,
});

describe("createBridgeHandler", () => {
  it("passes a signed, fresh request for one invoice id to the credit", async () => {
    const { handle, credited } = setup();
    const res = await handle(req('{"invoiceId":"1001"}'));
    expect(res).toEqual({ status: 200, body: '{"kind":"credited"}' });
    expect(credited).toEqual(["1001"]);
  });

  it("refuses a bad or missing signature, another secret, or a stale or future timestamp", async () => {
    const { handle, credited } = setup();
    const body = '{"invoiceId":"1001"}';
    expect((await handle(req(body, ts, "0".repeat(64)))).status).toBe(401);
    expect((await handle(req(body, ts, sign("x".repeat(48), ts, body)))).status).toBe(401);
    expect((await handle({ ...req(body), headers: {} })).status).toBe(401);
    const stale = String(Number(ts) - 301);
    expect((await handle(req(body, stale))).status).toBe(401);
    const future = String(Number(ts) + 301);
    expect((await handle(req(body, future))).status).toBe(401);
    // A signature over another body does not carry over.
    expect((await handle({ ...req(body), body: '{"invoiceId":"9999"}' })).status).toBe(401);
    expect(credited).toEqual([]);
  });

  it("refuses anything but one numeric invoice id", async () => {
    const { handle, credited } = setup();
    for (const body of [
      '{"invoiceId":1001}',
      '{"invoiceId":"1 OR 1"}',
      "{}",
      "not json",
      '{"invoiceId":"0"}',
    ]) {
      expect((await handle(req(body))).status).toBe(400);
    }
    expect(credited).toEqual([]);
  });

  it("answers 404 for another path and 405 for another method", async () => {
    const { handle } = setup();
    expect((await handle({ ...req("{}"), path: "/bridge/other" })).status).toBe(404);
    expect((await handle({ ...req("{}"), method: "GET" })).status).toBe(405);
  });

  it("sends invoice-changed to the change check, never to the credit (money review 2)", async () => {
    const { handle, credited, changedIds } = setup();
    const res = await handle({
      ...req('{"invoiceId":"1001"}'),
      path: "/bridge/whmcs/invoice-changed",
    });
    expect(res).toEqual({ status: 200, body: '{"kind":"flagged"}' });
    expect(changedIds).toEqual(["1001"]);
    expect(credited).toEqual([]);
  });

  it("does not count a malformed body against the limit (R9 order)", async () => {
    const { handle } = setup(1);
    expect((await handle(req("not json"))).status).toBe(400);
    expect((await handle(req('{"invoiceId":"1001"}'))).status).toBe(200);
  });

  it("limits signed calls per minute", async () => {
    const { handle } = setup(2);
    const body = '{"invoiceId":"1001"}';
    expect((await handle(req(body))).status).toBe(200);
    expect((await handle(req(body))).status).toBe(200);
    expect((await handle(req(body))).status).toBe(429);
  });

  it("signs exactly as the WHMCS addon does (php pro/whmcs/test/lib-test.php prints the same value)", () => {
    expect(sign("s".repeat(48), "1764547200", JSON.stringify({ invoiceId: "1001" }))).toBe(
      "ae9f8af1d3af7b0f5806bf76028421398d21361b0b87a62e6b0bc3d15d306906",
    );
  });

  it("refuses a short secret at start", () => {
    expect(() =>
      createBridgeHandler({
        secret: "short",
        clock: { now: () => NOW },
        credit: async () => "x",
        changed: async () => "x",
      }),
    ).toThrow();
  });
});
