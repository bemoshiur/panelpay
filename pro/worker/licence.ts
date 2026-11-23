// PRO-5. The AWS Marketplace licence of the Pro edition (AMI product with contract pricing, USD 199 for
// 36 months). AWS Marketplace creates the licence in the buyer's own AWS License Manager; the worker checks
// it out at start and daily with the instance role, and records the result in /var/lib/tc/licence.json.
//
// The EULA rule (docs/pro/single-ec2-plan.md): an ended contract NEVER stops the installed version. The
// status only decides whether `tc-update` may install a newer release: updates need a licence that was
// active at a check in the last 48 hours; anything else refuses the update (R16). The running platform
// does not read this file at all.

/** The issuer of every licence AWS Marketplace creates (AWS Marketplace seller guide, License Manager). */
export const AWS_MARKETPLACE_KEY_FINGERPRINT =
  "aws:294406891311:AWS/Marketplace:issuer-fingerprint";

export interface LicenceStatus {
  readonly state: "active" | "expired" | "unknown";
  readonly checkedAt: string;
  readonly expiresAt?: string;
}

export interface CheckoutInput {
  readonly productSku: string;
  readonly keyFingerprint: string;
  readonly entitlement: string;
  readonly clientToken: string;
}

// License Manager's answers for "this account has no such licence, or it no longer allows this". Every
// other failure (throttling, access, network) means the check did not complete: unknown, never expired.
const NO_LICENCE = new Set([
  "NoEntitlementsAllowedException",
  "EntitlementNotAllowedException",
  "ResourceNotFoundException",
]);

const UPDATE_WINDOW_MS = 48 * 3_600_000;

export function createLicenceCheck(deps: {
  readonly productSku: string;
  readonly entitlement: string;
  readonly clock: { now(): Date };
  readonly newToken: () => string;
  readonly checkout: (input: CheckoutInput) => Promise<{ readonly expiration?: string }>;
  readonly write: (status: LicenceStatus) => Promise<void>;
  readonly log: (e: Record<string, unknown>) => void;
}): () => Promise<void> {
  return async () => {
    const checkedAt = deps.clock.now().toISOString();
    let status: LicenceStatus;
    let reason: string | undefined;
    if (deps.productSku === "") {
      status = { state: "unknown", checkedAt };
      reason = "no_sku";
    } else {
      try {
        const out = await deps.checkout({
          productSku: deps.productSku,
          keyFingerprint: AWS_MARKETPLACE_KEY_FINGERPRINT,
          entitlement: deps.entitlement,
          clientToken: deps.newToken(),
        });
        status =
          out.expiration === undefined
            ? { state: "active", checkedAt }
            : { state: "active", checkedAt, expiresAt: out.expiration };
      } catch (error) {
        const name =
          typeof (error as { name?: unknown })?.name === "string"
            ? (error as { name: string }).name.slice(0, 80)
            : "unknown_error";
        status = { state: NO_LICENCE.has(name) ? "expired" : "unknown", checkedAt };
        reason = name;
      }
    }
    await deps.write(status);
    deps.log(
      reason === undefined
        ? { event: "licence_check", state: status.state }
        : { event: "licence_check", state: status.state, reason },
    );
  };
}

/** May `tc-update` install a newer release? Only with a fresh active licence; refuses on anything else. */
export function licenceAllowsUpdate(status: unknown, now: Date): boolean {
  if (typeof status !== "object" || status === null) return false;
  const s = status as Partial<LicenceStatus>;
  if (s.state !== "active" || typeof s.checkedAt !== "string") return false;
  const at = Date.parse(s.checkedAt);
  if (Number.isNaN(at)) return false;
  const age = now.getTime() - at;
  return age >= 0 && age <= UPDATE_WINDOW_MS;
}
