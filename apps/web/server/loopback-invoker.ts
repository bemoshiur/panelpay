// PRO-2. In the Pro edition (one EC2, no Lambda), the four invoke ports of the web tier reach the
// functions through the worker's loopback server (pro/worker/invoke-server.ts) instead of
// lambda:InvokeFunction. This file imports nothing of pro/ or packages/aws (R1): it is a plain HTTP client
// with the same { functionError, payload } answer as the Lambda invoker, so the ports are unchanged.
//
// - PRO_INVOKE_URL unset: not the Pro edition; the caller keeps its Lambda path (undefined).
// - PRO_INVOKE_URL set but not exactly http://127.0.0.1:<port> or http://[::1]:<port>, or a token shorter
//   than 32 characters: the port is unavailable (null), never a fallback to another host (R16).
// - No error text leaves this file (R14): a failed request throws, and each port turns that into its
//   fixed "not available" answer.

export const PRO_INVOKE_TOKEN_HEADER = "x-tc-invoke-token";
const MIN_TOKEN_LENGTH = 32;
const TIMEOUT_MS = 6000;
const LOOPBACK_ORIGIN = /^http:\/\/(127\.0\.0\.1|\[::1\]):([0-9]{4,5})$/;

export type LoopbackFunction = "reader" | "access-details" | "kyc-check" | "invoice-renderer";

export interface LoopbackInvoker {
  invoke(payload: string): Promise<{ readonly functionError: boolean; readonly payload: string }>;
}

export function loopbackInvokerFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  fn: LoopbackFunction,
  fetcher: typeof fetch = fetch,
): LoopbackInvoker | null | undefined {
  const url = env["PRO_INVOKE_URL"];
  if (url === undefined || url === "") return undefined;
  const m = LOOPBACK_ORIGIN.exec(url);
  const port = m === null ? NaN : Number(m[2]);
  if (m === null || port < 1024 || port > 65535) return null;
  const token = env["PRO_INVOKE_TOKEN"];
  if (typeof token !== "string" || token.length < MIN_TOKEN_LENGTH) return null;
  const target = `${url}/invoke/${fn}`;
  return {
    async invoke(payload) {
      const res = await fetcher(target, {
        method: "POST",
        headers: { "content-type": "application/json", [PRO_INVOKE_TOKEN_HEADER]: token },
        body: payload,
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await res.text();
      return { functionError: res.status !== 200, payload: text };
    },
  };
}
