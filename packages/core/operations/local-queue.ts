import type { Clock } from "../types";
import { parseMessageBody, toFifoInput, type OperationQueue, type QueueMessage } from "./queue";
import { PROVISIONING_QUEUE } from "./queue-config";

// PRO-1. The provisioning queue of the single-EC2 edition (docs/pro/single-ec2-plan.md): it lives in the worker
// process and keeps the contract of the SQS FIFO queue of 3.3 that the code relies on.
//   - group = resource id: messages of one resource run one at a time, in order;
//   - deduplication id = <operation id>:<enqueue_seq>, remembered for 5 minutes;
//   - a failed message comes back after a delay; after maxReceiveCount failures it leaves the queue.
// Nothing here is durable, and nothing needs to be: the operation row is the state. A message lost with the
// process (or dropped as a dead letter) is found again by the scheduler sweep (3.4), as a lost SQS send is.

const DEDUP_WINDOW_MS = 300_000;
const DEFAULT_RETRY_DELAY_SECONDS = 30;
const DEFAULT_CONCURRENCY = 4;

export interface LocalQueueOptions {
  readonly clock: Clock;
  /** Runs one message. A throw counts as a failed receive. */
  readonly handle: (message: QueueMessage) => Promise<void>;
  readonly maxReceiveCount?: number;
  readonly retryDelaySeconds?: number;
  /** Groups run at the same time in one drain. */
  readonly concurrency?: number;
}

export interface DrainReport {
  readonly processed: number;
  readonly failed: number;
  readonly deadLettered: number;
}

export interface LocalQueue extends OperationQueue {
  /** Runs the first available message of every group, at most `concurrency` at a time, until none is due. */
  drain(): Promise<DrainReport>;
  readonly depth: number;
  readonly deadLetters: readonly QueueMessage[];
}

interface Stored {
  readonly message: QueueMessage;
  readonly group: string;
  receiveCount: number;
  availableAt: number;
}

export function createLocalQueue(options: LocalQueueOptions): LocalQueue {
  const maxReceiveCount = options.maxReceiveCount ?? PROVISIONING_QUEUE.maxReceiveCount;
  const retryMs = (options.retryDelaySeconds ?? DEFAULT_RETRY_DELAY_SECONDS) * 1000;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const now = () => options.clock.now().getTime();

  let stored: Stored[] = [];
  const dead: QueueMessage[] = [];
  const accepted = new Map<string, number>();
  let draining = false;

  // The first message of each group, if it is due. A message waiting for its retry blocks its group (FIFO).
  const dueHeads = (): Stored[] => {
    const seen = new Set<string>();
    const out: Stored[] = [];
    const at = now();
    for (const s of stored) {
      if (seen.has(s.group)) continue;
      seen.add(s.group);
      if (s.availableAt <= at) out.push(s);
    }
    return out;
  };

  return {
    async send(message) {
      // Same validation as the SQS path (throws RangeError before anything is stored).
      const fifo = toFifoInput(message);
      const parsed = parseMessageBody(fifo.MessageBody);
      if (parsed === null) throw new RangeError("invalid queue message");
      const at = now();
      for (const [id, first] of accepted) if (at - first >= DEDUP_WINDOW_MS) accepted.delete(id);
      if (accepted.has(fifo.MessageDeduplicationId)) return;
      accepted.set(fifo.MessageDeduplicationId, at);
      stored.push({
        message: parsed,
        group: fifo.MessageGroupId,
        receiveCount: 0,
        availableAt: at,
      });
    },

    async drain() {
      // One drain at a time: a second caller returns at once and the first one picks its messages up.
      if (draining) return { processed: 0, failed: 0, deadLettered: 0 };
      draining = true;
      let processed = 0;
      let failed = 0;
      let deadLettered = 0;
      try {
        for (;;) {
          const batch = dueHeads().slice(0, concurrency);
          if (batch.length === 0) break;
          const results = await Promise.allSettled(batch.map((s) => options.handle(s.message)));
          results.forEach((result, i) => {
            const s = batch[i] as Stored;
            if (result.status === "fulfilled") {
              processed += 1;
              stored = stored.filter((x) => x !== s);
              return;
            }
            failed += 1;
            s.receiveCount += 1;
            if (s.receiveCount >= maxReceiveCount) {
              deadLettered += 1;
              dead.push(s.message);
              stored = stored.filter((x) => x !== s);
              return;
            }
            s.availableAt = now() + retryMs;
          });
        }
      } finally {
        draining = false;
      }
      return { processed, failed, deadLettered };
    },

    get depth() {
      return stored.length;
    },
    get deadLetters() {
      return [...dead];
    },
  };
}
