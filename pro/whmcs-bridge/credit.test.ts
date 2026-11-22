import { beforeAll, describe, expect, it } from "vitest";
import { ensureSystemAccounts, openWallet } from "@tc/core";
import type { Tx } from "@tc/db";
import {
  attachErrorListeners,
  newCustomer,
  runTransaction,
  useTempDatabase,
  type DatabaseRole,
} from "@tc/db/testing";
import { creditWhmcsInvoice, type CreditKind } from "./credit";
import { TOPUP_MARKER, type WhmcsClient, type WhmcsInvoice } from "./invoice";
import { WhmcsUnavailable, type WhmcsApi } from "./whmcs-api";

const t = useTempDatabase();
beforeAll(async () => {
  attachErrorListeners(t.pool);
  await runTransaction(t.db, (tx) => ensureSystemAccounts(tx));
});
const run = <T>(fn: (tx: Tx) => Promise<T>, role: DatabaseRole = "web_rw") =>
  runTransaction(t.db, fn, { role });

let seq = 1000;
const nextInvoice = () => String(++seq);

async function customer(email: string, verified = true): Promise<string> {
  const id = await newCustomer(t.pool, {
    email,
    ...(verified ? { email_verified_at: new Date().toISOString() } : {}),
  });
  await run((tx) => openWallet(tx, id));
  return id;
}

const balance = async (customerId: string): Promise<bigint> =>
  BigInt(
    (
      await t.pool.query("select balance_minor as b from wallets where customer_id = $1", [
        customerId,
      ])
    ).rows[0].b,
  );

const paymentOf = async (invoiceId: string) =>
  (
    await t.pool.query(
      "select status, gateway, amount_minor::text as amount, currency from payments where merchant_transaction_id = $1",
      [`WHMCS-inst1-${invoiceId}`],
    )
  ).rows[0];

function fakeApi(
  invoices: Record<string, WhmcsInvoice>,
  clients: Record<string, WhmcsClient>,
  opts: { down?: boolean } = {},
) {
  const api: WhmcsApi = {
    getInvoice: async (id) => {
      if (opts.down) throw new WhmcsUnavailable();
      return invoices[id] ?? null;
    },
    getClient: async (id) => clients[id] ?? null,
  };
  return api;
}

const paid = (invoiceId: string, userId: string, amount = "25.00"): WhmcsInvoice => ({
  invoiceId,
  userId,
  status: "Paid",
  balance: "0.00",
  total: amount,
  items: [{ description: `${TOPUP_MARKER} (${amount})`, amount }],
});

function deps(api: WhmcsApi, logs: Record<string, unknown>[] = []) {
  return {
    api,
    installId: "inst1",
    runTx: <T>(fn: (tx: Tx) => Promise<T>) => run(fn),
    clock: { now: () => new Date("2026-12-01T00:00:00Z") },
    log: (e: Record<string, unknown>) => logs.push(e),
  };
}

describe("creditWhmcsInvoice", () => {
  it("credits the wallet of the verified customer once, and a second call changes nothing (R7)", async () => {
    const c = await customer("alice@example.test");
    const inv = nextInvoice();
    const api = fakeApi(
      { [inv]: paid(inv, "7") },
      { "7": { email: "Alice@Example.test", currencyCode: "BDT" } },
    );
    expect(await creditWhmcsInvoice(deps(api), inv)).toBe<CreditKind>("credited");
    expect(await balance(c)).toBe(2500n);
    expect(await creditWhmcsInvoice(deps(api), inv)).toBe<CreditKind>("unchanged");
    expect(await balance(c)).toBe(2500n);
    expect(await paymentOf(inv)).toEqual({
      status: "credited",
      gateway: "whmcs",
      amount: "2500",
      currency: "BDT",
    });
  });

  it("two concurrent calls for the same invoice credit once", async () => {
    const c = await customer("race@example.test");
    const inv = nextInvoice();
    const api = fakeApi(
      { [inv]: paid(inv, "8", "10.00") },
      { "8": { email: "race@example.test", currencyCode: "BDT" } },
    );
    const kinds = await Promise.all([
      creditWhmcsInvoice(deps(api), inv),
      creditWhmcsInvoice(deps(api), inv),
    ]);
    expect(kinds.sort()).toEqual(["credited", "unchanged"]);
    expect(await balance(c)).toBe(1000n);
  });

  it("credits no one when the e-mail matches no verified customer, or two (R16)", async () => {
    await customer("unverified@example.test", false);
    const inv = nextInvoice();
    const api = fakeApi(
      { [inv]: paid(inv, "9") },
      { "9": { email: "unverified@example.test", currencyCode: "BDT" } },
    );
    expect(await creditWhmcsInvoice(deps(api), inv)).toBe("unmatched");
    expect(await paymentOf(inv)).toBeUndefined();

    await customer("twin@example.test");
    await customer("TWIN@example.test");
    const inv2 = nextInvoice();
    const api2 = fakeApi(
      { [inv2]: paid(inv2, "10") },
      { "10": { email: "twin@example.test", currencyCode: "BDT" } },
    );
    expect(await creditWhmcsInvoice(deps(api2), inv2)).toBe("unmatched");
  });

  it("puts a payment in another currency than the wallet on review, never converting it", async () => {
    const c = await customer("usd@example.test");
    const inv = nextInvoice();
    const api = fakeApi(
      { [inv]: paid(inv, "11") },
      { "11": { email: "usd@example.test", currencyCode: "USD" } },
    );
    expect(await creditWhmcsInvoice(deps(api), inv)).toBe("review");
    expect(await balance(c)).toBe(0n);
    expect((await paymentOf(inv)).status).toBe("review");
  });

  it("credits nothing for an unpaid invoice, a mixed invoice, or when WHMCS does not answer", async () => {
    const c = await customer("wait@example.test");
    const client = { "12": { email: "wait@example.test", currencyCode: "BDT" } };
    const a = nextInvoice();
    expect(
      await creditWhmcsInvoice(
        deps(fakeApi({ [a]: { ...paid(a, "12"), status: "Unpaid" } }, client)),
        a,
      ),
    ).toBe("not_paid");
    const b = nextInvoice();
    const mixed = { ...paid(b, "12"), items: [{ description: "Hosting", amount: "25.00" }] };
    expect(await creditWhmcsInvoice(deps(fakeApi({ [b]: mixed }, client)), b)).toBe("not_topup");
    const d = nextInvoice();
    expect(await creditWhmcsInvoice(deps(fakeApi({}, client, { down: true })), d)).toBe(
      "unavailable",
    );
    expect(await creditWhmcsInvoice(deps(fakeApi({}, client)), "not-a-number")).toBe("invalid");
    expect(await balance(c)).toBe(0n);
  });

  it("a paid invoice whose amount WHMCS later changed goes to review, not a second credit", async () => {
    const c = await customer("changed@example.test");
    const inv = nextInvoice();
    const client = { "13": { email: "changed@example.test", currencyCode: "BDT" } };
    expect(
      await creditWhmcsInvoice(deps(fakeApi({ [inv]: paid(inv, "13", "25.00") }, client)), inv),
    ).toBe("credited");
    expect(
      await creditWhmcsInvoice(deps(fakeApi({ [inv]: paid(inv, "13", "99.00") }, client)), inv),
    ).toBe("review");
    expect(await balance(c)).toBe(2500n);
  });

  it("logs kinds and ids only: no e-mail, no amount text from WHMCS (R14)", async () => {
    await customer("quiet@example.test");
    const inv = nextInvoice();
    const logs: Record<string, unknown>[] = [];
    const api = fakeApi(
      { [inv]: paid(inv, "14") },
      { "14": { email: "quiet@example.test", currencyCode: "BDT" } },
    );
    await creditWhmcsInvoice(deps(api, logs), inv);
    expect(JSON.stringify(logs)).not.toContain("quiet@example.test");
    expect(logs[0]).toMatchObject({ event: "whmcs_credit", kind: "credited", invoiceId: inv });
  });
});
