import { handler as catalogSyncHandler } from "@tc/fn-catalog-sync";
import { handler as notifierHandler } from "@tc/fn-notifier";
import { handler as paymentsSweeperHandler } from "@tc/fn-payments-sweeper";
import { buildDeps, createHandler as createProvisionerHandler } from "@tc/fn-provisioner";
import { ledgerCheckHandler, reconcilerHandler } from "@tc/fn-reconciler";
import { buildSchedulerHandler } from "@tc/fn-scheduler";
import { createWorker } from "./worker";

// PRO-1. Entry of the systemd unit tc-worker (PRO-3). Reads the same environment as the Lambdas, minus
// PROVISIONING_QUEUE_URL. Credentials come from the instance role (R3). Logs are JSON lines (R14).

const log = (e: Record<string, unknown>) => console.log(JSON.stringify(e));
const clock = { now: () => new Date() };

const worker = createWorker({
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

let stopping = false;
const TICK_MS = 1000;

async function loop(): Promise<void> {
  log({ event: "worker_started" });
  while (!stopping) {
    // Jobs run in the background so a long reconciler run never delays the queue.
    void worker.jobs.tick();
    const report = await worker.queue.drain();
    if (report.failed > 0 || report.deadLettered > 0) log({ event: "queue_drain", ...report });
    await new Promise((res) => setTimeout(res, TICK_MS));
  }
  log({ event: "worker_stopped" });
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

loop().catch(() => {
  log({ event: "worker_crashed" });
  process.exit(1);
});
