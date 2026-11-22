import { describe, expect, it } from "vitest";
import {
  createInvokeHandler,
  isLoopbackHost,
  INVOKE_TOKEN_HEADER,
  startInvokeServer,
} from "./invoke-server";

const TOKEN = "t".repeat(48);

function handlerWith(
  fn: (event: unknown, ctx: { invokedFunctionArn: string }) => Promise<unknown>,
) {
  const calls: { event: unknown; arn: string }[] = [];
  const logs: Record<string, unknown>[] = [];
  const handle = createInvokeHandler({
    token: TOKEN,
    region: "ap-south-1",
    log: (e) => logs.push(e),
    functions: {
      reader: async (event, ctx) => {
        calls.push({ event, arn: ctx.invokedFunctionArn });
        return fn(event, ctx);
      },
    },
  });
  return { handle, calls, logs };
}

const ok = (body: string, headers: Record<string, string> = { [INVOKE_TOKEN_HEADER]: TOKEN }) => ({
  method: "POST",
  path: "/invoke/reader",
  headers,
  body,
});

describe("createInvokeHandler", () => {
  it("runs the named function with the web alias in the ARN and returns its JSON", async () => {
    const { handle, calls } = handlerWith(async () => ({ ok: true, value: { series: [] } }));
    const res = await handle(ok(JSON.stringify({ action: "metrics" })));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, value: { series: [] } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.event).toEqual({ action: "metrics" });
    // The tier is fixed by the server, never by the request (WPU-S6).
    expect(calls[0]!.arn).toBe("arn:aws:lambda:ap-south-1:000000000000:function:tc-pro-reader:web");
  });

  it("refuses a missing or wrong token without running anything", async () => {
    const { handle, calls } = handlerWith(async () => ({}));
    expect((await handle(ok("{}", {}))).status).toBe(401);
    expect((await handle(ok("{}", { [INVOKE_TOKEN_HEADER]: "x".repeat(48) }))).status).toBe(401);
    expect((await handle(ok("{}", { [INVOKE_TOKEN_HEADER]: TOKEN.slice(1) }))).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("refuses an unknown function, another path or another method", async () => {
    const { handle, calls } = handlerWith(async () => ({}));
    expect((await handle({ ...ok("{}"), path: "/invoke/provisioner" })).status).toBe(404);
    expect((await handle({ ...ok("{}"), path: "/invoke/reader/../provisioner" })).status).toBe(404);
    expect((await handle({ ...ok("{}"), path: "/invoke/__proto__" })).status).toBe(404);
    expect((await handle({ ...ok("{}"), method: "GET" })).status).toBe(405);
    expect(calls).toHaveLength(0);
  });

  it("refuses a body that is not JSON or is too large", async () => {
    const { handle, calls } = handlerWith(async () => ({}));
    expect((await handle(ok("not json"))).status).toBe(400);
    expect((await handle(ok(JSON.stringify({ a: "x".repeat(300_000) })))).status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it("turns a thrown error into a fixed 502 and logs no message", async () => {
    const { handle, logs } = handlerWith(async () => {
      throw new Error("arn:aws:iam::123456789012:role/secret");
    });
    const res = await handle(ok("{}"));
    expect(res.status).toBe(502);
    expect(res.body).toBe('{"error":"function_error"}');
    expect(JSON.stringify(logs)).not.toContain("123456789012");
    expect(logs).toContainEqual({ event: "invoke_failed", fn: "reader" });
  });
});

describe("isLoopbackHost", () => {
  it("accepts loopback addresses only", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("localhost")).toBe(false);
    expect(isLoopbackHost("10.0.0.5")).toBe(false);
  });
});

describe("startInvokeServer", () => {
  it("refuses a non-loopback host", () => {
    const handle = async () => ({ status: 200, body: "{}" });
    expect(() => startInvokeServer({ host: "0.0.0.0", port: 9701, handle })).toThrow();
  });

  it("answers over 127.0.0.1", async () => {
    const { handle } = handlerWith(async () => ({ ok: true }));
    const server = startInvokeServer({ host: "127.0.0.1", port: 0 + 19_731, handle });
    await new Promise((r) => server.once("listening", r));
    try {
      const res = await fetch("http://127.0.0.1:19731/invoke/reader", {
        method: "POST",
        headers: { [INVOKE_TOKEN_HEADER]: TOKEN },
        body: "{}",
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
