import { expect, it } from "vitest";
import type { CreditKind } from "./credit";
import { createSweeper } from "./sweep";
import { WhmcsUnavailable, type WhmcsApi } from "./whmcs-api";

function setup(ids: string[], outcome: (id: string) => CreditKind, down = false) {
  const calls: string[] = [];
  const api = {
    listRecentPaidInvoiceIds: async () => {
      if (down) throw new WhmcsUnavailable();
      return ids;
    },
  } as unknown as WhmcsApi;
  const sweep = createSweeper({
    api,
    credit: async (id) => {
      calls.push(id);
      return outcome(id);
    },
    log: () => {},
  });
  return { sweep, calls };
}

it("credits what the hook missed and does not try settled invoices again", async () => {
  const { sweep, calls } = setup(["3", "2", "1"], (id) => (id === "2" ? "unmatched" : "credited"));
  expect(await sweep()).toEqual({ tried: 3, settled: 2 });
  expect(await sweep()).toEqual({ tried: 1, settled: 0 });
  expect(calls).toEqual(["3", "2", "1", "2"]);
});

it("tries an unavailable or failed credit again next time", async () => {
  let first = true;
  const { sweep } = setup(["9"], () => {
    const k: CreditKind = first ? "unavailable" : "credited";
    first = false;
    return k;
  });
  expect(await sweep()).toEqual({ tried: 1, settled: 0 });
  expect(await sweep()).toEqual({ tried: 1, settled: 1 });
});

it("does nothing when WHMCS does not answer the list", async () => {
  const { sweep, calls } = setup([], () => "credited", true);
  expect(await sweep()).toEqual({ tried: 0, settled: 0 });
  expect(calls).toEqual([]);
});
