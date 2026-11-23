import { createHmac } from "node:crypto";
import { whmcsApi, type WhmcsApi } from "./whmcs-api";

// PRO-6. The bridge configuration, from /etc/tc/bridge.env (root:root 0600, read by systemd).
// One fixed error, no value in it (R14, R16).

export const BRIDGE_CONFIG_ERROR = "bridge: the configuration is not valid";

export interface BridgeConfig {
  readonly socketPath: string;
  readonly secret: string;
  readonly installId: string;
  readonly api: WhmcsApi;
}

export function readBridgeConfig(env: Readonly<Record<string, string | undefined>>): BridgeConfig {
  const fail = (): never => {
    throw new Error(BRIDGE_CONFIG_ERROR);
  };
  const url = env["WHMCS_URL"] ?? "";
  const identifier = env["WHMCS_API_IDENTIFIER"] ?? "";
  const apiSecret = env["WHMCS_API_SECRET"] ?? "";
  const secret = env["TC_BRIDGE_SECRET"] ?? "";
  const socketPath = env["TC_BRIDGE_SOCKET"] ?? "/run/tc-bridge/bridge.sock";
  if (!/^[A-Za-z0-9]{8,128}$/.test(identifier) || !/^[A-Za-z0-9]{8,128}$/.test(apiSecret))
    return fail();
  if (!/^[0-9a-f]{48,128}$/.test(secret)) return fail();
  let api: WhmcsApi;
  try {
    api = whmcsApi({ url, identifier, secret: apiSecret });
  } catch {
    return fail();
  }
  // The install id, part of every merchant id (credit.ts). Derived from the bridge secret, which the
  // installer generates once and keeps, never from the WHMCS URL: moving WHMCS to another host must not
  // give old invoices new merchant ids (money review 1).
  const installId = createHmac("sha256", secret)
    .update("tc-whmcs-install")
    .digest("hex")
    .slice(0, 12);
  return { socketPath, secret, installId, api };
}
