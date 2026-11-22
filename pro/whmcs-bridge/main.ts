import { withTx } from "@tc/db";
import { readBridgeConfig } from "./config";
import { checkWhmcsInvoiceChanged, creditWhmcsInvoice } from "./credit";
import { createBridgeHandler, startBridgeServer } from "./server";
import { createSweeper, SWEEP_EVERY_MS } from "./sweep";

// PRO-6. Entry of tc-bridge (pro/box/systemd/tc-bridge.service), started only when the buyer set up the
// WHMCS bridge. `node bridge.mjs recheck <invoiceId>` runs one credit by hand (an operator re-sends an
// invoice). Logs are JSON lines with fixed text (R14).

const log = (e: Record<string, unknown>) => console.log(JSON.stringify(e));
const clock = { now: () => new Date() };

let config;
try {
  config = readBridgeConfig(process.env);
} catch {
  log({ event: "bridge_crashed", stage: "config" });
  process.exit(1);
}
const deps = {
  api: config.api,
  installId: config.installId,
  secret: config.secret,
  runTx: withTx,
  clock,
  log,
};

if (process.argv[2] === "recheck") {
  const kind = await creditWhmcsInvoice(deps, process.argv[3] ?? "");
  process.exit(kind === "credited" || kind === "unchanged" ? 0 : 3);
}

process.on("unhandledRejection", () => log({ event: "bridge_unhandled_rejection" }));
const gid = Number(process.env["TC_BRIDGE_SOCKET_GID"] ?? "");
const server = startBridgeServer({
  socketPath: config.socketPath,
  ...(Number.isInteger(gid) && gid > 0 ? { socketGid: gid } : {}),
  handle: createBridgeHandler({
    secret: config.secret,
    clock,
    credit: (invoiceId) => creditWhmcsInvoice(deps, invoiceId),
    changed: (invoiceId) => checkWhmcsInvoiceChanged(deps, invoiceId),
  }),
});
server.on("error", () => {
  log({ event: "bridge_crashed", stage: "listen" });
  process.exit(1);
});

// Money review 4: what the hook missed is credited by the sweep (idempotent, no repeated records).
const sweep = createSweeper({
  api: config.api,
  credit: (invoiceId) => creditWhmcsInvoice(deps, invoiceId, { record: false }),
  log,
});
const timer = setInterval(() => void sweep(), SWEEP_EVERY_MS);
setTimeout(() => void sweep(), 30_000);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => process.exit(0));
  });
}
log({ event: "bridge_started" });
