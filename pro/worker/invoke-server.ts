import { timingSafeEqual } from "node:crypto";
import { chmodSync } from "node:fs";
import { createServer, type Server } from "node:http";

// PRO-2. On the single EC2 of the Pro edition, the web tier calls the four read/check functions over the
// loopback interface instead of lambda:InvokeFunction. This server stands in for the Lambda invoke API:
//
// - It listens on a Unix socket in the worker's own runtime directory; nothing off the box can reach it.
// - Every call carries a shared token (root-only env file, PRO-3) compared in constant time.
// - Only the named functions exist; the provisioner and the jobs are never reachable here (R1).
// - The tier is fixed by this server to "web": the handler gets an ARN with the "web" alias, as Lambda
//   would give it for the web role's invoke. The request cannot choose a tier (WPU-S6).
// - A thrown error is a fixed 502; no message or stack reaches the response or the log (R14, U6).

export const INVOKE_TOKEN_HEADER = "x-tc-invoke-token";
export const MAX_BODY_BYTES = 256 * 1024;
const MIN_TOKEN_LENGTH = 32;

export type InvokeFunction = (
  event: unknown,
  context: { readonly invokedFunctionArn: string },
) => Promise<unknown>;

export interface InvokeRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

export interface InvokeResponse {
  readonly status: number;
  readonly body: string;
}

const NAME = /^\/invoke\/([a-z][a-z-]{0,40})$/;
const reply = (status: number, error: string): InvokeResponse => ({
  status,
  body: JSON.stringify({ error }),
});

function sameToken(expected: Buffer, given: unknown): boolean {
  if (typeof given !== "string") return false;
  const g = Buffer.from(given, "utf8");
  if (g.length !== expected.length) return false;
  return timingSafeEqual(g, expected);
}

export function createInvokeHandler(options: {
  readonly token: string;
  readonly region: string;
  readonly functions: Readonly<Record<string, InvokeFunction>>;
  readonly log: (e: Record<string, unknown>) => void;
}): (req: InvokeRequest) => Promise<InvokeResponse> {
  if (options.token.length < MIN_TOKEN_LENGTH) throw new Error("invoke token too short");
  const expected = Buffer.from(options.token, "utf8");
  // A plain map with no prototype: "__proto__" or "constructor" is never a function name.
  const table = new Map(Object.entries(options.functions));

  return async (req) => {
    if (!sameToken(expected, req.headers[INVOKE_TOKEN_HEADER]))
      return reply(401, "unauthenticated");
    const m = NAME.exec(req.path);
    const name = m?.[1];
    const fn = name === undefined ? undefined : table.get(name);
    if (name === undefined || fn === undefined) return reply(404, "not_found");
    if (req.method !== "POST") return reply(405, "method");
    if (Buffer.byteLength(req.body, "utf8") > MAX_BODY_BYTES) return reply(413, "too_large");
    let event: unknown;
    try {
      event = JSON.parse(req.body);
    } catch {
      return reply(400, "validation");
    }
    const invokedFunctionArn = `arn:aws:lambda:${options.region}:000000000000:function:tc-pro-${name}:web`;
    try {
      const out = await fn(event, { invokedFunctionArn });
      return { status: 200, body: JSON.stringify(out ?? null) };
    } catch {
      options.log({ event: "invoke_failed", fn: name });
      return reply(502, "function_error");
    }
  };
}

/**
 * Starts the HTTP listener on a Unix socket (security review M2): only the worker can create it, in its
 * own RuntimeDirectory (/run/tc-invoke, 0750, group tc), so no other local user can take it over while
 * the worker restarts, and nothing off the box can reach it. Mode 0660 after listen.
 */
export function startInvokeServer(options: {
  readonly socketPath: string;
  readonly handle: (req: InvokeRequest) => Promise<InvokeResponse>;
}): Server {
  if (
    !/^\/[A-Za-z0-9._/-]{1,100}\.sock$/.test(options.socketPath) ||
    options.socketPath.includes("..")
  ) {
    throw new Error("invoke socket path is not valid");
  }
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        res.writeHead(413, { "content-type": "application/json" }).end('{"error":"too_large"}');
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (aborted) return;
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
  server.listen(options.socketPath, () => {
    chmodSync(options.socketPath, 0o660);
  });
  return server;
}
