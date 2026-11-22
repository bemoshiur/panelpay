import { expect, it } from "vitest";
import { BRIDGE_CONFIG_ERROR, readBridgeConfig } from "./config";

const good = {
  WHMCS_URL: "https://billing.example.test",
  WHMCS_API_IDENTIFIER: "abcdefgh1234",
  WHMCS_API_SECRET: "secretsecret1234",
  TC_BRIDGE_SECRET: "a".repeat(48),
};

it("reads the bridge settings and derives a stable install id from the WHMCS host", () => {
  const a = readBridgeConfig(good);
  expect(a.installId).toMatch(/^[0-9a-f]{8}$/);
  expect(readBridgeConfig({ ...good, WHMCS_URL: "https://BILLING.example.test/" }).installId).toBe(
    a.installId,
  );
  expect(a.socketPath).toBe("/run/tc-bridge/bridge.sock");
});

it("refuses http, short secrets or missing values, with one fixed message", () => {
  for (const over of [
    { WHMCS_URL: "http://billing.example.test" },
    { WHMCS_URL: "not a url" },
    { WHMCS_API_IDENTIFIER: "" },
    { WHMCS_API_SECRET: "x" },
    { TC_BRIDGE_SECRET: "short" },
  ]) {
    expect(() => readBridgeConfig({ ...good, ...over })).toThrow(BRIDGE_CONFIG_ERROR);
  }
});
