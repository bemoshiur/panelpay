import type { CreditKind } from "./credit";
import type { WhmcsApi } from "./whmcs-api";

// PRO-6, money review 4. The hook of WHMCS fires once; when the panel or the bridge was down, nothing
// would ever credit that invoice. Every 15 minutes the bridge lists the newest paid WHMCS invoices and
// runs the (idempotent) credit for each one it has not settled yet, with `record: false` so retries add
// no new discrepancy. Settled ids (credited, unchanged, not a top-up) are remembered for the life of the
// process; the rest are tried again next time.

export const SWEEP_EVERY_MS = 15 * 60 * 1000;
export const SWEEP_LIMIT = 100;
const SETTLED: ReadonlySet<CreditKind> = new Set(["credited", "unchanged", "not_topup", "review"]);
const MAX_REMEMBERED = 10_000;

export function createSweeper(deps: {
  readonly api: WhmcsApi;
  readonly credit: (invoiceId: string) => Promise<CreditKind>;
  readonly log: (e: Record<string, unknown>) => void;
}): () => Promise<{ tried: number; settled: number }> {
  const settled = new Set<string>();
  let running = false;
  return async () => {
    if (running) return { tried: 0, settled: 0 };
    running = true;
    try {
      let ids: string[];
      try {
        ids = await deps.api.listRecentPaidInvoiceIds(SWEEP_LIMIT);
      } catch {
        deps.log({ event: "whmcs_sweep", outcome: "unavailable" });
        return { tried: 0, settled: 0 };
      }
      let tried = 0;
      let done = 0;
      for (const id of ids) {
        if (settled.has(id)) continue;
        tried += 1;
        const kind = await deps.credit(id);
        if (SETTLED.has(kind)) {
          if (settled.size >= MAX_REMEMBERED) settled.clear();
          settled.add(id);
          done += 1;
        }
      }
      deps.log({ event: "whmcs_sweep", outcome: "done", tried, settled: done });
      return { tried, settled: done };
    } finally {
      running = false;
    }
  };
}
