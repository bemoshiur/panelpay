import { v7 as uuidv7 } from "uuid";
import { ledgerKey, openWallet, postTransaction } from "@tc/core";
import { customerRepos, readWalletRow, systemPayments, systemWhmcs, type Tx } from "@tc/db";
import { decideInvoice } from "./invoice";
import { WhmcsUnavailable, type WhmcsApi } from "./whmcs-api";

// PRO-6. Credits the panel wallet for one paid WHMCS top-up invoice. The caller (the bridge endpoint,
// signed by the WHMCS hook) only names the invoice id; everything that decides the credit is read from
// the WHMCS API, server to server (the R6 rule for the Pro edition, owner decision 23 Nov 2026):
//
//   1. GetInvoice: paid in full, top-up lines only, the amount from those lines (invoice.ts).
//   2. GetClientsDetails: the client's e-mail and currency.
//   3. One transaction: the panel customer with that verified e-mail (exactly one), the payment row
//      (gateway "whmcs", merchant id WHMCS-<install>-<invoice>, unique: a second call replays), locked;
//      a different currency than the wallet goes to review, never converted; otherwise the ledger post
//      (gateway_clearing -> customer_wallet, idempotency key topup:<payment id>) and the row credited.
//
// Idempotent end to end (R7): the hook may fire twice, an operator may re-send; one credit at most.
// Fails closed (R16): any check that cannot complete credits nothing. Logs carry kinds and ids only.

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
  readonly runTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  readonly clock: { now(): Date };
  readonly log: (e: Record<string, unknown>) => void;
}

const INSTALL = /^[a-z0-9]{4,16}$/;
const INVOICE = /^[1-9][0-9]{0,9}$/;

class Rollback extends Error {}

export async function creditWhmcsInvoice(deps: CreditDeps, invoiceId: string): Promise<CreditKind> {
  const done = (kind: CreditKind, extra: Record<string, unknown> = {}): CreditKind => {
    deps.log({ event: "whmcs_credit", kind, invoiceId, ...extra });
    return kind;
  };
  if (!INVOICE.test(invoiceId) || !INSTALL.test(deps.installId)) return done("invalid");

  let invoice;
  let client;
  try {
    invoice = await deps.api.getInvoice(invoiceId);
    if (invoice === null) return done("invalid");
    client = await deps.api.getClient(invoice.userId);
    if (client === null) return done("invalid");
  } catch (e) {
    return done(e instanceof WhmcsUnavailable ? "unavailable" : "error");
  }

  const decision = decideInvoice(invoice, client);
  if (decision.kind !== "credit") return done(decision.kind);

  const merchantTransactionId = `WHMCS-${deps.installId}-${invoiceId}`;
  try {
    const outcome = await deps.runTx(
      async (tx): Promise<{ kind: CreditKind; paymentId?: string }> => {
        const match = await systemWhmcs.customerByVerifiedEmail(tx, client.email);
        if (match.kind !== "one") return { kind: "unmatched" };

        const inserted = await customerRepos(tx, match.customerId).payments.insert({
          id: uuidv7(),
          merchantTransactionId,
          idempotencyKey: merchantTransactionId,
          amountMinor: decision.amountMinor,
          currency: decision.currency,
          gateway: "whmcs",
        });
        // Same key, other amount or currency: WHMCS changed a paid invoice. An operator looks.
        if (!inserted.ok) return { kind: "review" };

        const row = await systemPayments.byMerchantTransactionId(tx, merchantTransactionId, {
          lock: true,
        });
        if (row === null) return { kind: "error" };
        if (row.status !== "initiated") return { kind: "unchanged", paymentId: row.id };

        const now = deps.clock.now();
        const payload = { source: "whmcs", invoiceId, currency: decision.currency };
        if (decision.currency !== match.currency) {
          // Never converted: the wallet keeps one currency (owner decision 57). The reseller sets the
          // WHMCS client currency to the panel market currency, or an operator refunds in WHMCS.
          await systemPayments.applyOutcome(tx, row.id, ["initiated"], "review", {
            verifyPayload: payload,
            verifiedAt: now,
          });
          await systemPayments.recordDiscrepancy(tx, {
            paymentId: row.id,
            reason: "whmcs_currency",
          });
          return { kind: "review", paymentId: row.id };
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
        return { kind: "credited", paymentId: row.id };
      },
    );
    return done(
      outcome.kind,
      outcome.paymentId === undefined ? {} : { paymentId: outcome.paymentId },
    );
  } catch {
    // The cause is dropped (R14): a driver message can carry a statement.
    return done("error");
  }
}
