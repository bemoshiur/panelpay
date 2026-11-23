// PRO-4 review (H1). Reads one password on stdin and prints its PostgreSQL SCRAM-SHA-256 verifier
// (RFC 5802/7677, the format of pg_authid.rolpassword). The installer sends only the verifier to the
// server, so the clear-text password never reaches a statement, a log line or a process list.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { stdin, stdout, exit } from "node:process";

const ITERATIONS = 4096; // PostgreSQL's default scram_iterations

let input = "";
stdin.setEncoding("utf8");
for await (const chunk of stdin) input += chunk;
const password = input.replace(/\r?\n$/, "");
if (!/^[A-Za-z0-9]{32,128}$/.test(password)) exit(2);

const salt = randomBytes(16);
const salted = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
const clientKey = createHmac("sha256", salted).update("Client Key").digest();
const storedKey = createHash("sha256").update(clientKey).digest();
const serverKey = createHmac("sha256", salted).update("Server Key").digest();
stdout.write(
  `SCRAM-SHA-256$${ITERATIONS}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}\n`,
);
