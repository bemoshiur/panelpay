import { expect, it } from "vitest";
import type { Tx } from "../client";
import type { MethodsTakingCustomerId } from "../repositories/customer/index";
import { systemWhmcs } from "../repositories/system/whmcs";
import { runTransaction } from "../tx";
import { newCustomer } from "./fixtures";
import { useTempDatabase } from "./temp-db";

const t = useTempDatabase();
const asWeb = <T>(fn: (tx: Tx) => Promise<T>) => runTransaction(t.db, fn, { role: "web_rw" });

// R8 at type level: no function of the module takes a customer id (as test/payments-system.test.ts).
type SansTx<A extends unknown[]> = A extends [Tx, ...infer Rest] ? Rest : never;
type WithoutTx = {
  [K in keyof typeof systemWhmcs]: (...args: SansTx<Parameters<(typeof systemWhmcs)[K]>>) => unknown;
};
type AssertNever<T extends never> = T;
export type WhmcsTakesNoCustomerId = AssertNever<MethodsTakingCustomerId<{ whmcs: WithoutTx }>>;

const verified = (email: string, over: Record<string, unknown> = {}) =>
  newCustomer(t.pool, { email, email_verified_at: new Date().toISOString(), ...over });

it("has exactly one function, and it takes no customer id", () => {
  expect(Object.keys(systemWhmcs)).toEqual(["customerByVerifiedEmail"]);
  expect(Object.isFrozen(systemWhmcs)).toBe(true);
});

it("finds the one active, verified customer by e-mail, case-insensitive, with the market currency", async () => {
  const id = await verified("Buyer.One@Example.test");
  const got = await asWeb((tx) => systemWhmcs.customerByVerifiedEmail(tx, "buyer.one@example.TEST"));
  expect(got).toEqual({ kind: "one", customerId: id, currency: "BDT" });
});

it("does not match an unverified, suspended or unknown customer (R16)", async () => {
  await newCustomer(t.pool, { email: "unverified@example.test" });
  await verified("suspended@example.test", { status: "suspended" });
  for (const email of ["unverified@example.test", "suspended@example.test", "nobody@example.test"]) {
    expect(await asWeb((tx) => systemWhmcs.customerByVerifiedEmail(tx, email))).toEqual({
      kind: "none",
    });
  }
});

it("refuses to pick when two customers share the address", async () => {
  await verified("shared@example.test");
  await verified("SHARED@example.test");
  expect(await asWeb((tx) => systemWhmcs.customerByVerifiedEmail(tx, "shared@example.test"))).toEqual({
    kind: "many",
  });
});

it("never queries with a value that is not an address", async () => {
  for (const email of ["", "no-at-sign", "a b@example.test", "x".repeat(400) + "@e.test"]) {
    expect(await asWeb((tx) => systemWhmcs.customerByVerifiedEmail(tx, email))).toEqual({
      kind: "none",
    });
  }
});
