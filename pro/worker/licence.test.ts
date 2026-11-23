import { describe, expect, it } from "vitest";
import {
  AWS_MARKETPLACE_KEY_FINGERPRINT,
  createLicenceCheck,
  licenceAllowsUpdate,
  type LicenceStatus,
} from "./licence";

const NOW = new Date("2026-12-01T10:00:00Z");
const clock = { now: () => NOW };
const SKU = "prod-abc123def456";

function run(checkout: (input: unknown) => Promise<{ expiration?: string }>) {
  const written: LicenceStatus[] = [];
  const logs: Record<string, unknown>[] = [];
  const inputs: unknown[] = [];
  const check = createLicenceCheck({
    productSku: SKU,
    entitlement: "pro",
    clock,
    newToken: () => "token-1",
    checkout: (input) => {
      inputs.push(input);
      return checkout(input);
    },
    write: (s) => {
      written.push(s);
      return Promise.resolve();
    },
    log: (e) => logs.push(e),
  });
  return { check, written, logs, inputs };
}

describe("createLicenceCheck", () => {
  it("checks out the AWS Marketplace licence and records it as active", async () => {
    const { check, written, inputs } = run(async () => ({ expiration: "2029-11-30T00:00:00Z" }));
    await check();
    expect(inputs[0]).toEqual({
      productSku: SKU,
      keyFingerprint: AWS_MARKETPLACE_KEY_FINGERPRINT,
      entitlement: "pro",
      clientToken: "token-1",
    });
    expect(written).toEqual([
      { state: "active", checkedAt: NOW.toISOString(), expiresAt: "2029-11-30T00:00:00Z" },
    ]);
  });

  it("records a missing or ended licence as expired", async () => {
    for (const name of [
      "NoEntitlementsAllowedException",
      "EntitlementNotAllowedException",
      "ResourceNotFoundException",
    ]) {
      const { check, written } = run(async () => {
        throw Object.assign(new Error("x"), { name });
      });
      await check();
      expect(written).toEqual([{ state: "expired", checkedAt: NOW.toISOString() }]);
    }
  });

  it("records a check that could not complete as unknown, never as expired", async () => {
    for (const name of ["ThrottlingException", "AccessDeniedException", "TypeError"]) {
      const { check, written, logs } = run(async () => {
        throw Object.assign(new Error("arn:aws:iam::123456789012:role/x"), { name });
      });
      await check();
      expect(written).toEqual([{ state: "unknown", checkedAt: NOW.toISOString() }]);
      // Only the error name is logged, never its message (R14).
      expect(JSON.stringify(logs)).not.toContain("123456789012");
      expect(logs).toContainEqual({ event: "licence_check", state: "unknown", reason: name });
    }
  });

  it("does nothing without a product SKU (not a Marketplace install)", async () => {
    const written: LicenceStatus[] = [];
    const check = createLicenceCheck({
      productSku: "",
      entitlement: "pro",
      clock,
      newToken: () => "t",
      checkout: () => Promise.reject(new Error("must not be called")),
      write: (s) => {
        written.push(s);
        return Promise.resolve();
      },
      log: () => {},
    });
    await check();
    expect(written).toEqual([{ state: "unknown", checkedAt: NOW.toISOString() }]);
  });
});

describe("licenceAllowsUpdate", () => {
  const at = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

  it("allows updates only for an active licence checked in the last 48 hours", () => {
    expect(licenceAllowsUpdate({ state: "active", checkedAt: at(1) }, NOW)).toBe(true);
    expect(licenceAllowsUpdate({ state: "active", checkedAt: at(47) }, NOW)).toBe(true);
    expect(licenceAllowsUpdate({ state: "active", checkedAt: at(49) }, NOW)).toBe(false);
  });

  it("refuses updates for expired, unknown, missing or malformed status (R16)", () => {
    expect(licenceAllowsUpdate({ state: "expired", checkedAt: at(1) }, NOW)).toBe(false);
    expect(licenceAllowsUpdate({ state: "unknown", checkedAt: at(1) }, NOW)).toBe(false);
    expect(licenceAllowsUpdate(null, NOW)).toBe(false);
    expect(licenceAllowsUpdate({ state: "active", checkedAt: "not a date" }, NOW)).toBe(false);
    expect(licenceAllowsUpdate({ state: "active", checkedAt: at(-2) }, NOW)).toBe(false);
  });
});
