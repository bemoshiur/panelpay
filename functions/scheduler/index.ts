import { QUEUE_URL_PATTERN, createSqsClient, createSqsSend } from "@tc/aws";
import {
  createFifoQueue,
  markPlanChangeFailed,
  runInvoiceBacklog,
  runFxRateWatch,
  runLifecycle,
  runMetering,
  type FxWatchReport,
  runPolling,
  runStaticIpMetering,
  runUnpaid,
  unpaidDue,
  sweepOperations,
  runDnsDelegation,
  type DnsDelegationReport,
  type NsLookup,
  type InvoiceBacklogReport,
  type LifecycleReport,
  type MeteringReport,
  type PollingReport,
  type StaticIpReport,
  type UnpaidReport,
  type NoticeWriter,
  type LogEvent,
  type OperationQueue,
  type Logger,
  type AttentionHook,
  type SweepDeps,
  type SweepReport,
} from "@tc/core";
import { purgeRateLimits, withTx } from "@tc/db";
import { notify } from "@tc/notify";
import {
  createDelegationStore,
  createNsLookup,
  dnsDelegationDue,
  nodeNsResolver,
} from "./dns-delegation";

// Longest rate-limit window is 86400 s (packages/db rate-limit): a window that started two days ago is over.
export const RATE_LIMIT_RETENTION_MS = 2 * 86_400_000;

// WPU-S2: an apply of a pending plan whose lease ran out for the last time ends in needs_attention in
// the sweep; the plan is then marked failed so that the renewal stops quoting its price.
export const planChangeAttention: AttentionHook = markPlanChangeFailed;

// WPU-Y3: the messages of the unpaid-usage rule and the low-wallet reminder are templates of
// @tc/notify; core writes them through this port (it cannot import notify). The template names of the
// notice are a subset of TemplateId (a test in @tc/notify pins it).
export const noticeWriter: NoticeWriter = (tx, n) =>
  notify(tx, {
    customerId: n.customerId,
    template: n.template,
    data: n.data,
    dedupeKey: n.dedupeKey,
  });

export interface SchedulerDnsDeps {
  /** WPU-D4: the NS lookup of the delegation job. Without it the job does not run. */
  readonly dnsLookup?: (name: string) => Promise<NsLookup>;
}

export interface SchedulerReport {
  readonly dnsDelegation: DnsDelegationReport | null;
  readonly sweep: SweepReport | null;
  readonly lifecycle: LifecycleReport | null;
  readonly metering: MeteringReport | null;
  readonly staticIps: StaticIpReport | null;
  readonly unpaid: UnpaidReport | null;
  readonly invoices: InvoiceBacklogReport | null;
  readonly polling: PollingReport | null;
  readonly fxWatch: FxWatchReport | null;
  readonly rateLimitsPurged: number | null;
}

// Every run does the jobs of 3.2 in order: the operations sweep, the lifecycle pass (section
// 11), the metering pass (WP7-T5), the unattached static IP pass (WPU-M1), the owed invoices (WPU-I2) and the purge of old rate-limit windows. One failing job does not stop the others; the run
// then rejects, so the error metric of the function moves (R16).
export function createHandler(
  deps: SweepDeps & { log: Logger } & SchedulerDnsDeps,
): () => Promise<SchedulerReport> {
  return async () => {
    let dnsDelegation: DnsDelegationReport | null = null;
    let sweep: SweepReport | null = null;
    let lifecycle: LifecycleReport | null = null;
    let metering: MeteringReport | null = null;
    let staticIps: StaticIpReport | null = null;
    let unpaid: UnpaidReport | null = null;
    let invoices: InvoiceBacklogReport | null = null;
    let polling: PollingReport | null = null;
    let fxWatch: FxWatchReport | null = null;
    let rateLimitsPurged: number | null = null;
    const failed: string[] = [];
    const job = async (name: string, fn: () => Promise<void>): Promise<void> => {
      try {
        await fn();
      } catch (error) {
        failed.push(name);
        deps.log({
          event: "scheduler_job_failed",
          job: name,
          error: error instanceof Error ? error.name : "unknown",
        });
      }
    };
    await job("sweep", async () => {
      sweep = await sweepOperations(deps);
      deps.log({ event: "sweep", ...sweep });
    });
    await job("lifecycle", async () => {
      lifecycle = await runLifecycle({
        runTx: deps.runTx,
        clock: deps.clock,
        queue: deps.queue,
        log: deps.log,
        notice: noticeWriter,
      });
      deps.log({ event: "lifecycle_run", ...lifecycle });
    });
    await job("metering", async () => {
      metering = await runMetering({ runTx: deps.runTx, clock: deps.clock, log: deps.log });
      deps.log({ event: "metering_run", ...metering });
      // A row that failed makes the run reject (R16); a missing price is only reported in the log line.
      if (metering.failed > 0) throw new Error("scheduler: metering rows failed");
    });
    // WPU-M1: the hourly charge of a static IP that is not attached (one ledger charge for each IP and hour).
    await job("static_ip_metering", async () => {
      staticIps = await runStaticIpMetering({
        runTx: deps.runTx,
        clock: deps.clock,
        log: deps.log,
      });
      deps.log({ event: "static_ip_metering_run", ...staticIps });
      if (staticIps.failed > 0) throw new Error("scheduler: static ip rows failed");
    });
    // WPU-Y3: the unpaid usage charges. Every run tries every unpaid period again (no window), suspends at
    // 1 day, retains at 7 days (the destroy waits for an admin until the end date of R13), restores on
    // payment and writes one message for each resource and unpaid day. Off until the setting
    // `lifecycle_unpaid_enabled` is true (R12). The run key is `unpaid:<Dhaka day>`; every effect has a
    // key of its own, so a repeat of the run on the same day changes nothing (R7).
    // WPU-Y3b: once a Dhaka day (the first minutes of 07:00), not every minute, so the cost does not grow
    // with the time a charge has been unpaid. Repeats inside the window are replays by the keys.
    if (unpaidDue(deps.clock.now())) {
      await job("unpaid", async () => {
        unpaid = await runUnpaid({
          runTx: deps.runTx,
          clock: deps.clock,
          queue: deps.queue,
          log: deps.log,
          notice: noticeWriter,
        });
        deps.log({ event: "unpaid_run", ...unpaid });
        if (unpaid.failed > 0) throw new Error("scheduler: unpaid rows failed");
      });
    }
    // WPU-I2: the tax invoices that were owed while the seller details were missing, oldest first. A seller
    // that is still missing is not a failure of the job (the notice is in the admin queue); an invoice
    // that was refused for another reason, or a queue row that cannot be read, is.
    await job("invoice_backlog", async () => {
      invoices = await runInvoiceBacklog({ runTx: deps.runTx, clock: deps.clock, log: deps.log });
      deps.log({ event: "invoice_backlog_run", ...invoices });
      if (invoices.failed > 0 || invoices.unreadable > 0) {
        throw new Error("scheduler: invoice backlog rows failed");
      }
    });
    // WPU-B3: the parameter list of each database once a day and the waiting certificates once an hour, as
    // operation rows (R1). A list that cannot be read, or an operation that cannot be written, fails the job.
    await job("polling", async () => {
      polling = await runPolling({
        runTx: deps.runTx,
        clock: deps.clock,
        queue: deps.queue,
        log: deps.log,
      });
      deps.log({ event: "polling_run", ...polling });
      if (polling.failed > 0) throw new Error("scheduler: polling rows failed");
    });
    // WPU-D4 (audit C.24): zones that wait for delegation. A lookup that fails is not a failure of the
    // job; a write that fails is. Runs in one run out of ten.
    const lookup = deps.dnsLookup;
    if (lookup !== undefined && dnsDelegationDue(deps.clock.now())) {
      await job("dns_delegation", async () => {
        dnsDelegation = await runDnsDelegation({
          store: createDelegationStore(deps.runTx),
          lookup,
          clock: deps.clock,
          log: deps.log,
          queue: deps.queue,
        });
        deps.log({ event: "dns_delegation_run", ...dnsDelegation });
        if (dnsDelegation.failed > 0) throw new Error("scheduler: dns delegation rows failed");
      });
    }
    // WPU-Y1: the exchange rate is set by hand. Older than 6 days (or missing) writes the daily alert line.
    await job("fx_rate_watch", async () => {
      fxWatch = await runFxRateWatch({ runTx: deps.runTx, clock: deps.clock, log: deps.log });
      if (fxWatch.alerted > 0) {
        deps.log({
          event: "fx_rate_watch_run",
          checked: fxWatch.checked,
          alerted: fxWatch.alerted,
        });
      }
    });
    await job("rate_limits", async () => {
      const before = new Date(deps.clock.now().getTime() - RATE_LIMIT_RETENTION_MS);
      rateLimitsPurged = await deps.runTx((tx) => purgeRateLimits(tx, before));
      deps.log({ event: "rate_limits_purged", count: rateLimitsPurged });
    });
    if (failed.length > 0) throw new Error(`scheduler: ${failed.join(", ")} failed`);
    return {
      sweep,
      lifecycle,
      metering,
      staticIps,
      unpaid,
      invoices,
      polling,
      dnsDelegation,
      fxWatch,
      rateLimitsPurged,
    };
  };
}

// Fail closed (R16): the message names the variable and never its value (R3, R14). TC_ENV is not read.
export function readConfig(
  env: Record<string, string | undefined>,
  options: { readonly needsQueueUrl?: boolean } = {},
): {
  readonly queueUrl: string;
  readonly region: string;
} {
  const bad = (name: string): Error => new Error(`scheduler: ${name} is missing or invalid`);
  const queueUrl = env.PROVISIONING_QUEUE_URL ?? "";
  if ((options.needsQueueUrl ?? true) && !QUEUE_URL_PATTERN.test(queueUrl)) {
    throw bad("PROVISIONING_QUEUE_URL");
  }
  const region = env.AWS_REGION;
  if (typeof region !== "string" || region === "") throw bad("AWS_REGION");
  return { queueUrl, region };
}

// Built on the first call, not at import; a failed build keeps nothing.
let inner: (() => Promise<SchedulerReport>) | undefined;

// PRO-1: the single-EC2 edition passes its local queue; the Lambda builds the SQS one.
export function buildSchedulerHandler(
  options: { readonly queue?: OperationQueue } = {},
): () => Promise<SchedulerReport> {
  const config = readConfig(process.env, { needsQueueUrl: options.queue === undefined });
  return createHandler({
    runTx: withTx,
    clock: { now: () => new Date() },
    queue:
      options.queue ??
      createFifoQueue(createSqsSend(createSqsClient(config.region), config.queueUrl)),
    onAttention: planChangeAttention,
    dnsLookup: createNsLookup(nodeNsResolver()),
    log: (e: LogEvent) => console.log(JSON.stringify(e)),
  });
}

export const handler = async (): Promise<SchedulerReport> => {
  if (inner === undefined) {
    inner = buildSchedulerHandler();
  }
  return inner();
};
