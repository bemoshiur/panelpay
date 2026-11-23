import { expect, it } from "vitest";
import { createJobRunner, type Job } from "./jobs";

// PRO-1: the timers that replace EventBridge Scheduler on one EC2. Same schedules as infra/lib/functions.ts.

const clockAt = (iso: string) => {
  let t = new Date(iso).getTime();
  return { now: () => new Date(t), advance: (s: number) => (t += s * 1000) };
};

it("runs an interval job at start and then every period", async () => {
  const clock = clockAt("2030-01-01T00:00:00Z");
  const runs: number[] = [];
  const jobs: Job[] = [{ name: "a", every: 60, run: async () => void runs.push(1) }];
  const r = createJobRunner({ jobs, clock, log: () => {} });
  await r.tick();
  clock.advance(59);
  await r.tick();
  expect(runs.length).toBe(1);
  clock.advance(1);
  await r.tick();
  expect(runs.length).toBe(2);
});

it("runs a daily job once at its UTC time, not at start", async () => {
  const clock = clockAt("2030-01-01T19:59:00Z");
  let runs = 0;
  const r = createJobRunner({
    jobs: [
      { name: "ledger", dailyAtUtc: { hour: 20, minute: 0 }, run: async () => void (runs += 1) },
    ],
    clock,
    log: () => {},
  });
  await r.tick();
  expect(runs).toBe(0);
  clock.advance(60);
  await r.tick();
  clock.advance(30);
  await r.tick();
  expect(runs).toBe(1);
  clock.advance(86_400);
  await r.tick();
  expect(runs).toBe(2);
});

it("does not start a job again while its previous run is still going", async () => {
  const clock = clockAt("2030-01-01T00:00:00Z");
  let release: () => void = () => {};
  let starts = 0;
  const r = createJobRunner({
    jobs: [
      {
        name: "slow",
        every: 10,
        run: () =>
          new Promise<void>((res) => {
            starts += 1;
            release = res;
          }),
      },
    ],
    clock,
    log: () => {},
  });
  void r.tick();
  clock.advance(30);
  await r.tick();
  expect(starts).toBe(1);
  release();
  await new Promise((res) => setTimeout(res, 0));
  void r.tick();
  expect(starts).toBe(2);
  release();
});

it("logs a failed job with a fixed text and keeps the others running", async () => {
  const clock = clockAt("2030-01-01T00:00:00Z");
  const logs: unknown[] = [];
  let ok = 0;
  const r = createJobRunner({
    jobs: [
      { name: "bad", every: 60, run: async () => Promise.reject(new Error("secret detail")) },
      { name: "good", every: 60, run: async () => void (ok += 1) },
    ],
    clock,
    log: (e) => logs.push(e),
  });
  await r.tick();
  expect(ok).toBe(1);
  expect(logs).toEqual([{ event: "job_failed", job: "bad" }]);
  expect(JSON.stringify(logs)).not.toContain("secret");
});
