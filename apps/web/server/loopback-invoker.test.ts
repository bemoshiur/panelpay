import { describe, expect, it } from "vitest";
import { loopbackInvokerFromEnv, PRO_INVOKE_TOKEN_HEADER } from "./loopback-invoker.ts";

const TOKEN = "k".repeat(48);
const env = (extra: Record<string, string | undefined> = {}) => ({
  PRO_INVOKE_URL: "http://127.0.0.1:9700",
  PRO_INVOKE_TOKEN: TOKEN,
  ...extra,
});

describe("loopbackInvokerFromEnv", () => {
  it("is undefined outside the Pro edition, so the Lambda path is used", () => {
    expect(loopbackInvokerFromEnv({}, "reader")).toBeUndefined();
  });

  it("fails closed (null) on a non-loopback URL, a short token or https", () => {
    expect(
      loopbackInvokerFromEnv(env({ PRO_INVOKE_URL: "http://10.0.0.5:9700" }), "reader"),
    ).toBeNull();
    expect(
      loopbackInvokerFromEnv(env({ PRO_INVOKE_URL: "http://localhost:9700" }), "reader"),
    ).toBeNull();
    expect(
      loopbackInvokerFromEnv(env({ PRO_INVOKE_URL: "http://127.0.0.1:9700/x" }), "reader"),
    ).toBeNull();
    expect(
      loopbackInvokerFromEnv(env({ PRO_INVOKE_URL: "http://user@127.0.0.1:9700" }), "reader"),
    ).toBeNull();
    expect(loopbackInvokerFromEnv(env({ PRO_INVOKE_TOKEN: "short" }), "reader")).toBeNull();
    expect(loopbackInvokerFromEnv(env({ PRO_INVOKE_TOKEN: undefined }), "reader")).toBeNull();
  });

  it("posts the payload with the token and maps the answer", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;
    const inv = loopbackInvokerFromEnv(env(), "access-details", fetcher)!;
    const out = await inv.invoke('{"a":1}');
    expect(out).toEqual({ functionError: false, payload: '{"ok":true}' });
    expect(seen[0]!.url).toBe("http://127.0.0.1:9700/invoke/access-details");
    expect(seen[0]!.init.method).toBe("POST");
    expect((seen[0]!.init.headers as Record<string, string>)[PRO_INVOKE_TOKEN_HEADER]).toBe(TOKEN);
    expect(seen[0]!.init.redirect).toBe("error");
  });

  it("reports any non-200 as a function error", async () => {
    const fetcher = (async () =>
      new Response('{"error":"x"}', { status: 502 })) as unknown as typeof fetch;
    const out = await loopbackInvokerFromEnv(env(), "reader", fetcher)!.invoke("{}");
    expect(out.functionError).toBe(true);
  });
});

describe("the four ports in the Pro edition", () => {
  it("never fall back to Lambda when the Pro setting is present", async () => {
    const { readerPortFromEnv } = await import("./reader-invoke.ts");
    const { accessPortFromEnv } = await import("./access-invoke.ts");
    const { kycCheckPortFromEnv } = await import("./kyc-check-invoke.ts");
    const { rendererPortFromEnv } = await import("./renderer-invoke.ts");
    const lambda = () => {
      throw new Error("lambda path used");
    };
    const names = {
      READER_FUNCTION_NAME: "r",
      ACCESS_DETAILS_FUNCTION_NAME: "a",
      KYC_CHECK_FUNCTION_NAME: "k",
      INVOICE_RENDERER_FUNCTION_NAME: "i",
    };
    const good = { ...env(), ...names };
    expect(readerPortFromEnv(good, lambda)).not.toBeNull();
    expect(accessPortFromEnv(good, lambda)).not.toBeNull();
    expect(kycCheckPortFromEnv(good, lambda)).not.toBeNull();
    expect(rendererPortFromEnv(good, lambda)).not.toBeNull();
    const bad = { ...env({ PRO_INVOKE_URL: "http://10.0.0.5:9700" }), ...names };
    expect(readerPortFromEnv(bad, lambda)).toBeNull();
    expect(accessPortFromEnv(bad, lambda)).toBeNull();
    expect(kycCheckPortFromEnv(bad, lambda)).toBeNull();
    expect(rendererPortFromEnv(bad, lambda)).toBeNull();
  });
});
