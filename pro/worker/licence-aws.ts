import { readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  CheckInLicenseCommand,
  CheckoutLicenseCommand,
  LicenseManagerClient,
} from "@aws-sdk/client-license-manager";
import { createLicenceCheck, type CheckoutInput, type LicenceStatus } from "./licence";

// PRO-5. The License Manager side of the licence check, on the buyer's instance with the instance role
// (R3). License Manager has no charge. The instance role needs license-manager:CheckoutLicense and CheckInLicense only
// (pro/box/README.md).

export const LICENCE_FILE = "/var/lib/tc/licence.json";

// The "pro" entitlement is a Count entitlement (MaxCount 1), measured on 23 Nov 2026 against a real
// AWS Marketplace licence of this product: Unit "None" is refused, Unit "Count", Value "1" is allowed.
// Unit "None" stays as a fallback for a tiered entitlement. A PROVISIONAL checkout holds the one unit until
// it expires, so it is checked in at once; a failed check-in does not undo an allowed checkout.
const NOT_ALLOWED = "NoEntitlementsAllowedException";

interface LicenceClient {
  send(command: CheckoutLicenseCommand | CheckInLicenseCommand): Promise<unknown>;
}

export function checkoutWith(client: LicenceClient) {
  return async (input: CheckoutInput) => {
    const attempt = (entitlement: { Name: string; Unit: "Count" | "None"; Value?: string }) =>
      client.send(
        new CheckoutLicenseCommand({
          ProductSKU: input.productSku,
          // PROVISIONAL: a check that the contract allows use; nothing is consumed for good.
          CheckoutType: "PROVISIONAL",
          KeyFingerprint: input.keyFingerprint,
          Entitlements: [entitlement],
          ClientToken: input.clientToken,
        }),
      ) as Promise<{ Expiration?: string; LicenseConsumptionToken?: string }>;
    let out: { Expiration?: string; LicenseConsumptionToken?: string };
    try {
      out = await attempt({ Name: input.entitlement, Unit: "Count", Value: "1" });
    } catch (error) {
      if ((error as { name?: unknown })?.name !== NOT_ALLOWED) throw error;
      out = await attempt({ Name: input.entitlement, Unit: "None" });
    }
    if (out.LicenseConsumptionToken !== undefined) {
      await client
        .send(new CheckInLicenseCommand({ LicenseConsumptionToken: out.LicenseConsumptionToken }))
        .catch(() => undefined);
    }
    return out.Expiration === undefined ? {} : { expiration: out.Expiration };
  };
}

async function writeStatus(status: LicenceStatus): Promise<void> {
  // Write, then rename: a reader never sees half a file.
  const tmp = `${LICENCE_FILE}.tmp`;
  await writeFile(tmp, `${JSON.stringify(status)}\n`, { mode: 0o644 });
  await rename(tmp, LICENCE_FILE);
}

export async function readLicenceStatus(path = LICENCE_FILE): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

export function licenceCheckFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  log: (e: Record<string, unknown>) => void,
): () => Promise<void> {
  let client: LicenseManagerClient | undefined;
  const sku = env["TC_PRODUCT_SKU"] ?? "";
  return createLicenceCheck({
    productSku: /^[A-Za-z0-9-]{1,128}$/.test(sku) ? sku : "",
    entitlement: env["TC_LICENCE_ENTITLEMENT"] || "pro",
    clock: { now: () => new Date() },
    newToken: randomUUID,
    checkout: (input) => {
      client ??= new LicenseManagerClient({
        region: env["AWS_REGION"] || "us-east-1",
        maxAttempts: 3,
      });
      return checkoutWith(client)(input);
    },
    write: writeStatus,
    log,
  });
}
