import { QUEUE_URL_PATTERN, createAwsAccess, createSqsClient, createSqsSend } from "@tc/aws";
import {
  LEASE_SECONDS,
  TC_ENVS,
  createFifoQueue,
  destructiveGuard,
  lifecycleHooks,
  parseMessageBody,
  type LogEvent,
  type OperationQueue,
  type QueueMessage,
  type TcEnv,
} from "@tc/core";
import { withTx } from "@tc/db";
import { createAdapterRegistry } from "./adapters";
import { backupAdapter, diskAdapter } from "./backup";
import { bucketAdapter } from "./bucket";
import { cdnAdapter } from "./cdn";
import { containerServiceAdapter } from "./container";
import { databaseAdapter } from "./database";
import { dnsZoneAdapter, dnsZoneHooks, dnsZonePortsFromEnv } from "./dns-zone";
import { domainAdapter, domainHooks, domainPortsFromEnv, domainRenewalRecheck } from "./domain";
import { linuxInstanceAdapter } from "./linux";
import { loadBalancerAdapter } from "./load-balancer";
import { composeHooks } from "./hooks";
import { orderHooks } from "./order-hooks";
import { renewalHooks } from "./renewal-hooks";
import { windowsInstanceAdapter } from "./windows";
import { runStep } from "./step";
import type { RunOutcome, StepDeps } from "./types";
import { notify } from "@tc/notify";
import type { NoticeWriter } from "@tc/core";

// WPU-Y2 fix round 1: the customer's message of a refunded domain renewal is a template of @tc/notify, written in the
// transaction of the failed hook (core cannot import notify).
const noticeWriter: NoticeWriter = (tx, n) =>
  notify(tx, {
    customerId: n.customerId,
    template: n.template,
    data: n.data,
    dedupeKey: n.dedupeKey,
  });

// The three fields of the Lambda SQS event that this code reads, so no @types/aws-lambda is needed.
export interface SqsRecord {
  readonly messageId: string;
  readonly body: string;
}
export interface SqsEvent {
  readonly Records: readonly SqsRecord[];
}
export interface SqsBatchResponse {
  readonly batchItemFailures: readonly { readonly itemIdentifier: string }[];
}
export interface LambdaContext {
  getRemainingTimeInMillis(): number;
}

type Run = (deps: StepDeps, message: QueueMessage) => Promise<RunOutcome>;

export function createHandler(
  deps: StepDeps,
  run: Run = runStep,
): (event: SqsEvent, context?: LambdaContext) => Promise<SqsBatchResponse> {
  // Fixed text only (R14): nothing of the body and nothing of an error reaches a log or a throw.
  const fail = (
    records: readonly SqsRecord[],
    index: number,
    reason: "malformed_body" | "run_error" | "lease",
  ): SqsBatchResponse => {
    const first = records[index];
    if (first === undefined) return { batchItemFailures: [] };
    if (reason !== "lease") {
      deps.log({ event: "batch_failure", messageId: first.messageId, reason });
    }
    // With batch size 1 a returned failure counts as a success unless ReportBatchItemFailures is on;
    // a throw is right either way, and no other record needs protecting.
    if (records.length === 1) throw new Error("provisioner: record failed");
    return {
      batchItemFailures: records.slice(index).map((r) => ({ itemIdentifier: r.messageId })),
    };
  };

  return async (event, context) => {
    const records = event.Records;
    if (context !== undefined && context.getRemainingTimeInMillis() > LEASE_SECONDS * 1000) {
      deps.log({ event: "lease_shorter_than_timeout" });
      return fail(records, 0, "lease");
    }
    for (let index = 0; index < records.length; index++) {
      const record = records[index] as SqsRecord;
      const message = parseMessageBody(record.body);
      if (message === null) return fail(records, index, "malformed_body");
      try {
        await run(deps, message);
      } catch {
        return fail(records, index, "run_error");
      }
    }
    return { batchItemFailures: [] };
  };
}

export interface ProvisionerConfig {
  readonly queueUrl: string;
  readonly region: string;
  readonly env: TcEnv;
}

// Fail closed (R16): the message names the variable and never its value (R3, R14).
// PRO-1: the single-EC2 edition brings its own queue, so it does not need PROVISIONING_QUEUE_URL.
export function readConfig(
  env: Record<string, string | undefined>,
  options: { readonly needsQueueUrl?: boolean } = {},
): ProvisionerConfig {
  const bad = (name: string): Error => new Error(`provisioner: ${name} is missing or invalid`);
  const queueUrl = env.PROVISIONING_QUEUE_URL ?? "";
  if ((options.needsQueueUrl ?? true) && !QUEUE_URL_PATTERN.test(queueUrl)) {
    throw bad("PROVISIONING_QUEUE_URL");
  }
  const region = env.AWS_REGION;
  if (typeof region !== "string" || region === "") throw bad("AWS_REGION");
  const tcEnv = env.TC_ENV;
  if (typeof tcEnv !== "string" || !(TC_ENVS as readonly string[]).includes(tcEnv)) {
    throw bad("TC_ENV");
  }
  return { queueUrl, region, env: tcEnv as TcEnv };
}

export function buildDeps(options: { readonly queue?: OperationQueue } = {}): StepDeps {
  const config = readConfig(process.env, { needsQueueUrl: options.queue === undefined });
  const clock = { now: () => new Date() };
  const access = createAwsAccess({ caller: "provisioner" });
  const log = (e: LogEvent) => console.log(JSON.stringify(e));
  // WPU-X10: one set of domain ports for the adapter and the registry check of confirm_unrenewed.
  const domainPorts = domainPortsFromEnv(process.env, access);
  return {
    runTx: withTx,
    clock,
    queue:
      options.queue ??
      createFifoQueue(createSqsSend(createSqsClient(config.region), config.queueUrl)),
    // The registry is empty until WP4-T5, and the guard and the other hooks come with WP5-T4 and
    // WP5-T5: until then every operation ends in needs_attention (R16). The failed hook of a create
    // is the automatic reversal of WP4-T4; a rejected create runs it too (reject.ts).
    adapters: createAdapterRegistry([
      linuxInstanceAdapter({
        vpcCidr: process.env.TC_VPC_CIDR,
        probeSources: process.env.TC_PROBE_SOURCES,
      }),
      // WP6-T1: behind the flag windows_instance (R12), which the order flow checks.
      windowsInstanceAdapter({
        vpcCidr: process.env.TC_VPC_CIDR,
        dhcpServer: process.env.TC_DHCP_SERVER,
      }),
      backupAdapter(),
      diskAdapter(),
      // WP6-T4 and WP7-T1: behind their feature flags (R12), which the order flow checks.
      bucketAdapter(),
      containerServiceAdapter(),
      // WP7-T2: behind the flag cdn (R12), which the order flow checks.
      cdnAdapter(),
      // WP7-T4: behind the flag domain (R12). WPU-X10: Route 53 Domains and Route 53 of tc-dns (TcDnsProvisioner)
      // and the KMS unseal of the contact; it fails closed without TC_DNS_ACCOUNT_ID, TC_DNS_EXTERNAL_ID and
      // TC_DOMAIN_CONTACT_KEY_ARN.
      domainAdapter(domainPorts),
      // WPU-G6, WPU-D4: behind the flag dns_zone (R12); Route 53 of tc-dns, and it fails closed without
      // TC_DNS_ACCOUNT_ID and TC_DNS_EXTERNAL_ID.
      dnsZoneAdapter(dnsZonePortsFromEnv(process.env, access)),
      // WP6-T2 and WP6-T3.
      databaseAdapter(),
      loadBalancerAdapter(),
    ]),
    // WP5-T4: the guard of R13 and the success hooks of the lifecycle kinds. WPU-Z13: a failed domain renewal gives
    // its charge back (renewalHooks).
    destructiveGuard,
    hooks: composeHooks(
      orderHooks({ clock, log }),
      lifecycleHooks({ clock, log }),
      dnsZoneHooks(),
      domainHooks(),
      renewalHooks({ log, notice: noticeWriter }),
    ),
    // WPU-X3 (b): the registry check of confirm_unrenewed (WPU-X10: on the domain ports; fails closed without them).
    renewalRecheck: domainRenewalRecheck(domainPorts),
    access,
    env: config.env,
    log,
  };
}

// Built on the first call, not at import; a failed build keeps nothing, so the next call reads the
// environment again.
let inner: ReturnType<typeof createHandler> | undefined;

export const handler = async (
  event: SqsEvent,
  context: LambdaContext,
): Promise<SqsBatchResponse> => {
  inner ??= createHandler(buildDeps());
  return inner(event, context);
};
