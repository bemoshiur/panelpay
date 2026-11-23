import { expect, it } from "vitest";
import { createManualClock } from "./manual-clock";
import { createLocalQueue } from "./local-queue";
import type { QueueMessage } from "./queue";

// PRO-1: the queue of the single-EC2 edition. Same contract as the SQS FIFO queue of 3.3: the group is the
// resource, the deduplication id is <operation id>:<enqueue_seq>, a failed message comes back after a delay,
// and after maxReceiveCount failures it leaves the queue (the scheduler sweep recovers the operation, 3.4).

const A = "01a1c97d-e814-7352-b32c-d3d3ee408ab8";
const B = "01a1c97d-e815-7a11-8b2e-3a1c5f0d9e44";
const R = "01a1c97d-e813-7307-8faf-9c991091b3bd";
const S = "01a1c97d-e816-7b22-9c3f-4b2d6e1f0a55";
const msg = (operationId: string, resourceId: string, enqueueSeq: number): QueueMessage => ({
  operationId,
  resourceId,
  enqueueSeq,
});
const start = () => createManualClock(new Date("2030-01-01T00:00:00Z"));

it("drains a sent message into the handler and removes it", async () => {
  const seen: QueueMessage[] = [];
  const q = createLocalQueue({ clock: start(), handle: async (m) => void seen.push(m) });
  await q.send(msg(A, R, 0));
  expect(q.depth).toBe(1);
  const report = await q.drain();
  expect(seen).toEqual([msg(A, R, 0)]);
  expect(report).toEqual({ processed: 1, failed: 0, deadLettered: 0 });
  expect(q.depth).toBe(0);
});

it("drops a duplicate deduplication id inside 5 minutes and accepts it after", async () => {
  const clock = start();
  const q = createLocalQueue({ clock, handle: async () => {} });
  await q.send(msg(A, R, 0));
  await q.send(msg(A, R, 0));
  expect(q.depth).toBe(1);
  await q.drain();
  clock.advance(299);
  await q.send(msg(A, R, 0));
  expect(q.depth).toBe(0);
  clock.advance(2);
  await q.send(msg(A, R, 0));
  expect(q.depth).toBe(1);
});

it("keeps FIFO order inside a group and runs other groups in the same drain", async () => {
  const order: string[] = [];
  const q = createLocalQueue({
    clock: start(),
    handle: async (m) => void order.push(`${m.resourceId === R ? "R" : "S"}${m.enqueueSeq}`),
  });
  await q.send(msg(A, R, 0));
  await q.send(msg(A, R, 1));
  await q.send(msg(B, S, 0));
  await q.drain();
  expect(order.filter((x) => x.startsWith("R"))).toEqual(["R0", "R1"]);
  expect(order).toContain("S0");
  expect(q.depth).toBe(0);
});

it("brings a failed message back only after the retry delay", async () => {
  const clock = start();
  let calls = 0;
  const q = createLocalQueue({
    clock,
    retryDelaySeconds: 30,
    handle: async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
    },
  });
  await q.send(msg(A, R, 0));
  expect(await q.drain()).toEqual({ processed: 0, failed: 1, deadLettered: 0 });
  clock.advance(29);
  expect(await q.drain()).toEqual({ processed: 0, failed: 0, deadLettered: 0 });
  clock.advance(1);
  expect(await q.drain()).toEqual({ processed: 1, failed: 0, deadLettered: 0 });
  expect(calls).toBe(2);
});

it("a failed message blocks the later messages of its group until it is done", async () => {
  const clock = start();
  const order: number[] = [];
  let failFirst = true;
  const q = createLocalQueue({
    clock,
    retryDelaySeconds: 10,
    handle: async (m) => {
      if (m.enqueueSeq === 0 && failFirst) {
        failFirst = false;
        throw new Error("boom");
      }
      order.push(m.enqueueSeq);
    },
  });
  await q.send(msg(A, R, 0));
  await q.send(msg(A, R, 1));
  await q.drain();
  expect(order).toEqual([]);
  clock.advance(10);
  await q.drain();
  expect(order).toEqual([0, 1]);
});

it("moves a message to the dead letters after maxReceiveCount failures", async () => {
  const clock = start();
  const q = createLocalQueue({
    clock,
    maxReceiveCount: 3,
    retryDelaySeconds: 1,
    handle: async () => {
      throw new Error("boom");
    },
  });
  await q.send(msg(A, R, 0));
  const reports = [];
  for (let i = 0; i < 3; i++) {
    reports.push(await q.drain());
    clock.advance(1);
  }
  expect(reports.at(-1)).toEqual({ processed: 0, failed: 1, deadLettered: 1 });
  expect(q.depth).toBe(0);
  expect(q.deadLetters).toEqual([msg(A, R, 0)]);
});

it("refuses an invalid message before it is stored", async () => {
  const q = createLocalQueue({ clock: start(), handle: async () => {} });
  await expect(q.send(msg("not-a-uuid", R, 0))).rejects.toThrow(RangeError);
  expect(q.depth).toBe(0);
});

it("a slow run does not hold up another resource", async () => {
  let release: () => void = () => {};
  const done: string[] = [];
  const q = createLocalQueue({
    clock: start(),
    handle: (m) =>
      m.resourceId === R
        ? new Promise<void>((res) => {
            release = () => {
              done.push("R");
              res();
            };
          })
        : Promise.resolve(void done.push("S")),
  });
  await q.send(msg(A, R, 0));
  await q.send(msg(B, S, 0));
  expect(q.pump()).toBe(2);
  await new Promise((res) => setTimeout(res, 0));
  expect(done).toEqual(["S"]);
  expect(q.running).toBe(1);
  release();
  await q.drain();
  expect(done).toEqual(["S", "R"]);
  expect(q.depth).toBe(0);
});

it("a run past the timeout counts as failed, and its group waits until the run really ends", async () => {
  const clock = start();
  let release: () => void = () => {};
  let calls = 0;
  const q = createLocalQueue({
    clock,
    timeoutSeconds: 0.02,
    retryDelaySeconds: 0,
    handle: () => {
      calls += 1;
      return calls === 1 ? new Promise<void>((res) => (release = res)) : Promise.resolve();
    },
  });
  await q.send(msg(A, R, 0));
  q.pump();
  await new Promise((res) => setTimeout(res, 40));
  // Timed out and due again (retry delay 0), but the first run still holds the group.
  expect(q.pump()).toBe(0);
  expect(calls).toBe(1);
  release();
  const report = await q.drain();
  expect(calls).toBe(2);
  expect(report.processed).toBe(1);
  expect(q.depth).toBe(0);
});

it("tells the operator about each dead letter with ids only", async () => {
  const told: QueueMessage[] = [];
  const clock = start();
  const q = createLocalQueue({
    clock,
    maxReceiveCount: 1,
    handle: async () => {
      throw new Error("boom");
    },
    onDeadLetter: (m) => told.push(m),
  });
  await q.send(msg(A, R, 0));
  await q.drain();
  expect(told).toEqual([msg(A, R, 0)]);
  expect(q.deadLetterCount).toBe(1);
});
