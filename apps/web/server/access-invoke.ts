import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { z } from "zod";
import { loopbackInvokerFromEnv } from "./loopback-invoker.ts";

// WPU-N2. The invoke port of the `access-details` function: the Windows password, the database master
// password, a bucket access key (create) and the list of a bucket's keys. Like reader-invoke.ts: the
// web tier has no AWS provisioning client and imports no packages/aws (R1); its role may invoke the
// "web" alias of the function and nothing else (infra/stacks/web.ts); no keys, the default credential
// chain of the function role (R3). A secret cannot travel through an operation row or a queue message
// (it would be stored), so this is a direct invocation, one attempt, 6 seconds.
//
// The function takes the customer id from this call only on its "web" alias and checks the ownership
// of the resource again with its own tenant-scoped read (R8).
//
// Fail closed (R16): a missing configuration, a call that fails or hangs, a function error, a payload
// that is not JSON or not the shape below all end as `{ ok: false, error: "unavailable" }`. Nothing of
// the text of a failure leaves this file (U6, R14): the SDK message can carry an ARN or an address.
// Nothing here logs, stores or caches a secret; the answer is returned to the caller once (U9).

/** A Lambda function name, not an ARN and not a path. */
export const ACCESS_FUNCTION_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** The alias of access-details that the role of the web tier may invoke (infra/stacks/web.ts). */
export const ACCESS_WEB_ALIAS = "web";
const TIMEOUT_MS = 6000;

/** The one call the port makes; a test passes a fake. */
export interface AccessInvoker {
  invoke(payload: string): Promise<{ readonly functionError: boolean; readonly payload: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type AccessError =
  | "unauthenticated"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "limit_reached"
  | "already_created"
  | "upstream_unavailable"
  | "internal"
  | "unavailable";

const CODES: readonly AccessError[] = [
  "unauthenticated",
  "not_found",
  "validation",
  "conflict",
  "rate_limited",
  "limit_reached",
  "already_created",
  "upstream_unavailable",
  "internal",
];

export type Answer<T> = { ok: true; value: T } | { ok: false; error: AccessError };

export interface BucketKeyView {
  accessKeyId: string;
  status: "active" | "inactive";
  createdAt: string | null;
}

/** The four calls. Every one takes the session's customer id (R8) and the id of the resource. */
export interface AccessPort {
  windowsPassword(input: {
    customerId: string;
    resourceId: string;
  }): Promise<Answer<{ username: string; password: string }>>;
  databasePassword(input: {
    customerId: string;
    resourceId: string;
  }): Promise<Answer<{ username: string; password: string }>>;
  bucketKeyCreate(input: {
    customerId: string;
    resourceId: string;
    requestId: string;
  }): Promise<Answer<{ accessKeyId: string; secretAccessKey: string }>>;
  bucketKeyList(input: {
    customerId: string;
    resourceId: string;
  }): Promise<Answer<{ keys: BucketKeyView[] }>>;
}

const text = z.string().min(1).max(512);
const failure = z.object({ ok: z.literal(false), error: z.string() });
const credentials = z.object({
  ok: z.literal(true),
  value: z.object({ username: text, password: text }),
  cacheControl: z.literal("no-store"),
});
const created = z.object({
  ok: z.literal(true),
  value: z.object({ accessKeyId: text, secretAccessKey: text }),
  cacheControl: z.literal("no-store"),
});
const listed = z.object({
  ok: z.literal(true),
  value: z.object({
    keys: z
      .array(
        z.object({
          accessKeyId: text,
          status: z.enum(["active", "inactive"]),
          createdAt: z
            .string()
            .refine((s) => !Number.isNaN(Date.parse(s)))
            .nullable(),
        }),
      )
      .max(2),
  }),
});

const UNAVAILABLE = Object.freeze({ ok: false, error: "unavailable" }) as {
  ok: false;
  error: AccessError;
};

export function accessPortFromInvoker(invoker: AccessInvoker): AccessPort {
  async function call<S extends z.ZodTypeAny, T>(
    event: Record<string, unknown>,
    resourceId: string,
    ok: S,
    pick: (parsed: z.infer<S>) => T,
  ): Promise<Answer<T>> {
    // The id comes from the path: it is checked before it is sent anywhere (R9, R16).
    if (!UUID.test(resourceId)) return { ok: false, error: "validation" };
    let raw: { functionError: boolean; payload: string };
    try {
      raw = await invoker.invoke(JSON.stringify(event));
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
    const bad = failure.safeParse(json);
    if (bad.success) {
      return { ok: false, error: CODES.find((c) => c === bad.data.error) ?? "unavailable" };
    }
    const good = ok.safeParse(json);
    if (!good.success) return UNAVAILABLE;
    return { ok: true, value: pick(good.data) };
  }

  return {
    windowsPassword: ({ customerId, resourceId }) =>
      call(
        { action: "windows_password", resourceId, caller: { customerId } },
        resourceId,
        credentials,
        (p) => ({ username: p.value.username, password: p.value.password }),
      ),
    databasePassword: ({ customerId, resourceId }) =>
      call(
        { action: "database_password", resourceId, caller: { customerId } },
        resourceId,
        credentials,
        (p) => ({ username: p.value.username, password: p.value.password }),
      ),
    bucketKeyCreate: ({ customerId, resourceId, requestId }) =>
      UUID.test(requestId)
        ? call(
            { action: "bucket_key_create", resourceId, requestId, caller: { customerId } },
            resourceId,
            created,
            (p) => ({
              accessKeyId: p.value.accessKeyId,
              secretAccessKey: p.value.secretAccessKey,
            }),
          )
        : Promise.resolve({ ok: false, error: "validation" } as const),
    bucketKeyList: ({ customerId, resourceId }) =>
      call(
        { action: "bucket_key_list", resourceId, caller: { customerId } },
        resourceId,
        listed,
        (p) => ({ keys: p.value.keys.map((k) => ({ ...k })) }),
      ),
  };
}

function lambdaInvoker(region: string, functionName: string): AccessInvoker {
  const client = new LambdaClient({
    region,
    requestHandler: {
      connectionTimeout: 2000,
      requestTimeout: TIMEOUT_MS,
      throwOnRequestTimeout: true,
    },
    // A reveal is not idempotent and a key create must not be repeated by the SDK: one attempt.
    maxAttempts: 1,
  });
  return {
    async invoke(payload) {
      const out = await client.send(
        new InvokeCommand({
          FunctionName: functionName,
          // The web tier invokes the "web" alias only; the function accepts customerId on it alone and
          // the role may invoke no other alias.
          Qualifier: ACCESS_WEB_ALIAS,
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
 * The access port of this environment, or null when no function name is configured or it is malformed
 * (the screens then say "not available"). The client is built on the first call, never at import.
 */
export function accessPortFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  build: (region: string, functionName: string) => AccessInvoker = lambdaInvoker,
): AccessPort | null {
  // PRO-2: in the Pro edition the function is reached over loopback; a bad Pro setting is "not
  // available", never the Lambda path (R16).
  const loop = loopbackInvokerFromEnv(env, "access-details");
  if (loop !== undefined) return loop === null ? null : accessPortFromInvoker(loop);
  const name = env["ACCESS_DETAILS_FUNCTION_NAME"];
  if (typeof name !== "string" || !ACCESS_FUNCTION_PATTERN.test(name)) return null;
  const region = env["AWS_REGION"] || "ap-south-1";
  let invoker: AccessInvoker | undefined;
  return accessPortFromInvoker({
    invoke: (payload) => {
      invoker ??= build(region, name);
      return invoker.invoke(payload);
    },
  });
}
