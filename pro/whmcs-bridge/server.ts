import { createHmac, timingSafeEqual } from "node:crypto";
import { chmodSync } from "node:fs";
import { createServer, type Server } from "node:http";

// PRO-6. The one endpoint WHMCS calls: POST /bridge/whmcs/invoice-paid {"invoiceId":"123"}, from the
// InvoicePaid hook of pro/whmcs. Caddy forwards it from the panel host to this Unix socket.
//
// The signature (HMAC-SHA256 of "<timestamp>.<body>" with the bridge secret, 5-minute window) only says
// "this came from the reseller's WHMCS"; it decides no money. The credit is decided from the WHMCS API
// (credit.ts), so a replayed or forged call can at most make the bridge look at an invoice again.
// A global limit keeps a flood from turning into WHMCS API calls. Fixed answers only (R14).

export const SIGNATURE_HEADER = "x-tc-signature";
export const TIMESTAMP_HEADER = "x-tc-timestamp";
const WINDOW_S = 300;
const MAX_BODY = 1024;
const PATH = "/bridge/whmcs/invoice-paid";

export interface BridgeRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

export function sign(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function createBridgeHandler(options: {
  readonly secret: string;
  readonly clock: { now(): Date };
  readonly credit: (invoiceId: string) => Promise<string>;
  readonly perMinute?: number;
}): (req: BridgeRequest) => Promise<{ status: number; body: string }> {
  if (options.secret.length < 32) throw new Error("bridge secret too short");
  const limit = options.perMinute ?? 60;
  let windowStart = 0;
  let count = 0;
  const reply = (status: number, body: Record<string, string>) => ({
    status,
    body: JSON.stringify(body),
  });

  return async (req) => {
    if (req.path !== PATH) return reply(404, { error: "not_found" });
    if (req.method !== "POST") return reply(405, { error: "method" });
    if (Buffer.byteLength(req.body) > MAX_BODY) return reply(413, { error: "too_large" });

    const ts = req.headers[TIMESTAMP_HEADER];
    const sig = req.headers[SIGNATURE_HEADER];
    const now = Math.floor(options.clock.now().getTime() / 1000);
    if (
      typeof ts !== "string" ||
      !/^[0-9]{9,11}$/.test(ts) ||
      Math.abs(now - Number(ts)) > WINDOW_S
    ) {
      return reply(401, { error: "unauthenticated" });
    }
    const expected = Buffer.from(sign(options.secret, ts, req.body), "hex");
    const given =
      typeof sig === "string" && /^[0-9a-f]{64}$/.test(sig) ? Buffer.from(sig, "hex") : null;
    if (given === null || !timingSafeEqual(given, expected))
      return reply(401, { error: "unauthenticated" });

    const minute = Math.floor(now / 60);
    if (minute !== windowStart) {
      windowStart = minute;
      count = 0;
    }
    if (++count > limit) return reply(429, { error: "rate_limited" });

    let invoiceId: unknown;
    try {
      invoiceId = (JSON.parse(req.body) as { invoiceId?: unknown }).invoiceId;
    } catch {
      return reply(400, { error: "validation" });
    }
    if (typeof invoiceId !== "string" || !/^[1-9][0-9]{0,9}$/.test(invoiceId)) {
      return reply(400, { error: "validation" });
    }
    const kind = await options.credit(invoiceId);
    return reply(200, { kind });
  };
}

/** Listens on a Unix socket in the bridge's runtime directory (mode 0660, group caddy). */
export function startBridgeServer(options: {
  readonly socketPath: string;
  readonly handle: (req: BridgeRequest) => Promise<{ status: number; body: string }>;
}): Server {
  if (
    !/^\/[A-Za-z0-9._/-]{1,100}\.sock$/.test(options.socketPath) ||
    options.socketPath.includes("..")
  ) {
    throw new Error("bridge socket path is not valid");
  }
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        res.writeHead(413, { "content-type": "application/json" }).end('{"error":"too_large"}');
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (size > MAX_BODY) return;
      options
        .handle({
          method: req.method ?? "",
          path: (req.url ?? "").split("?")[0] ?? "",
          headers: req.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        })
        .then((out) =>
          res.writeHead(out.status, { "content-type": "application/json" }).end(out.body),
        )
        .catch(() =>
          res.writeHead(500, { "content-type": "application/json" }).end('{"error":"internal"}'),
        );
    });
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.listen(options.socketPath, () => chmodSync(options.socketPath, 0o660));
  return server;
}
