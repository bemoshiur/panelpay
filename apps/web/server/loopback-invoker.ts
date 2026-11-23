import { request } from "node:http";

// PRO-2 (Unix socket since the PRO-5 security review, M2). In the Pro edition (one EC2, no Lambda), the
// four invoke ports of the web tier reach the functions through the worker's local server
// (pro/worker/invoke-server.ts) instead of lambda:InvokeFunction. That server listens on a Unix socket in
// the worker's own runtime directory, so no other local user can take its place while it restarts.
// This file imports nothing of pro/ or packages/aws (R1): it is a plain HTTP client with the same
// { functionError, payload } answer as the Lambda invoker, so the ports are unchanged.
//
// - PRO_INVOKE_SOCKET unset: not the Pro edition; the caller keeps its Lambda path (undefined).
// - PRO_INVOKE_SOCKET set but not an absolute .sock path, or a token shorter than 32 characters: the port
//   is unavailable (null), never a fallback to Lambda or a network address (R16).
// - No error text leaves this file (R14): a failed request rejects, and each port turns that into its
//   fixed "not available" answer.

export const PRO_INVOKE_TOKEN_HEADER = "x-tc-invoke-token";
const MIN_TOKEN_LENGTH = 32;
const TIMEOUT_MS = 6000;
const MAX_ANSWER_BYTES = 8 * 1024 * 1024;
const SOCKET_PATH = /^\/[A-Za-z0-9._/-]{1,100}\.sock$/;

export type LoopbackFunction = "reader" | "access-details" | "kyc-check" | "invoice-renderer";

export interface LoopbackInvoker {
  invoke(payload: string): Promise<{ readonly functionError: boolean; readonly payload: string }>;
}

/** One POST over the socket; the test passes a fake. */
export type SocketPost = (
  socketPath: string,
  path: string,
  headers: Readonly<Record<string, string>>,
  body: string,
) => Promise<{ readonly status: number; readonly body: string }>;

const socketPost: SocketPost = (socketPath, path, headers, body) =>
  new Promise((resolve, reject) => {
    const req = request(
      { socketPath, path, method: "POST", headers, timeout: TIMEOUT_MS },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_ANSWER_BYTES) {
            req.destroy();
            reject(new Error("answer too large"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
        );
        res.on("error", () => reject(new Error("invoke failed")));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => reject(new Error("invoke failed")));
    req.end(body);
  });

export function loopbackInvokerFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  fn: LoopbackFunction,
  post: SocketPost = socketPost,
): LoopbackInvoker | null | undefined {
  const socketPath = env["PRO_INVOKE_SOCKET"];
  if (socketPath === undefined || socketPath === "") return undefined;
  if (!SOCKET_PATH.test(socketPath) || socketPath.includes("..")) return null;
  const token = env["PRO_INVOKE_TOKEN"];
  if (typeof token !== "string" || token.length < MIN_TOKEN_LENGTH) return null;
  return {
    async invoke(payload) {
      const res = await post(
        socketPath,
        `/invoke/${fn}`,
        {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(payload, "utf8")),
          [PRO_INVOKE_TOKEN_HEADER]: token,
        },
        payload,
      );
      return { functionError: res.status !== 200, payload: res.body };
    },
  };
}
