import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { z } from "zod";
import { loopbackInvokerFromEnv } from "./loopback-invoker.ts";
import { TARGET_HEALTH_WORDS, TARGET_REASON_WORDS } from "./extras-view.ts";
import type {
  DatabaseSeriesView,
  MetricRangeKey,
  MetricSeriesView,
  ReaderPort,
  TargetHealthReportView,
} from "./extras-view.ts";

// WPU-G4. The invoke port of the `reader` function (WP5-T3) for the Metrics tab. The contract of F is
// the function itself: `metrics(resourceId, caller, range)` with `caller = { customerId }`, and the
// function checks the ownership by itself (R8). The web tier has no AWS provisioning client and imports
// no packages/aws (R1); the only AWS action of its role for this is lambda:InvokeFunction on the
// reader (infra/stacks/web.ts). R3: no keys, the default credential chain of the function role.
//
// Fail closed (R16): a missing configuration, a call that fails or hangs, a function error, a payload
// that is not JSON or not the shape below all end as `{ ok: false }`, and the tab shows its "not
// available" state. Nothing of the text of a failure leaves this file (U6, R14): the SDK message can
// carry an ARN or an address.

/** A Lambda function name, not an ARN and not a path. */
export const READER_FUNCTION_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** The one call the port makes; a test passes a fake. */
export interface ReaderInvoker {
  invoke(payload: string): Promise<{ readonly functionError: boolean; readonly payload: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_POINTS = 2000;
const MAX_SERIES = 8;

const point = z.object({
  at: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
  value: z.number().finite(),
});
const series = z.object({
  metric: z.enum(["cpu", "networkIn", "networkOut", "statusCheckFailed"]),
  unit: z.enum(["percent", "bytes", "count"]),
  points: z.array(point).max(MAX_POINTS),
});
const answer = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    value: z.object({ series: z.array(series).max(MAX_SERIES) }),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

// WPU-Y8. The two added reads. Closed word lists: a word the platform does not know fails the parse and
// the tab shows "not available" (R16). At most 20 targets (the product limit).
const healthWord = z.enum(TARGET_HEALTH_WORDS as [string, ...string[]]);
const targetHealthAnswer = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    value: z.object({
      live: z.boolean(),
      checkedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
      targets: z
        .array(
          z.object({
            targetResourceId: z.string().regex(UUID),
            health: healthWord,
            reason: z.enum(TARGET_REASON_WORDS).nullable(),
          }),
        )
        .max(20),
      counts: z.object(
        Object.fromEntries(
          TARGET_HEALTH_WORDS.map((w) => [w, z.number().int().min(0).max(20)]),
        ) as Record<string, z.ZodNumber>,
      ),
      unresolved: z.number().int().min(0).max(1000),
    }),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
const dbSeries = z.object({
  metric: z.enum(["cpu", "connections", "freeStorage", "diskQueue"]),
  unit: z.enum(["percent", "bytes", "count"]),
  statistic: z.enum(["average", "maximum", "minimum"]),
  periodSeconds: z.number().int().min(60).max(86_400),
  points: z.array(point).max(MAX_POINTS),
});
const databaseAnswer = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    value: z.object({ series: z.array(dbSeries).max(MAX_SERIES) }),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

const READER_CODES = [
  "unauthenticated",
  "not_found",
  "validation",
  "rate_limited",
  "upstream_unavailable",
  "internal",
] as const;

type MetricsAnswer = Awaited<ReturnType<ReaderPort["metrics"]>>;
const UNAVAILABLE: MetricsAnswer = Object.freeze({ ok: false, error: "unavailable" });

/** One call of the reader: the payload goes out, JSON comes back, anything else is null (R16). */
async function callReader(invoker: ReaderInvoker, payload: Record<string, unknown>) {
  let raw: { functionError: boolean; payload: string };
  try {
    raw = await invoker.invoke(JSON.stringify(payload));
  } catch {
    return null;
  }
  if (raw.functionError) return null;
  try {
    return JSON.parse(raw.payload) as unknown;
  } catch {
    return null;
  }
}

const codeOf = (error: string): string => READER_CODES.find((c) => c === error) ?? "unavailable";

export function readerPortFromInvoker(invoker: ReaderInvoker): ReaderPort {
  return {
    async targetHealth(resourceId, caller) {
      if (!UUID.test(resourceId)) return { ok: false, error: "validation" };
      const json = await callReader(invoker, {
        action: "targetHealth",
        resourceId,
        caller: { customerId: caller.customerId },
      });
      const parsed = targetHealthAnswer.safeParse(json);
      if (!parsed.success) return { ok: false, error: "unavailable" };
      if (!parsed.data.ok) return { ok: false, error: codeOf(parsed.data.error) };
      const v = parsed.data.value;
      const report: TargetHealthReportView = {
        live: v.live,
        checkedAt: v.checkedAt,
        targets: v.targets.map((x) => ({
          targetResourceId: x.targetResourceId,
          health: x.health as TargetHealthReportView["targets"][number]["health"],
          reason: x.reason,
        })),
        counts: v.counts as TargetHealthReportView["counts"],
        unresolved: v.unresolved,
      };
      return { ok: true, report };
    },

    async databaseMetrics(resourceId, caller, range) {
      if (!UUID.test(resourceId)) return { ok: false, error: "validation" };
      const json = await callReader(invoker, {
        action: "databaseMetrics",
        resourceId,
        caller: { customerId: caller.customerId },
        range,
      });
      const parsed = databaseAnswer.safeParse(json);
      if (!parsed.success) return { ok: false, error: "unavailable" };
      if (!parsed.data.ok) return { ok: false, error: codeOf(parsed.data.error) };
      const series: DatabaseSeriesView[] = parsed.data.value.series.map((s) => ({
        metric: s.metric,
        unit: s.unit,
        statistic: s.statistic,
        periodSeconds: s.periodSeconds,
        points: s.points.map((p) => ({ at: p.at, value: p.value })),
      }));
      return { ok: true, series };
    },

    async metrics(
      resourceId: string,
      caller: { customerId: string },
      range: MetricRangeKey,
    ): Promise<MetricsAnswer> {
      // The id comes from the path: it is checked before it is sent anywhere (R9, R16).
      if (!UUID.test(resourceId)) return { ok: false, error: "validation" };
      let raw: { functionError: boolean; payload: string };
      try {
        raw = await invoker.invoke(
          JSON.stringify({
            action: "metrics",
            resourceId,
            // Only the session's customer id: no key of the request is carried on (R8).
            caller: { customerId: caller.customerId },
            range,
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
      if (!parsed.success) return UNAVAILABLE;
      if (!parsed.data.ok) {
        const code = READER_CODES.find((c) => c === (parsed.data as { error: string }).error);
        return { ok: false, error: code ?? "unavailable" };
      }
      const views: MetricSeriesView[] = parsed.data.value.series.map((s) => ({
        metric: s.metric,
        unit: s.unit,
        points: s.points.map((p) => ({ at: p.at, value: p.value })),
      }));
      return { ok: true, series: views };
    },
  };
}

const TIMEOUT_MS = 6000;
/** The alias of the reader that the role of the web tier may invoke (infra/stacks/web.ts). */
export const READER_WEB_ALIAS = "web";

function lambdaInvoker(region: string, functionName: string): ReaderInvoker {
  const client = new LambdaClient({
    region,
    requestHandler: {
      connectionTimeout: 2000,
      requestTimeout: TIMEOUT_MS,
      throwOnRequestTimeout: true,
    },
    // The reader is read-only and idempotent, but a retry would double the wait of a page.
    maxAttempts: 1,
  });
  return {
    async invoke(payload) {
      const out = await client.send(
        new InvokeCommand({
          FunctionName: functionName,
          // WPU-S6: the web tier invokes the "web" alias only; the reader accepts customerId on it alone
          // and the role may invoke no other alias.
          Qualifier: READER_WEB_ALIAS,
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
 * The reader of this environment, or null when no function name is configured or it is malformed (the
 * tab then says "not available"). The client is built on the first call, never at import.
 */
export function readerPortFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  build: (region: string, functionName: string) => ReaderInvoker = lambdaInvoker,
): ReaderPort | null {
  // PRO-2: in the Pro edition the function is reached over loopback; a bad Pro setting is "not
  // available", never the Lambda path (R16).
  const loop = loopbackInvokerFromEnv(env, "reader");
  if (loop !== undefined) return loop === null ? null : readerPortFromInvoker(loop);
  const name = env["READER_FUNCTION_NAME"];
  if (typeof name !== "string" || !READER_FUNCTION_PATTERN.test(name)) return null;
  const region = env["AWS_REGION"] || "ap-south-1";
  let invoker: ReaderInvoker | undefined;
  return readerPortFromInvoker({
    invoke: (payload) => {
      invoker ??= build(region, name);
      return invoker.invoke(payload);
    },
  });
}
