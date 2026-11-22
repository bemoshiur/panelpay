// PRO-1. Timers of the single-EC2 edition: the job runs that EventBridge Scheduler starts in the Lambda edition.
// A job either runs every `every` seconds (first run at start, like a fresh rate() schedule after deploy) or
// once a day at a UTC time (like a cron() schedule). A job never overlaps itself; one failing job does not stop
// the others, and its log line is a fixed text (R14).

export interface Clock {
  now(): Date;
}

export type Job =
  | { readonly name: string; readonly every: number; readonly run: () => Promise<unknown> }
  | {
      readonly name: string;
      readonly dailyAtUtc: { readonly hour: number; readonly minute: number };
      readonly run: () => Promise<unknown>;
    };

export interface JobRunner {
  /** Starts every job that is due and waits for the ones it started. */
  tick(): Promise<void>;
}

export function createJobRunner(options: {
  readonly jobs: readonly Job[];
  readonly clock: Clock;
  readonly log: (event: Record<string, unknown>) => void;
}): JobRunner {
  const running = new Set<string>();
  const lastStart = new Map<string, number>();
  // The UTC day (yyyy-mm-dd) of the last run of a daily job.
  const lastDay = new Map<string, string>();

  const due = (job: Job, at: Date): boolean => {
    if ("every" in job) {
      const last = lastStart.get(job.name);
      return last === undefined || at.getTime() - last >= job.every * 1000;
    }
    const day = at.toISOString().slice(0, 10);
    if (lastDay.get(job.name) === day) return false;
    const minutes = at.getUTCHours() * 60 + at.getUTCMinutes();
    return minutes >= job.dailyAtUtc.hour * 60 + job.dailyAtUtc.minute;
  };

  return {
    async tick() {
      const at = options.clock.now();
      const started: Promise<void>[] = [];
      for (const job of options.jobs) {
        if (running.has(job.name) || !due(job, at)) continue;
        running.add(job.name);
        lastStart.set(job.name, at.getTime());
        if ("dailyAtUtc" in job) lastDay.set(job.name, at.toISOString().slice(0, 10));
        started.push(
          job
            .run()
            .then(
              () => undefined,
              () => options.log({ event: "job_failed", job: job.name }),
            )
            .finally(() => running.delete(job.name)),
        );
      }
      await Promise.all(started);
    },
  };
}
