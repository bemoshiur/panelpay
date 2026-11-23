import { licenceAllowsUpdate } from "./licence";
import { readLicenceStatus } from "./licence-aws";

// PRO-5. `node licence-gate.mjs` exits 0 when tc-update may install a newer release, 3 when it may not.
// It never stops the running platform (EULA rule). Fixed output only.

const status = await readLicenceStatus();
if (licenceAllowsUpdate(status, new Date())) {
  console.log(JSON.stringify({ event: "licence_gate", update: "allowed" }));
} else {
  console.log(JSON.stringify({ event: "licence_gate", update: "refused" }));
  process.exit(3);
}
