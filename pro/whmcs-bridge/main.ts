import { withTx } from "@tc/db";
import { readBridgeConfig } from "./config";
import { creditWhmcsInvoice } from "./credit";
import { createBridgeHandler, startBridgeServer } from "./server";

// PRO-6. Entry of tc-bridge (pro/box/systemd/tc-bridge.service), started only when the buyer set up the
// WHMCS bridge. `node bridge.mjs recheck <invoiceId>` runs one credit by hand (an operator re-sends an
// invoice whose hook did not arrive). Logs are JSON lines with fixed text (R14).

const log = (e: Record<string, unknown>) => console.log(JSON.stringify(e));
const clock = { now: () => new Date() };

let config;
try {
  config = readBridgeConfig(process.env);
} catch {
  log({ event: "bridge_crashed", stage: "config" });
  process.exit(1);
}
const deps = { api: config.api, installId: config.installId, runTx: withTx, clock, log };

if (process.argv[2] === "recheck") {
  const kind = await creditWhmcsInvoice(deps, process.argv[3] ?? "");
  process.exit(kind === "credited" || kind === "unchanged" ? 0 : 3);
}

process.on("unhandledRejection", () => log({ event: "bridge_unhandled_rejection" }));
const server = startBridgeServer({
  socketPath: config.socketPath,
  handle: createBridgeHandler({
    secret: config.secret,
    clock,
    credit: (invoiceId) => creditWhmcsInvoice(deps, invoiceId),
  }),
});
server.on("error", () => {
  log({ event: "bridge_crashed", stage: "listen" });
  process.exit(1);
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
log({ event: "bridge_started" });
