import { v7 as uuidv7 } from "uuid";
import { expect, it } from "vitest";
import type { Tx } from "../client";
import { systemPayments } from "../repositories/system/payments";
import type { MethodsTakingCustomerId } from "../repositories/customer/index";
import { waitForLockWait } from "../testing/lock-wait";
import { runTransaction, type DatabaseRole } from "../tx";
import { newCustomer, newLedgerAccount, postLedger, systemAccount } from "./fixtures";
import { inTransaction, insertRow } from "./sql";
import { useTempDatabase } from "./temp-db";

const t = useTempDatabase();
const as = <T>(role: DatabaseRole, fn: (tx: Tx) => Promise<T>) =>
  runTransaction(t.db, fn, { role });
const ROLES: DatabaseRole[] = ["web_rw", "worker_rw"];

// R8 at type level: no function of the system module takes a customer id. The transaction, the
// first argument of each, is taken off first: the check walks every property of a type it is given.
type SansTx<A extends unknown[]> = A extends [Tx, ...infer Rest] ? Rest : never;
type WithoutTx = {
  [K in keyof typeof systemPayments]: (
    ...args: SansTx<Parameters<(typeof systemPayments)[K]>>
  ) => unknown;
};
type AssertNever<T extends never> = T;
export type SystemTakesNoCustomerId = AssertNever<MethodsTakingCustomerId<{ payments: WithoutTx }>>;
// The check does see a customer id in these functions.
export type CaughtInSystem = AssertNever<
  // @ts-expect-error the check finds a customerId
  MethodsTakingCustomerId<{ payments: { f(i: { customerId: string }): void } }>
>;

const insertPayment = (customerId: string, over: Record<string, unknown> = {}) =>
  insertRow(t.pool, "payments", {
    customer_id: customerId,
    gateway: "eps",
    merchant_transaction_id: "MTX-" + uuidv7(),
    idempotency_key: uuidv7(),
    amount_minor: 15_000,
    currency: "BDT",
    ...over,
  });
const mtxOf = async (id: string) =>
  (await t.pool.query("select merchant_transaction_id as m from payments where id = $1", [id]))
    .rows[0].m as string;
const rowOf = async (id: string) =>
  (
    await t.pool.query(
      `select status, gateway_transaction_id, verify_payload, verified_at, ledger_transaction_id
         from payments where id = $1`,
      [id],
    )
  ).rows[0];
async function ledgerTransaction(customerId: string): Promise<string> {
  const clearing = await systemAccount(t.pool, "gateway_clearing");
  const wallet = await newLedgerAccount(t.pool, "customer_wallet", customerId);
  return inTransaction(t.pool, (c) =>
    postLedger(c, "test-" + uuidv7(), [
      [clearing, "debit", 15_000],
      [wallet, "credit", 15_000],
    ]),
  );
}

it("the system module has exactly the five functions of open point 4, and none takes a customer id", () => {
  expect(Object.keys(systemPayments).sort()).toEqual([
    "applyOutcome",
    "byMerchantTransactionId",
    "gatewayIdUsedElsewhere",
    "recordDiscrepancy",
    "sweepable",
  ]);
  expect(Object.isFrozen(systemPayments)).toBe(true);
});

it.each(ROLES)(
  "byMerchantTransactionId as %s reads the row and its customer comes from the row",
  async (role) => {
    const c = await newCustomer(t.pool);
    const id = await insertPayment(c);
    const row = await as(role, (tx) =>
      systemPayments.byMerchantTransactionId(tx, "unused", { lock: false }),
    );
    expect(row).toBeNull();
    const found = await as(role, async (tx) =>
      systemPayments.byMerchantTransactionId(tx, await mtxOf(id), { lock: false }),
    );
    expect(found).toEqual({
      id,
      customerId: c,
      gateway: "eps",
      merchantTransactionId: expect.any(String),
      amountMinor: 15_000n,
      currency: "BDT",
      status: "initiated",
      gatewayTransactionId: null,
      verifiedAt: null,
      ledgerTransactionId: null,
      createdAt: expect.any(Date),
    });
  },
);

it("byMerchantTransactionId answers null for an unknown id and for text that cannot be one, without a query", async () => {
  const c = await newCustomer(t.pool);
  await insertPayment(c);
  for (const bad of ["MTX-" + uuidv7(), "short", "has space in it 123", "x".repeat(129), ""]) {
    expect(
      await as("web_rw", (tx) => systemPayments.byMerchantTransactionId(tx, bad, { lock: true })),
    ).toBeNull();
  }
});

it("byMerchantTransactionId with lock blocks a second locking read until the first commits", async () => {
  const c = await newCustomer(t.pool);
  const id = await insertPayment(c);
  const mtx = await mtxOf(id);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let held!: () => void;
  const firstHolds = new Promise<void>((resolve) => (held = resolve));
  const first = as("web_rw", async (tx) => {
    const row = await systemPayments.byMerchantTransactionId(tx, mtx, { lock: true });
    held();
    await gate;
    return row;
  });
  await firstHolds;
  const second = as("worker_rw", (tx) =>
    systemPayments.byMerchantTransactionId(tx, mtx, { lock: true }),
  );
  await waitForLockWait(t.pool, t.name); // throws when the second read never blocks
  release();
  expect((await first)?.id).toBe(id);
  expect((await second)?.id).toBe(id);
});

it("gatewayIdUsedElsewhere is true only for another payment with the same gateway id", async () => {
  const c = await newCustomer(t.pool);
  const a = await insertPayment(c, { gateway_transaction_id: "EPS-GW-A", status: "redirected" });
  const b = await insertPayment(c);
  for (const role of ROLES) {
    expect(await as(role, (tx) => systemPayments.gatewayIdUsedElsewhere(tx, "EPS-GW-A", b))).toBe(
      true,
    );
    expect(await as(role, (tx) => systemPayments.gatewayIdUsedElsewhere(tx, "EPS-GW-A", a))).toBe(
      false,
    );
    expect(await as(role, (tx) => systemPayments.gatewayIdUsedElsewhere(tx, "EPS-GW-Z", b))).toBe(
      false,
    );
  }
  await expect(
    as("web_rw", (tx) => systemPayments.gatewayIdUsedElsewhere(tx, "", b)),
  ).rejects.toThrow(TypeError);
  await expect(
    as("web_rw", (tx) => systemPayments.gatewayIdUsedElsewhere(tx, "EPS-GW-A", "x")),
  ).rejects.toThrow(TypeError);
});

it.each(ROLES)(
  "applyOutcome as %s moves the guarded states and sets only the given fields",
  async (role) => {
    const c = await newCustomer(t.pool);
    const id = await insertPayment(c);
    const verifiedAt = new Date("2026-11-11T10:00:00.000Z");
    const ok = await as(role, (tx) =>
      systemPayments.applyOutcome(tx, id, ["initiated", "redirected"], "failed", {
        gatewayTransactionId: `EPS-GW-9-${role}`,
        verifyPayload: { status: "Failed" },
        verifiedAt,
      }),
    );
    expect(ok).toBe(true);
    expect(await rowOf(id)).toEqual({
      status: "failed",
      gateway_transaction_id: `EPS-GW-9-${role}`,
      verify_payload: { status: "Failed" },
      verified_at: verifiedAt,
      ledger_transaction_id: null,
    });
  },
);

it("applyOutcome leaves the columns it was not given as they were", async () => {
  const c = await newCustomer(t.pool);
  const id = await insertPayment(c, {
    gateway_transaction_id: "EPS-GW-KEEP",
    status: "redirected",
  });
  expect(
    await as("worker_rw", (tx) =>
      systemPayments.applyOutcome(tx, id, ["redirected"], "cancelled", {}),
    ),
  ).toBe(true);
  expect(await rowOf(id)).toMatchObject({
    status: "cancelled",
    gateway_transaction_id: "EPS-GW-KEEP",
  });
});

it("applyOutcome with from initiated and redirected on a credited row returns false and changes nothing", async () => {
  const c = await newCustomer(t.pool);
  const ledger = await ledgerTransaction(c);
  const id = await insertPayment(c, { status: "credited", ledger_transaction_id: ledger });
  for (const role of ROLES) {
    expect(
      await as(role, (tx) =>
        systemPayments.applyOutcome(tx, id, ["initiated", "redirected"], "failed", {
          gatewayTransactionId: "EPS-GW-LATE",
        }),
      ),
    ).toBe(false);
  }
  expect(await rowOf(id)).toMatchObject({
    status: "credited",
    gateway_transaction_id: null,
    ledger_transaction_id: ledger,
  });
});

it("applyOutcome to credited with a ledger transaction works; without one, payments_credit_check refuses", async () => {
  const c = await newCustomer(t.pool);
  const withLedger = await insertPayment(c);
  const without = await insertPayment(c);
  const ledger = await ledgerTransaction(c);
  expect(
    await as("web_rw", (tx) =>
      systemPayments.applyOutcome(tx, withLedger, ["initiated"], "credited", {
        ledgerTransactionId: ledger,
        verifiedAt: new Date(),
      }),
    ),
  ).toBe(true);
  expect(await rowOf(withLedger)).toMatchObject({
    status: "credited",
    ledger_transaction_id: ledger,
  });
  await expect(
    as("web_rw", (tx) => systemPayments.applyOutcome(tx, without, ["initiated"], "credited", {})),
  ).rejects.toMatchObject({ code: "23514", constraint: "payments_credit_check" });
  expect((await rowOf(without)).status).toBe("initiated");
});

it("applyOutcome refuses arguments that cannot be right with a TypeError and writes nothing", async () => {
  const c = await newCustomer(t.pool);
  const id = await insertPayment(c);
  const call = (...a: [string, readonly string[], string, Record<string, unknown>]) =>
    as("web_rw", (tx) => systemPayments.applyOutcome(tx, ...a));
  await expect(call("x", ["initiated"], "failed", {})).rejects.toThrow(TypeError);
  await expect(call(id, [], "failed", {})).rejects.toThrow(TypeError);
  await expect(call(id, ["pending"], "failed", {})).rejects.toThrow(TypeError);
  await expect(call(id, ["initiated"], "pending", {})).rejects.toThrow(TypeError);
  await expect(call(id, ["initiated"], "failed", { gatewayTransactionId: "" })).rejects.toThrow(
    TypeError,
  );
  await expect(call(id, ["initiated"], "failed", { ledgerTransactionId: "x" })).rejects.toThrow(
    TypeError,
  );
  await expect(call(id, ["initiated"], "failed", { verifiedAt: new Date("nope") })).rejects.toThrow(
    TypeError,
  );
  expect((await rowOf(id)).status).toBe("initiated");
});

it.each(ROLES)(
  "sweepable as %s returns the old open payments, oldest first, within the limit",
  async (role) => {
    const c = await newCustomer(t.pool);
    const old1 = await insertPayment(c, { created_at: "2026-11-10T09:00:00Z" });
    const old2 = await insertPayment(c, {
      created_at: "2026-11-10T10:00:00Z",
      status: "redirected",
    });
    const fresh = await insertPayment(c, { created_at: "2026-11-11T09:59:00Z" });
    const closed = await insertPayment(c, { created_at: "2026-11-10T08:00:00Z", status: "failed" });
    const before = new Date("2026-11-11T09:58:00.000Z");
    const rows = await as(role, (tx) => systemPayments.sweepable(tx, { before, limit: 10 }));
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([old1, old2]));
    expect(ids).not.toContain(fresh);
    expect(ids).not.toContain(closed);
    expect(ids.indexOf(old1)).toBeLessThan(ids.indexOf(old2));
    const one = await as(role, (tx) => systemPayments.sweepable(tx, { before, limit: 1 }));
    expect(one).toHaveLength(1);
    for (const bad of [0, 501, 1.5]) {
      await expect(
        as(role, (tx) => systemPayments.sweepable(tx, { before, limit: bad })),
      ).rejects.toThrow(TypeError);
    }
    await expect(
      as(role, (tx) => systemPayments.sweepable(tx, { before: new Date("nope"), limit: 1 })),
    ).rejects.toThrow(TypeError);
  },
);

it("sweepable skips a row that another connection holds locked", async () => {
  const c = await newCustomer(t.pool);
  const id = await insertPayment(c, { created_at: "2026-11-10T09:00:00Z" });
  const before = new Date("2026-11-11T09:58:00.000Z");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let held!: () => void;
  const firstHolds = new Promise<void>((resolve) => (held = resolve));
  const first = as("worker_rw", async (tx) => {
    const rows = await systemPayments.sweepable(tx, { before, limit: 500 });
    held();
    await gate;
    return rows.map((r) => r.id);
  });
  await firstHolds;
  const seenBySecond = await as("worker_rw", (tx) =>
    systemPayments.sweepable(tx, { before, limit: 500 }),
  );
  release();
  expect(await first).toContain(id);
  expect(seenBySecond.map((r) => r.id)).not.toContain(id);
});

it.each(ROLES)(
  "recordDiscrepancy as %s writes one open payment discrepancy with the given details",
  async (role) => {
    const paymentId = uuidv7();
    await as(role, (tx) =>
      systemPayments.recordDiscrepancy(tx, {
        paymentId,
        reason: "amount_mismatch",
        expectedMinor: 15_000n,
        gotMinor: 1_500n,
        state: "redirected",
      }),
    );
    const { rows } = await t.pool.query(
      "select kind, status, details from discrepancies where details->>'paymentId' = $1",
      [paymentId],
    );
    expect(rows).toEqual([
      {
        kind: "payment",
        status: "open",
        details: {
          paymentId,
          reason: "amount_mismatch",
          expectedMinor: "15000",
          gotMinor: "1500",
          state: "redirected",
        },
      },
    ]);
  },
);

it("recordDiscrepancy refuses a key outside the allowed six, a non-scalar value and a bad paymentId, and writes nothing", async () => {
  const before = Number((await t.pool.query("select count(*) as n from discrepancies")).rows[0].n);
  const bad: Record<string, unknown>[] = [
    { paymentId: uuidv7(), reason: "x", email: "a@example.test" },
    { paymentId: uuidv7(), name: "A B" },
    { paymentId: uuidv7(), phone: "+8801712345678" },
    { paymentId: uuidv7(), payload: { a: 1 } },
    { paymentId: uuidv7(), reason: { nested: true } },
    { paymentId: uuidv7(), reason: "r".repeat(201) },
    { paymentId: "not-a-uuid", reason: "x" },
    { paymentId: uuidv7(), expectedMinor: 1.5 },
    {},
  ];
  for (const details of bad) {
    await expect(
      as("web_rw", (tx) => systemPayments.recordDiscrepancy(tx, details)),
    ).rejects.toThrow(TypeError);
  }
  await expect(
    as("web_rw", (tx) =>
      systemPayments.recordDiscrepancy(tx, null as unknown as Record<string, unknown>),
    ),
  ).rejects.toThrow(TypeError);
  expect(Number((await t.pool.query("select count(*) as n from discrepancies")).rows[0].n)).toBe(
    before,
  );
});
