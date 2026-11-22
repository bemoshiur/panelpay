import { expect, it } from "vitest";
import { createWorker, toSqsEvent, workerJobs } from "./worker";

const A = "01a1c97d-e814-7352-b32c-d3d3ee408ab8";
const R = "01a1c97d-e813-7307-8faf-9c991091b3bd";

const noop = async () => undefined;
const handlers = {
  scheduler: noop,
  notifier: noop,
  paymentsSweeper: noop,
  catalogSync: noop,
  reconciler: noop,
  ledgerCheck: noop,
};

it("keeps the schedules of the Lambda edition", () => {
  const jobs = workerJobs(handlers).map((j) => [j.name, "every" in j ? j.every : j.dailyAtUtc]);
  expect(jobs).toEqual([
    ["scheduler", 60],
    ["notifier", 60],
    ["payments-sweeper", 300],
    ["reconciler", 3600],
    ["catalog-sync", 86_400],
    ["ledger-check", { hour: 20, minute: 0 }],
  ]);
});

it("wraps a message in the one-record event the provisioner parses", () => {
  const event = toSqsEvent({ operationId: A, resourceId: R, enqueueSeq: 2 });
  expect(event.Records).toHaveLength(1);
  expect(JSON.parse(event.Records[0]!.body)).toEqual({
    operationId: A,
    resourceId: R,
    enqueueSeq: 2,
  });
});

it("a message the scheduler sends reaches the provisioner on the next drain", async () => {
  const bodies: string[] = [];
  const worker = createWorker({
    clock: { now: () => new Date("2030-01-01T00:00:00Z") },
    log: () => {},
    build: (queue) => ({
      ...handlers,
      provision: async (e) => void bodies.push(e.Records[0]!.body),
      scheduler: () => queue.send({ operationId: A, resourceId: R, enqueueSeq: 0 }),
    }),
  });
  await worker.jobs.tick();
  expect(worker.queue.depth).toBe(1);
  await worker.queue.drain();
  expect(bodies).toHaveLength(1);
  expect(worker.queue.depth).toBe(0);
});
