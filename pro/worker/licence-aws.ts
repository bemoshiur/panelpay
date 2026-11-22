import { readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { CheckoutLicenseCommand, LicenseManagerClient } from "@aws-sdk/client-license-manager";
import { createLicenceCheck, type CheckoutInput, type LicenceStatus } from "./licence";

// PRO-5. The License Manager side of the licence check, on the buyer's instance with the instance role
// (R3). License Manager has no charge. The instance role needs license-manager:CheckoutLicense,
// CheckInLicense and ListReceivedLicenses (pro/box/README.md).

export const LICENCE_FILE = "/var/lib/tc/licence.json";

function checkoutWith(client: LicenseManagerClient) {
  return async (input: CheckoutInput) => {
    const out = await client.send(
      new CheckoutLicenseCommand({
        ProductSKU: input.productSku,
        // PROVISIONAL: a check that the contract allows use; nothing is consumed for good.
        CheckoutType: "PROVISIONAL",
        KeyFingerprint: input.keyFingerprint,
        Entitlements: [{ Name: input.entitlement, Unit: "None" }],
        ClientToken: input.clientToken,
      }),
    );
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
