import { describe, expect, it } from "vitest";
import { loopbackInvokerFromEnv, PRO_INVOKE_TOKEN_HEADER } from "./loopback-invoker.ts";

const TOKEN = "k".repeat(48);
const env = (extra: Record<string, string | undefined> = {}) => ({
  PRO_INVOKE_SOCKET: "/run/tc-invoke/invoke.sock",
  PRO_INVOKE_TOKEN: TOKEN,
  ...extra,
});

describe("loopbackInvokerFromEnv", () => {
  it("is undefined outside the Pro edition, so the Lambda path is used", () => {
    expect(loopbackInvokerFromEnv({}, "reader")).toBeUndefined();
  });

  it("fails closed (null) on a bad socket path or a short token", () => {
    for (const bad of [
      "invoke.sock",
      "/run/../etc/x.sock",
      "/run/tc-invoke/invoke",
      "http://127.0.0.1:9700",
    ]) {
      expect(loopbackInvokerFromEnv(env({ PRO_INVOKE_SOCKET: bad }), "reader")).toBeNull();
    }
    expect(loopbackInvokerFromEnv(env({ PRO_INVOKE_TOKEN: "short" }), "reader")).toBeNull();
    expect(loopbackInvokerFromEnv(env({ PRO_INVOKE_TOKEN: undefined }), "reader")).toBeNull();
  });

  it("posts the payload over the socket with the token and maps the answer", async () => {
    const seen: { socket: string; path: string; headers: Record<string, string>; body: string }[] =
      [];
    const post = async (
      socket: string,
      path: string,
      headers: Readonly<Record<string, string>>,
      body: string,
    ) => {
      seen.push({ socket, path, headers: { ...headers }, body });
      return { status: 200, body: '{"ok":true}' };
    };
    const inv = loopbackInvokerFromEnv(env(), "access-details", post)!;
    const out = await inv.invoke('{"a":1}');
    expect(out).toEqual({ functionError: false, payload: '{"ok":true}' });
    expect(seen[0]!.socket).toBe("/run/tc-invoke/invoke.sock");
    expect(seen[0]!.path).toBe("/invoke/access-details");
    expect(seen[0]!.headers[PRO_INVOKE_TOKEN_HEADER]).toBe(TOKEN);
    expect(seen[0]!.body).toBe('{"a":1}');
  });

  it("reports any non-200 as a function error", async () => {
    const post = async () => ({ status: 502, body: '{"error":"x"}' });
    const out = await loopbackInvokerFromEnv(env(), "reader", post)!.invoke("{}");
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
    const bad = { ...env({ PRO_INVOKE_SOCKET: "relative.sock" }), ...names };
    expect(readerPortFromEnv(bad, lambda)).toBeNull();
    expect(accessPortFromEnv(bad, lambda)).toBeNull();
    expect(kycCheckPortFromEnv(bad, lambda)).toBeNull();
    expect(rendererPortFromEnv(bad, lambda)).toBeNull();
  });
});

describe("the real socket client", () => {
  it("round-trips a payload over a Unix socket", async () => {
    const { createServer } = await import("node:http");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const socket = join(mkdtempSync(join(tmpdir(), "tc-web-")), "invoke.sock");
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const ok = req.headers[PRO_INVOKE_TOKEN_HEADER] === TOKEN && req.url === "/invoke/reader";
        res.writeHead(ok ? 200 : 401).end(ok ? body : "{}");
      });
    });
    await new Promise<void>((r) => server.listen(socket, r));
    try {
      const inv = loopbackInvokerFromEnv(env({ PRO_INVOKE_SOCKET: socket }), "reader")!;
      expect(await inv.invoke('{"x":1}')).toEqual({ functionError: false, payload: '{"x":1}' });
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
