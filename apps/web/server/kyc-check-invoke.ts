import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { kycKeyOwnedBy, type KycUploadCheck, type KycUploadState } from "@tc/core";
import { z } from "zod";
import { loopbackInvokerFromEnv } from "./loopback-invoker.ts";

// WPU-Y3. The invoke port of the `kyc-check` function: did one KYC upload arrive, with which size and
// content type. Like access-invoke.ts: the web tier imports no packages/aws (R1); its role may invoke the
// "web" alias of the function and nothing else (infra/stacks/web.ts); no keys, the default credential
// chain of the function role (R3). The web role keeps its Deny on GetObject and ListBucket of the kyc
// bucket (infra/stacks/storage.ts): S3 HeadObject needs s3:GetObject, so the web tier cannot ask S3 itself.
//
// The key is made by the caller from the session's customer (kycObjectKey); it is checked here before it
// is sent and again inside the function, against the customer id of this call (R8).
//
// Fail closed (R16): a missing configuration, a call that fails or hangs, a function error, a refusal of
// the function, a payload that is not JSON or not the shape below all throw one fixed message. Nothing of
// the text of a failure leaves this file (R14): the SDK message can carry an ARN or an address.

/** A Lambda function name, not an ARN and not a path. */
export const KYC_CHECK_FUNCTION_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** The alias of kyc-check that the role of the web tier may invoke (infra/stacks/web.ts). */
export const KYC_CHECK_WEB_ALIAS = "web";
const TIMEOUT_MS = 6000;
const FAILED = "kyc-check: the upload could not be checked";

/** The one call the port makes; a test passes a fake. */
export interface KycCheckInvoker {
  invoke(payload: string): Promise<{ readonly functionError: boolean; readonly payload: string }>;
}

// Exactly the two answers of functions/kyc-check/handler.ts; any other key or value is refused.
const answer = z.strictObject({
  ok: z.literal(true),
  value: z.union([
    z.strictObject({
      present: z.literal(true),
      size: z.number().int().nonnegative(),
      contentType: z.string().max(255),
    }),
    z.strictObject({ present: z.literal(false), size: z.null(), contentType: z.null() }),
  ]),
});

export function kycCheckPortFromInvoker(invoker: KycCheckInvoker): KycUploadCheck {
  return {
    async check(customerId, key): Promise<KycUploadState> {
      // R8, R16: only the session customer's own KYC key is ever sent.
      if (!kycKeyOwnedBy(key, customerId)) throw new Error(FAILED);
      let raw: { functionError: boolean; payload: string };
      try {
        raw = await invoker.invoke(JSON.stringify({ action: "head", key, caller: { customerId } }));
      } catch {
        throw new Error(FAILED);
      }
      if (raw.functionError) throw new Error(FAILED);
      let json: unknown;
      try {
        json = JSON.parse(raw.payload);
      } catch {
        throw new Error(FAILED);
      }
      const parsed = answer.safeParse(json);
      if (!parsed.success) throw new Error(FAILED);
      const value = parsed.data.value;
      return value.present
        ? { present: true, size: value.size, contentType: value.contentType }
        : { present: false };
    },
  };
}

function lambdaInvoker(region: string, functionName: string): KycCheckInvoker {
  const client = new LambdaClient({
    region,
    requestHandler: {
      connectionTimeout: 2000,
      requestTimeout: TIMEOUT_MS,
      throwOnRequestTimeout: true,
    },
    // A check reads only; one attempt keeps the submit inside its time, the customer can submit again.
    maxAttempts: 1,
  });
  return {
    async invoke(payload) {
      const out = await client.send(
        new InvokeCommand({
          FunctionName: functionName,
          // The web tier invokes the "web" alias only; the function accepts nothing on another qualifier
          // and the role may invoke no other.
          Qualifier: KYC_CHECK_WEB_ALIAS,
          InvocationType: "RequestResponse",
          Payload: new TextEncoder().encode(payload),
        }),
      );
      return {
        functionError: typeof out.FunctionError === "string" || (out.StatusCode ?? 200) >= 300,
        payload: out.Payload === undefined ? "" : new TextDecoder().decode(out.Payload),
      };
    },
  };
}

/**
 * The kyc-check port of this environment, or null when no function name is configured or it is malformed
 * (the KYC submit then refuses as unavailable, R16). The client is built on the first call, never at import.
 */
export function kycCheckPortFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  build: (region: string, functionName: string) => KycCheckInvoker = lambdaInvoker,
): KycUploadCheck | null {
  // PRO-2: in the Pro edition the function is reached over loopback; a bad Pro setting is "not
  // available", never the Lambda path (R16).
  const loop = loopbackInvokerFromEnv(env, "kyc-check");
  if (loop !== undefined) return loop === null ? null : kycCheckPortFromInvoker(loop);
  const name = env["KYC_CHECK_FUNCTION_NAME"];
  if (typeof name !== "string" || !KYC_CHECK_FUNCTION_PATTERN.test(name)) return null;
  const region = env["AWS_REGION"] || "ap-south-1";
  let invoker: KycCheckInvoker | undefined;
  return kycCheckPortFromInvoker({
    invoke: (payload) => {
      invoker ??= build(region, name);
      return invoker.invoke(payload);
    },
  });
}
