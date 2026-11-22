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
//
// Groups run independently: `pump` starts the due head of each free group and returns at once, so one slow
// run never holds up another resource (security review of PRO-1, finding 1). A run past `timeoutSeconds` counts
// as a failed receive, like a Lambda timeout, but its group stays blocked until the run really ends, so two runs
// of one resource never overlap.

const DEDUP_WINDOW_MS = 300_000;
const DEFAULT_RETRY_DELAY_SECONDS = 30;
const DEFAULT_CONCURRENCY = 4;
const MAX_DEAD_LETTERS_KEPT = 100;

export interface LocalQueueOptions {
  readonly clock: Clock;
  /** Runs one message. A throw counts as a failed receive. `deadline` is the epoch ms the run must end by. */
  readonly handle: (message: QueueMessage, deadline: number) => Promise<void>;
  readonly maxReceiveCount?: number;
  readonly retryDelaySeconds?: number;
  /** Groups that run at the same time. */
  readonly concurrency?: number;
  /** A run longer than this counts as failed (the Lambda timeout of the provisioner). */
  readonly timeoutSeconds?: number;
  /** Told about every dead letter (ids only, R14), so the operator can alarm on it. */
  readonly onDeadLetter?: (message: QueueMessage) => void;
}

export interface DrainReport {
  readonly processed: number;
  readonly failed: number;
  readonly deadLettered: number;
}

export interface LocalQueue extends OperationQueue {
  /** Starts the due head of every free group, up to `concurrency` runs in total. Returns how many started. */
  pump(): number;
  /** Pumps until nothing is due and nothing runs, and reports what happened meanwhile. For tests and shutdown. */
  drain(): Promise<DrainReport>;
  readonly depth: number;
  readonly running: number;
  /** The last dead letters, at most 100. */
  readonly deadLetters: readonly QueueMessage[];
  readonly deadLetterCount: number;
}

interface Stored {
  readonly message: QueueMessage;
  readonly group: string;
  receiveCount: number;
  availableAt: number;
  inFlight: boolean;
  timedOut: boolean;
}

export function createLocalQueue(options: LocalQueueOptions): LocalQueue {
  const maxReceiveCount = options.maxReceiveCount ?? PROVISIONING_QUEUE.maxReceiveCount;
  const retryMs = (options.retryDelaySeconds ?? DEFAULT_RETRY_DELAY_SECONDS) * 1000;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const timeoutMs = (options.timeoutSeconds ?? PROVISIONING_QUEUE.functionTimeoutSeconds) * 1000;
  const now = () => options.clock.now().getTime();

  let stored: Stored[] = [];
  const dead: QueueMessage[] = [];
  let deadCount = 0;
  const accepted = new Map<string, number>();
  const inFlight = new Set<Promise<void>>();
  let processed = 0;
  let failed = 0;
  let deadLettered = 0;

  const remove = (s: Stored) => {
    stored = stored.filter((x) => x !== s);
  };

  const failOnce = (s: Stored) => {
    failed += 1;
    s.receiveCount += 1;
    if (s.receiveCount >= maxReceiveCount) {
      deadLettered += 1;
      deadCount += 1;
      dead.push(s.message);
      if (dead.length > MAX_DEAD_LETTERS_KEPT) dead.shift();
      remove(s);
      options.onDeadLetter?.(s.message);
      return;
    }
    s.availableAt = now() + retryMs;
  };

  // The first message of each group, if it is due and its group is not running.
  const dueHeads = (): Stored[] => {
    const seen = new Set<string>();
    const out: Stored[] = [];
    const at = now();
    for (const s of stored) {
      if (seen.has(s.group)) continue;
      seen.add(s.group);
      if (!s.inFlight && s.availableAt <= at) out.push(s);
    }
    return out;
  };

  const start = (s: Stored) => {
    s.inFlight = true;
    s.timedOut = false;
    const deadline = now() + timeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((res) => {
      timer = setTimeout(() => res("timeout"), timeoutMs);
    });
    const run = options.handle(s.message, deadline).then(
      () => "ok" as const,
      () => "error" as const,
    );
    // The timeout frees the attempt (counts it as failed) but not the group: the group waits for `run`.
    void Promise.race([run, timeout]).then((first) => {
      if (first === "timeout") {
        s.timedOut = true;
        failOnce(s);
      }
    });
    const settled = run.then((result) => {
      if (timer !== undefined) clearTimeout(timer);
      s.inFlight = false;
      if (s.timedOut) return;
      if (result === "ok") {
        processed += 1;
        remove(s);
      } else {
        failOnce(s);
      }
    });
    inFlight.add(settled);
    void settled.finally(() => inFlight.delete(settled));
  };

  const pump = (): number => {
    const free = concurrency - inFlight.size;
    if (free <= 0) return 0;
    const batch = dueHeads().slice(0, free);
    batch.forEach(start);
    return batch.length;
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
        inFlight: false,
        timedOut: false,
      });
    },

    pump,

    async drain() {
      const before = { processed, failed, deadLettered };
      for (;;) {
        pump();
        if (inFlight.size === 0) break;
        await Promise.race(inFlight);
      }
      return {
        processed: processed - before.processed,
        failed: failed - before.failed,
        deadLettered: deadLettered - before.deadLettered,
      };
    },

    get depth() {
      return stored.length;
    },
    get running() {
      return inFlight.size;
    },
    get deadLetters() {
      return [...dead];
    },
    get deadLetterCount() {
      return deadCount;
    },
  };
}
