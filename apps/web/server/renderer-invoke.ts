import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { z } from "zod";
import { loopbackInvokerFromEnv } from "./loopback-invoker.ts";

// WPU-N1. The invoke port of the `invoice-renderer` function for "Download PDF". The web tier builds the
// invoice HTML (renderInvoiceHtml of @tc/core, from the stored snapshots) and hands it over with the
// session's customer id; the function turns it into a PDF, stores it for audit and, because the web tier
// has no S3 client and no presigner (R17: no new dependency), RETURNS the bytes as base64 (size-limited by
// the function, see MAX_RETURN_BYTES of functions/invoice-renderer/handler.ts). No packages/aws import
// (R1); the only AWS action of the web role for this is lambda:InvokeFunction on the "web" alias of the
// renderer (infra/stacks/web.ts). R3: the default credential chain of the function role.
//
// Fail closed (R16): a missing configuration, a call that fails or hangs, a function error, an answer that
// is not the shape below, and bytes that are not a PDF all end as `{ ok: false }`. Nothing of the text of
// a failure leaves this file (U6, R14): the SDK message can carry an ARN or an address.

export const RENDERER_FUNCTION_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** The alias of the renderer that the role of the web tier may invoke (infra/stacks/web.ts). */
export const RENDERER_WEB_ALIAS = "web";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Raw PDF bytes the web tier will serve; the function itself stops returning bytes at 3 MB. */
export const MAX_PDF_BYTES = 3 * 1024 * 1024;

export interface RendererInput {
  readonly customerId: string;
  readonly invoiceId: string;
  readonly locale: "bn" | "en";
  readonly html: string;
}
export type RendererAnswer =
  | { ok: true; pdf: Uint8Array }
  // "not_ready": the function answered but the PDF is not available to return (too large).
  | { ok: false; error: "unavailable" | "not_ready" | "validation" };

export interface RendererPort {
  render(input: RendererInput): Promise<RendererAnswer>;
}

/** The one call the port makes; a test passes a fake. */
export interface RendererInvoker {
  invoke(payload: string): Promise<{ readonly functionError: boolean; readonly payload: string }>;
}

const answer = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), pdfBase64: z.string().max(5_000_000).optional() }),
  z.object({ ok: z.literal(false) }),
]);

const UNAVAILABLE: RendererAnswer = Object.freeze({ ok: false, error: "unavailable" });
const NOT_READY: RendererAnswer = Object.freeze({ ok: false, error: "not_ready" });
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

export function rendererPortFromInvoker(invoker: RendererInvoker): RendererPort {
  return {
    async render(input) {
      if (!UUID.test(input.customerId) || !UUID.test(input.invoiceId)) {
        return { ok: false, error: "validation" };
      }
      let raw: { functionError: boolean; payload: string };
      try {
        raw = await invoker.invoke(
          JSON.stringify({
            customerId: input.customerId,
            invoiceId: input.invoiceId,
            locale: input.locale,
            html: input.html,
            returnBytes: true,
          }),
        );
      } catch {
        return UNAVAILABLE;
      }
      if (raw.functionError) return UNAVAILABLE;
      let json: unknown;
      try {
        json = JSON.parse(raw.payload);
      } catch {
        return UNAVAILABLE;
      }
      const parsed = answer.safeParse(json);
      if (!parsed.success || !parsed.data.ok) return UNAVAILABLE;
      if (parsed.data.pdfBase64 === undefined) return NOT_READY;
      const bytes = new Uint8Array(Buffer.from(parsed.data.pdfBase64, "base64"));
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_PDF_BYTES) return NOT_READY;
      if (!PDF_MAGIC.every((b, i) => bytes[i] === b)) return UNAVAILABLE;
      return { ok: true, pdf: bytes };
    },
  };
}

// A render starts a browser; the wait is longer than the reader's, still bounded.
const TIMEOUT_MS = 30_000;

function lambdaInvoker(region: string, functionName: string): RendererInvoker {
  const client = new LambdaClient({
    region,
    requestHandler: {
      connectionTimeout: 2000,
      requestTimeout: TIMEOUT_MS,
      throwOnRequestTimeout: true,
    },
    // The key is derived, so a retry would be safe, but it would double the wait of a click.
    maxAttempts: 1,
  });
  return {
    async invoke(payload) {
      const out = await client.send(
        new InvokeCommand({
          FunctionName: functionName,
          // The role may invoke this alias and no other form of the function.
          Qualifier: RENDERER_WEB_ALIAS,
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
 * The renderer of this environment, or null when no function name is configured or it is malformed
 * ("Download PDF" then says "not available"). The client is built on the first call, never at import.
 */
export function rendererPortFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  build: (region: string, functionName: string) => RendererInvoker = lambdaInvoker,
): RendererPort | null {
  // PRO-2: in the Pro edition the function is reached over loopback; a bad Pro setting is "not
  // available", never the Lambda path (R16).
  const loop = loopbackInvokerFromEnv(env, "invoice-renderer");
  if (loop !== undefined) return loop === null ? null : rendererPortFromInvoker(loop);
  const name = env["INVOICE_RENDERER_FUNCTION_NAME"];
  if (typeof name !== "string" || !RENDERER_FUNCTION_PATTERN.test(name)) return null;
  const region = env["AWS_REGION"] || "ap-south-1";
  let invoker: RendererInvoker | undefined;
  return rendererPortFromInvoker({
    invoke: (payload) => {
      invoker ??= build(region, name);
      return invoker.invoke(payload);
    },
  });
}
