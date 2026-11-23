import { v7 as uuidv7 } from "uuid";
import { ledgerKey, openWallet, postTransaction } from "@tc/core";
import { customerRepos, readWalletRow, systemPayments, systemWhmcs, type Tx } from "@tc/db";
import { decideInvoice, type InvoiceDecision } from "./invoice";
import { WhmcsUnavailable, type WhmcsApi } from "./whmcs-api";

// PRO-6. Credits the panel wallet for one paid WHMCS top-up invoice. The caller (the bridge endpoint,
// signed by the WHMCS hook, or the sweeper) only names the invoice id; everything that decides the credit
// is read from the WHMCS API, server to server (the R6 rule for the Pro edition, owner decision 23 Nov
// 2026):
//
//   1. GetInvoice and GetClientsDetails, then decideInvoice (invoice.ts): paid in full, not with WHMCS
//      credit balance, top-up lines only in the addon's format, the client's reference and currency
//      unchanged since the invoice was made.
//   2. One transaction: the panel customer with that verified e-mail (exactly one); the payment row
//      (gateway "whmcs", merchant id WHMCS-<install>-<invoice>, unique: a second call replays), locked;
//      a currency other than the wallet's goes to review; otherwise the ledger post (gateway_clearing ->
//      customer_wallet, idempotency key topup:<payment id>) and the row credited.
//
// The install id is derived from the bridge secret, never from the WHMCS URL, so moving WHMCS to another
// host keeps every merchant id and cannot credit an old invoice again (money review 1).
// A paid top-up the bridge refuses is recorded as a payment discrepancy for an operator when `record` is
// set (the hook and an operator's re-send; the sweeper does not, so it never repeats the record), and the
// sweeper (sweep.ts) re-tries what the hook missed (money review 4).
// Idempotent end to end (R7); fails closed (R16); logs carry kinds and ids only (R14).

export type CreditKind =
  | "credited"
  | "unchanged"
  | "review"
  | "unmatched"
  | "not_paid"
  | "not_topup"
  | "invalid"
  | "unavailable"
  | "error";

export interface CreditDeps {
  readonly api: WhmcsApi;
  /** A short id of this WHMCS install, so two WHMCS installs never share a merchant id. */
  readonly installId: string;
  /** The bridge secret: the key of the client reference on each top-up line (invoice.ts). */
  readonly secret: string;
  readonly runTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  readonly clock: { now(): Date };
  readonly log: (e: Record<string, unknown>) => void;
}

const INSTALL = /^[a-z0-9]{4,16}$/;
const INVOICE = /^[1-9][0-9]{0,9}$/;

class Rollback extends Error {}

export const merchantIdOf = (installId: string, invoiceId: string): string =>
  `WHMCS-${installId}-${invoiceId}`;

async function recordRefusal(
  deps: CreditDeps,
  invoiceId: string,
  reason: string,
  amountMinor: bigint | null,
): Promise<void> {
  // A discrepancy of kind payment, shown on the reconciliation screen. Its own transaction: a failure to
  // record never turns a refusal into a credit, and is only logged.
  try {
    await deps.runTx((tx) =>
      systemPayments.recordDiscrepancy(tx, {
        reason: `whmcs_${reason}`,
        note: `whmcs invoice ${invoiceId}: ${reason}`,
        ...(amountMinor === null ? {} : { gotMinor: amountMinor }),
      }),
    );
  } catch {
    deps.log({ event: "whmcs_record_failed", invoiceId });
  }
}

async function read(
  deps: CreditDeps,
  invoiceId: string,
): Promise<{ decision: InvoiceDecision; email: string } | CreditKind> {
  try {
    const invoice = await deps.api.getInvoice(invoiceId);
    if (invoice === null) return "invalid";
    const client = await deps.api.getClient(invoice.userId);
    if (client === null) return "invalid";
    return { decision: decideInvoice(invoice, client, deps.secret), email: client.email };
  } catch (e) {
    return e instanceof WhmcsUnavailable ? "unavailable" : "error";
  }
}

export async function creditWhmcsInvoice(
  deps: CreditDeps,
  invoiceId: string,
  options: { readonly record: boolean } = { record: true },
): Promise<CreditKind> {
  const done = (kind: CreditKind, extra: Record<string, unknown> = {}): CreditKind => {
    deps.log({ event: "whmcs_credit", kind, invoiceId, ...extra });
    return kind;
  };
  if (!INVOICE.test(invoiceId) || !INSTALL.test(deps.installId)) return done("invalid");

  const got = await read(deps, invoiceId);
  if (typeof got === "string") return done(got);
  const { decision, email } = got;
  if (decision.kind === "mismatch") {
    if (options.record) await recordRefusal(deps, invoiceId, decision.reason, decision.amountMinor);
    return done("review", { reason: decision.reason });
  }
  if (decision.kind !== "credit") return done(decision.kind);

  const merchantTransactionId = merchantIdOf(deps.installId, invoiceId);
  let outcome: { kind: CreditKind; paymentId?: string; reason?: string };
  try {
    outcome = await deps.runTx(async (tx) => {
      const match = await systemWhmcs.customerByVerifiedEmail(tx, email);
      if (match.kind !== "one") return { kind: "unmatched" as const };

      const inserted = await customerRepos(tx, match.customerId).payments.insert({
        id: uuidv7(),
        merchantTransactionId,
        idempotencyKey: merchantTransactionId,
        amountMinor: decision.amountMinor,
        currency: decision.currency,
        gateway: "whmcs",
      });
      // Same key, other amount or currency: WHMCS changed a paid invoice. An operator looks.
      if (!inserted.ok) return { kind: "review" as const, reason: "changed" };

      const row = await systemPayments.byMerchantTransactionId(tx, merchantTransactionId, {
        lock: true,
      });
      if (row === null) return { kind: "error" as const };
      if (row.status !== "initiated") return { kind: "unchanged" as const, paymentId: row.id };

      const now = deps.clock.now();
      const payload = { source: "whmcs", invoiceId, currency: decision.currency };
      if (decision.currency !== match.currency) {
        // Never converted: the wallet keeps one currency (owner decision 57).
        await systemPayments.applyOutcome(tx, row.id, ["initiated"], "review", {
          verifyPayload: payload,
          verifiedAt: now,
        });
        await systemPayments.recordDiscrepancy(tx, {
          paymentId: row.id,
          reason: "whmcs_currency",
          note: `whmcs invoice ${invoiceId}: wallet currency`,
        });
        return { kind: "review" as const, paymentId: row.id, reason: "wallet_currency" };
      }

      if ((await readWalletRow(tx, row.customerId)) === null) {
        const opened = await openWallet(tx, row.customerId).catch(() => null);
        if (opened === null || !opened.ok) throw new Rollback("wallet");
      }
      const posted = await postTransaction(tx, {
        kind: "topup",
        reference: { type: "payment", id: row.id },
        idempotencyKey: ledgerKey.topup(row.id),
        actor: { type: "system" },
        postings: [
          {
            account: { type: "gateway_clearing" },
            direction: "debit",
            amountMinor: row.amountMinor,
          },
          {
            account: { type: "customer_wallet", customerId: row.customerId },
            direction: "credit",
            amountMinor: row.amountMinor,
          },
        ],
      });
      // A refused post throws: the transaction rolls back and nothing is credited (R16).
      if (!posted.ok) throw new Rollback("ledger");
      const moved = await systemPayments.applyOutcome(tx, row.id, ["initiated"], "credited", {
        verifyPayload: payload,
        verifiedAt: now,
        ledgerTransactionId: posted.value.transactionId,
      });
      if (!moved) throw new Rollback("state");
      return { kind: "credited" as const, paymentId: row.id };
    });
  } catch {
    // The cause is dropped (R14): a driver message can carry a statement.
    return done("error");
  }
  if (options.record && (outcome.kind === "unmatched" || outcome.reason === "changed")) {
    const reason = outcome.kind === "unmatched" ? "unmatched" : "changed";
    await recordRefusal(deps, invoiceId, reason, decision.amountMinor);
  }
  return done(outcome.kind, {
    ...(outcome.paymentId === undefined ? {} : { paymentId: outcome.paymentId }),
    ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
  });
}

export type ChangeKind = "flagged" | "unchanged" | "unknown" | "unavailable" | "invalid";

/**
 * Money review 2: WHMCS says an invoice changed (refunded, cancelled, unpaid again). When the panel
 * credited it and WHMCS no longer shows it paid, a payment discrepancy goes to the operator, who corrects
 * the wallet with a reversing adjustment (R5, the admin approval of wallet adjustments). Nothing is
 * reversed automatically: a refund rule is the owner's (CLAUDE.md, "Needs decision").
 */
export async function checkWhmcsInvoiceChanged(
  deps: CreditDeps,
  invoiceId: string,
): Promise<ChangeKind> {
  const done = (kind: ChangeKind, extra: Record<string, unknown> = {}): ChangeKind => {
    deps.log({ event: "whmcs_changed", kind, invoiceId, ...extra });
    return kind;
  };
  if (!INVOICE.test(invoiceId) || !INSTALL.test(deps.installId)) return done("invalid");
  let status: string;
  try {
    const invoice = await deps.api.getInvoice(invoiceId);
    if (invoice === null) return done("invalid");
    status = invoice.status;
  } catch {
    return done("unavailable");
  }
  const safeStatus = /^[A-Za-z ]{1,20}$/.test(status) ? status : "other";
  let result: { kind: ChangeKind; paymentId?: string };
  try {
    result = await deps.runTx(async (tx) => {
      const row = await systemPayments.byMerchantTransactionId(
        tx,
        merchantIdOf(deps.installId, invoiceId),
        { lock: false },
      );
      if (row === null) return { kind: "unknown" as const };
      if (row.status !== "credited" || status === "Paid") {
        return { kind: "unchanged" as const, paymentId: row.id };
      }
      await systemPayments.recordDiscrepancy(tx, {
        paymentId: row.id,
        reason: "whmcs_reversed",
        state: safeStatus,
        expectedMinor: row.amountMinor,
        note: `whmcs invoice ${invoiceId}: now ${safeStatus}`,
      });
      return { kind: "flagged" as const, paymentId: row.id };
    });
  } catch {
    return done("unavailable");
  }
  return done(result.kind, result.paymentId === undefined ? {} : { paymentId: result.paymentId });
}
