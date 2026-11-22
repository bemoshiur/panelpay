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
import { checkWhmcsInvoiceChanged, creditWhmcsInvoice, type CreditKind } from "./credit";
import { clientRef, type WhmcsClient, type WhmcsInvoice } from "./invoice";
import { WhmcsUnavailable, type WhmcsApi } from "./whmcs-api";

const SECRET = "d".repeat(48);
const t = useTempDatabase();
beforeAll(async () => {
  attachErrorListeners(t.pool);
  await runTransaction(t.db, (tx) => ensureSystemAccounts(tx));
});
const run = <T>(fn: (tx: Tx) => Promise<T>, role: DatabaseRole = "web_rw") =>
  runTransaction(t.db, fn, { role });

let seq = 1000;
const nextInvoice = () => String(++seq);
let clientSeq = 100;

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

const notesFor = async (invoiceId: string): Promise<string[]> =>
  (
    await t.pool.query(
      "select details->>'note' as note from discrepancies where details->>'note' like $1 order by created_at",
      [`whmcs invoice ${invoiceId}:%`],
    )
  ).rows.map((r) => r.note as string);

/** A WHMCS client and the top-up line the addon writes for it. */
function whmcsClient(email: string, currencyCode = "BDT"): WhmcsClient {
  return { clientId: String(++clientSeq), email, currencyCode };
}
const line = (c: WhmcsClient, amount: string, currency = c.currencyCode) => ({
  description: `TryAWS.now wallet top-up (${currency} ${amount}) [ref ${clientRef(SECRET, c.clientId, c.email)}]`,
  amount,
});
const paid = (invoiceId: string, c: WhmcsClient, amount = "25.00"): WhmcsInvoice => ({
  invoiceId,
  userId: c.clientId,
  status: "Paid",
  balance: "0.00",
  total: amount,
  credit: "0.00",
  items: [line(c, amount)],
});

function fakeApi(
  invoices: Record<string, WhmcsInvoice>,
  clients: WhmcsClient[],
  opts: { down?: boolean } = {},
): WhmcsApi {
  return {
    getInvoice: async (id) => {
      if (opts.down) throw new WhmcsUnavailable();
      return invoices[id] ?? null;
    },
    getClient: async (id) => clients.find((c) => c.clientId === id) ?? null,
    listRecentPaidInvoiceIds: async () => Object.keys(invoices),
  };
}

function deps(api: WhmcsApi, logs: Record<string, unknown>[] = []) {
  return {
    api,
    installId: "inst1",
    secret: SECRET,
    runTx: <T>(fn: (tx: Tx) => Promise<T>) => run(fn),
    clock: { now: () => new Date("2026-12-01T00:00:00Z") },
    log: (e: Record<string, unknown>) => logs.push(e),
  };
}

describe("creditWhmcsInvoice", () => {
  it("credits the wallet of the verified customer once, and a second call changes nothing (R7)", async () => {
    const c = await customer("alice@example.test");
    const wc = whmcsClient("Alice@Example.test");
    const inv = nextInvoice();
    const api = fakeApi({ [inv]: paid(inv, wc) }, [wc]);
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
    const wc = whmcsClient("race@example.test");
    const inv = nextInvoice();
    const api = fakeApi({ [inv]: paid(inv, wc, "10.00") }, [wc]);
    const kinds = await Promise.all([
      creditWhmcsInvoice(deps(api), inv),
      creditWhmcsInvoice(deps(api), inv),
    ]);
    expect(kinds.sort()).toEqual(["credited", "unchanged"]);
    expect(await balance(c)).toBe(1000n);
  });

  it("credits no one when the e-mail matches no verified customer, or two, and records it (R16)", async () => {
    await customer("unverified@example.test", false);
    const wc = whmcsClient("unverified@example.test");
    const inv = nextInvoice();
    expect(await creditWhmcsInvoice(deps(fakeApi({ [inv]: paid(inv, wc) }, [wc])), inv)).toBe(
      "unmatched",
    );
    expect(await paymentOf(inv)).toBeUndefined();
    expect(await notesFor(inv)).toEqual([`whmcs invoice ${inv}: unmatched`]);

    await customer("twin@example.test");
    await customer("TWIN@example.test");
    const tw = whmcsClient("twin@example.test");
    const inv2 = nextInvoice();
    expect(await creditWhmcsInvoice(deps(fakeApi({ [inv2]: paid(inv2, tw) }, [tw])), inv2)).toBe(
      "unmatched",
    );
  });

  it("puts a payment in another currency than the wallet on review, never converting it", async () => {
    const c = await customer("usd@example.test");
    const wc = whmcsClient("usd@example.test", "USD");
    const inv = nextInvoice();
    expect(await creditWhmcsInvoice(deps(fakeApi({ [inv]: paid(inv, wc) }, [wc])), inv)).toBe(
      "review",
    );
    expect(await balance(c)).toBe(0n);
    expect((await paymentOf(inv)).status).toBe("review");
    expect(await notesFor(inv)).toEqual([`whmcs invoice ${inv}: wallet currency`]);
  });

  it("refuses and records a client whose e-mail changed after the invoice was made (money review 5)", async () => {
    const victim = await customer("victim@example.test");
    await customer("payer@example.test");
    const wc = whmcsClient("payer@example.test");
    const inv = nextInvoice();
    const invoice = paid(inv, wc); // the line was written for payer@
    const moved = { ...wc, email: "victim@example.test" }; // then the client edits the e-mail
    expect(await creditWhmcsInvoice(deps(fakeApi({ [inv]: invoice }, [moved])), inv)).toBe(
      "review",
    );
    expect(await balance(victim)).toBe(0n);
    expect(await notesFor(inv)).toEqual([`whmcs invoice ${inv}: ref`]);
  });

  it("refuses an invoice paid with WHMCS credit balance (money review 2)", async () => {
    const c = await customer("credit@example.test");
    const wc = whmcsClient("credit@example.test");
    const inv = nextInvoice();
    const invoice = { ...paid(inv, wc), credit: "25.00" };
    expect(await creditWhmcsInvoice(deps(fakeApi({ [inv]: invoice }, [wc])), inv)).toBe("review");
    expect(await balance(c)).toBe(0n);
    expect(await notesFor(inv)).toEqual([`whmcs invoice ${inv}: paid_with_credit`]);
  });

  it("the sweeper's call (record: false) records nothing, so retries never repeat a record", async () => {
    const wc = whmcsClient("nobody-here@example.test");
    const inv = nextInvoice();
    const api = fakeApi({ [inv]: paid(inv, wc) }, [wc]);
    expect(await creditWhmcsInvoice(deps(api), inv, { record: false })).toBe("unmatched");
    expect(await notesFor(inv)).toEqual([]);
  });

  it("credits nothing for an unpaid invoice, a mixed invoice, or when WHMCS does not answer", async () => {
    const c = await customer("wait@example.test");
    const wc = whmcsClient("wait@example.test");
    const a = nextInvoice();
    const unpaid = { ...paid(a, wc), status: "Unpaid" };
    expect(await creditWhmcsInvoice(deps(fakeApi({ [a]: unpaid }, [wc])), a)).toBe("not_paid");
    const b = nextInvoice();
    const mixed = { ...paid(b, wc), items: [{ description: "Hosting", amount: "25.00" }] };
    expect(await creditWhmcsInvoice(deps(fakeApi({ [b]: mixed }, [wc])), b)).toBe("not_topup");
    const d = nextInvoice();
    expect(await creditWhmcsInvoice(deps(fakeApi({}, [wc], { down: true })), d)).toBe(
      "unavailable",
    );
    expect(await creditWhmcsInvoice(deps(fakeApi({}, [wc])), "not-a-number")).toBe("invalid");
    expect(await balance(c)).toBe(0n);
  });

  it("a paid invoice whose amount WHMCS later changed goes to review, not a second credit", async () => {
    const c = await customer("changed@example.test");
    const wc = whmcsClient("changed@example.test");
    const inv = nextInvoice();
    const first = fakeApi({ [inv]: paid(inv, wc, "25.00") }, [wc]);
    expect(await creditWhmcsInvoice(deps(first), inv)).toBe("credited");
    const later = fakeApi({ [inv]: paid(inv, wc, "99.00") }, [wc]);
    expect(await creditWhmcsInvoice(deps(later), inv)).toBe("review");
    expect(await balance(c)).toBe(2500n);
    expect(await notesFor(inv)).toEqual([`whmcs invoice ${inv}: changed`]);
  });

  it("logs kinds and ids only: no e-mail (R14)", async () => {
    await customer("quiet@example.test");
    const wc = whmcsClient("quiet@example.test");
    const inv = nextInvoice();
    const logs: Record<string, unknown>[] = [];
    await creditWhmcsInvoice(deps(fakeApi({ [inv]: paid(inv, wc) }, [wc]), logs), inv);
    expect(JSON.stringify(logs)).not.toContain("quiet@example.test");
    expect(logs[0]).toMatchObject({ event: "whmcs_credit", kind: "credited", invoiceId: inv });
  });
});

describe("checkWhmcsInvoiceChanged (money review 2)", () => {
  it("flags a credited invoice that WHMCS refunded, and leaves the wallet to the operator", async () => {
    const c = await customer("refund@example.test");
    const wc = whmcsClient("refund@example.test");
    const inv = nextInvoice();
    await creditWhmcsInvoice(deps(fakeApi({ [inv]: paid(inv, wc) }, [wc])), inv);
    const refunded = { ...paid(inv, wc), status: "Refunded" };
    expect(await checkWhmcsInvoiceChanged(deps(fakeApi({ [inv]: refunded }, [wc])), inv)).toBe(
      "flagged",
    );
    expect(await notesFor(inv)).toEqual([`whmcs invoice ${inv}: now Refunded`]);
    // Nothing is reversed by the bridge: the operator does it with an approved adjustment (R5).
    expect(await balance(c)).toBe(2500n);
  });

  it("does nothing for an invoice that is still paid, or that the panel never credited", async () => {
    await customer("still@example.test");
    const wc = whmcsClient("still@example.test");
    const inv = nextInvoice();
    await creditWhmcsInvoice(deps(fakeApi({ [inv]: paid(inv, wc) }, [wc])), inv);
    expect(await checkWhmcsInvoiceChanged(deps(fakeApi({ [inv]: paid(inv, wc) }, [wc])), inv)).toBe(
      "unchanged",
    );
    const other = nextInvoice();
    const cancelled = { ...paid(other, wc), status: "Cancelled" };
    expect(await checkWhmcsInvoiceChanged(deps(fakeApi({ [other]: cancelled }, [wc])), other)).toBe(
      "unknown",
    );
  });
});
