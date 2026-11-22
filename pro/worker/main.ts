import { handler as accessDetailsHandler } from "@tc/fn-access-details";
import { handler as catalogSyncHandler } from "@tc/fn-catalog-sync";
import { handler as invoiceRendererHandler } from "@tc/fn-invoice-renderer";
import { handler as kycCheckHandler } from "@tc/fn-kyc-check";
import { handler as notifierHandler } from "@tc/fn-notifier";
import { handler as paymentsSweeperHandler } from "@tc/fn-payments-sweeper";
import { buildDeps, createHandler as createProvisionerHandler } from "@tc/fn-provisioner";
import { ledgerCheckHandler, reconcilerHandler } from "@tc/fn-reconciler";
import { handler as readerHandler } from "@tc/fn-reader";
import { buildSchedulerHandler } from "@tc/fn-scheduler";
import { createInvokeHandler, startInvokeServer } from "./invoke-server";
import { createWorker } from "./worker";

// PRO-1. Entry of the systemd unit tc-worker (PRO-3). Reads the same environment as the Lambdas, minus
// PROVISIONING_QUEUE_URL. Credentials come from the instance role (R3). Logs are JSON lines with fixed text
// only (R14): no error message or stack reaches the log, at start-up either.

const log = (e: Record<string, unknown>) => console.log(JSON.stringify(e));
const clock = { now: () => new Date() };
const TICK_MS = 1000;
let stopping = false;

process.on("unhandledRejection", () => log({ event: "worker_unhandled_rejection" }));
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

async function main(): Promise<void> {
  let worker: ReturnType<typeof createWorker>;
  try {
    worker = createWorker({
      clock,
      log,
      build: (queue) => ({
        provision: createProvisionerHandler(buildDeps({ queue })),
        scheduler: buildSchedulerHandler({ queue }),
        notifier: () => notifierHandler(),
        paymentsSweeper: () => paymentsSweeperHandler(),
        catalogSync: () => catalogSyncHandler(),
        reconciler: () => reconcilerHandler(),
        ledgerCheck: () => ledgerCheckHandler(),
      }),
    });
  } catch {
    // Fail closed (R16): a missing or invalid setting stops the unit; systemd shows the failure.
    log({ event: "worker_crashed", stage: "build" });
    process.exit(1);
  }

  // PRO-2: the web tier's four invokes, on loopback only. Off unless both settings are present.
  const invokePort = process.env["PRO_INVOKE_PORT"];
  const invokeToken = process.env["PRO_INVOKE_TOKEN"];
  let invokeServer: ReturnType<typeof startInvokeServer> | undefined;
  if (invokePort !== undefined && invokeToken !== undefined) {
    try {
      invokeServer = startInvokeServer({
        host: "127.0.0.1",
        port: Number(invokePort),
        handle: createInvokeHandler({
          token: invokeToken,
          region: process.env["AWS_REGION"] || "ap-south-1",
          log,
          functions: {
            reader: readerHandler,
            "access-details": accessDetailsHandler,
            "kyc-check": kycCheckHandler,
            "invoice-renderer": invoiceRendererHandler,
          },
        }),
      });
      invokeServer.on("error", () => {
        log({ event: "worker_crashed", stage: "invoke_server" });
        process.exit(1);
      });
    } catch {
      log({ event: "worker_crashed", stage: "invoke_server" });
      process.exit(1);
    }
  }

  log({ event: "worker_started", invokeServer: invokeServer !== undefined });
  while (!stopping) {
    // Neither call waits for a run: a long reconciler or a slow provisioning step never delays the rest.
    void worker.jobs.tick();
    worker.queue.pump();
    await new Promise((res) => setTimeout(res, TICK_MS));
  }
  // Let the runs in progress finish; anything still queued is found again by the sweep after restart (3.4).
  while (worker.queue.running > 0) await new Promise((res) => setTimeout(res, TICK_MS));
  invokeServer?.close();
  log({ event: "worker_stopped" });
}

main().catch(() => {
  log({ event: "worker_crashed", stage: "loop" });
  process.exit(1);
});
