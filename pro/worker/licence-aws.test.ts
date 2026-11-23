import { CheckInLicenseCommand, CheckoutLicenseCommand } from "@aws-sdk/client-license-manager";
import { describe, expect, it } from "vitest";
import { checkoutWith } from "./licence-aws";

// PRO-9 (version 1.0.1). Measured on 23 Nov 2026 against a real AWS Marketplace licence of this product
// (account 739275468267, $0 test agreement): the "pro" entitlement is a Count entitlement (MaxCount 1).
// A checkout with Unit "None" is refused with NoEntitlementsAllowedException; Unit "Count", Value "1"
// is allowed. A PROVISIONAL checkout holds the one unit until it expires, so it is checked in at once.

const INPUT = {
  productSku: "prod-ill7oycvmsrme",
  keyFingerprint: "aws:294406891311:AWS/Marketplace:issuer-fingerprint",
  entitlement: "pro",
  clientToken: "token-1",
};

function named(name: string): Error {
  const e = new Error(name);
  e.name = name;
  return e;
}

function fakeClient(answer: (cmd: unknown) => unknown) {
  const sent: unknown[] = [];
  return {
    sent,
    client: {
      send: (cmd: unknown) => {
        sent.push(cmd);
        try {
          return Promise.resolve(answer(cmd));
        } catch (e) {
          return Promise.reject(e);
        }
      },
    },
  };
}

describe("checkoutWith (License Manager)", () => {
  it("checks out one Count unit of the entitlement and checks it in at once", async () => {
    const f = fakeClient((cmd) =>
      cmd instanceof CheckoutLicenseCommand
        ? { LicenseConsumptionToken: "lct-1", Expiration: "2026-12-01T11:00:00" }
        : {},
    );
    const out = await checkoutWith(f.client)(INPUT);
    expect(out).toEqual({ expiration: "2026-12-01T11:00:00" });
    const first = f.sent[0] as CheckoutLicenseCommand;
    expect(first).toBeInstanceOf(CheckoutLicenseCommand);
    expect(first.input).toMatchObject({
      ProductSKU: "prod-ill7oycvmsrme",
      CheckoutType: "PROVISIONAL",
      KeyFingerprint: INPUT.keyFingerprint,
      Entitlements: [{ Name: "pro", Unit: "Count", Value: "1" }],
      ClientToken: "token-1",
    });
    const second = f.sent[1] as CheckInLicenseCommand;
    expect(second).toBeInstanceOf(CheckInLicenseCommand);
    expect(second.input).toEqual({ LicenseConsumptionToken: "lct-1" });
  });

  it("falls back to a tiered (Unit None) entitlement when the Count checkout is not allowed", async () => {
    const f = fakeClient((cmd) => {
      if (cmd instanceof CheckoutLicenseCommand) {
        const unit = cmd.input.Entitlements?.[0]?.Unit;
        if (unit === "Count") throw named("NoEntitlementsAllowedException");
        return {};
      }
      return {};
    });
    await expect(checkoutWith(f.client)(INPUT)).resolves.toEqual({});
    const units = f.sent
      .filter((c) => c instanceof CheckoutLicenseCommand)
      .map((c) => (c as CheckoutLicenseCommand).input.Entitlements?.[0]?.Unit);
    expect(units).toEqual(["Count", "None"]);
    expect(f.sent.some((c) => c instanceof CheckInLicenseCommand)).toBe(false);
  });

  it("reports no licence when neither form is allowed", async () => {
    const f = fakeClient(() => {
      throw named("NoEntitlementsAllowedException");
    });
    await expect(checkoutWith(f.client)(INPUT)).rejects.toMatchObject({
      name: "NoEntitlementsAllowedException",
    });
  });

  it("does not retry a check that could not complete (throttling, access, network)", async () => {
    const f = fakeClient(() => {
      throw named("ThrottlingException");
    });
    await expect(checkoutWith(f.client)(INPUT)).rejects.toMatchObject({
      name: "ThrottlingException",
    });
    expect(f.sent).toHaveLength(1);
  });

  it("keeps an allowed checkout when the check-in fails", async () => {
    const f = fakeClient((cmd) => {
      if (cmd instanceof CheckInLicenseCommand) throw named("AccessDeniedException");
      return { LicenseConsumptionToken: "lct-1" };
    });
    await expect(checkoutWith(f.client)(INPUT)).resolves.toEqual({});
  });
});
