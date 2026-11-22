import { createLocalQueue, type LocalQueue, type QueueMessage } from "@tc/core";
import { createJobRunner, type Clock, type Job, type JobRunner } from "./jobs";

// PRO-1. The worker process of the single-EC2 edition (docs/pro/single-ec2-plan.md). One long-running process
// replaces the provisioner on SQS and the cron Lambdas: the provisioner reads the local queue, the scheduler
// sweep feeds it (3.4), and the timers start the other jobs on the schedules of infra/lib/functions.ts.
// The handlers are the Lambda handlers, called with the event shape they already read.

export interface WorkerHandlers {
  /** The provisioner of functions/provisioner, bound to the local queue. Throws when its one record failed. */
  readonly provision: (event: {
    Records: { messageId: string; body: string }[];
  }) => Promise<unknown>;
  readonly scheduler: () => Promise<unknown>;
  readonly notifier: () => Promise<unknown>;
  readonly paymentsSweeper: () => Promise<unknown>;
  readonly catalogSync: () => Promise<unknown>;
  readonly reconciler: () => Promise<unknown>;
  readonly ledgerCheck: () => Promise<unknown>;
}

export interface Worker {
  readonly queue: LocalQueue;
  readonly jobs: JobRunner;
}

/** The schedules of infra/lib/functions.ts. ledger-check is cron(0 20 * * ? *). */
export function workerJobs(h: Omit<WorkerHandlers, "provision">): Job[] {
  return [
    { name: "scheduler", every: 60, run: h.scheduler },
    { name: "notifier", every: 60, run: h.notifier },
    { name: "payments-sweeper", every: 300, run: h.paymentsSweeper },
    { name: "reconciler", every: 3600, run: h.reconciler },
    { name: "catalog-sync", every: 86_400, run: h.catalogSync },
    { name: "ledger-check", dailyAtUtc: { hour: 20, minute: 0 }, run: h.ledgerCheck },
  ];
}

let counter = 0;

/** Wraps a queue message in the one-record SQS event the provisioner reads. */
export function toSqsEvent(message: QueueMessage): {
  Records: { messageId: string; body: string }[];
} {
  counter += 1;
  return {
    Records: [
      {
        messageId: `local-${counter}`,
        body: JSON.stringify({
          operationId: message.operationId,
          resourceId: message.resourceId,
          enqueueSeq: message.enqueueSeq,
        }),
      },
    ],
  };
}

export function createWorker(options: {
  readonly clock: Clock;
  readonly log: (event: Record<string, unknown>) => void;
  /** Built after the queue exists, because the provisioner and the scheduler send into it. */
  readonly build: (queue: LocalQueue) => WorkerHandlers;
}): Worker {
  // Filled right after the queue exists; the queue only calls it on a drain, which comes later.
  const ready: { handlers?: WorkerHandlers } = {};
  const queue = createLocalQueue({
    clock: options.clock,
    handle: async (message) => {
      if (ready.handlers === undefined) throw new Error("worker: not ready");
      await ready.handlers.provision(toSqsEvent(message));
    },
  });
  const handlers = options.build(queue);
  ready.handlers = handlers;
  const jobs = createJobRunner({
    jobs: workerJobs(handlers),
    clock: options.clock,
    log: options.log,
  });
  return { queue, jobs };
}
