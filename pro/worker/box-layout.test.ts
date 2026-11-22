import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// PRO-3. The box layout is configuration, so its rules are checked here: only Caddy faces the network,
// every app runs as its own unprivileged user, the database listens on loopback only, the client
// address header cannot be spoofed, and no file in the repo carries a secret value.

const box = (p: string) => fileURLToPath(new URL(`../box/${p}`, import.meta.url));
const read = (p: string) => readFileSync(box(p), "utf8");
const units = readdirSync(box("systemd")).filter((f) => f.endsWith(".service"));

function directive(unit: string, key: string): string[] {
  return unit
    .split("\n")
    .filter((l) => l.startsWith(`${key}=`))
    .map((l) => l.slice(key.length + 1));
}

describe("systemd units", () => {
  it("has the web, admin, worker and backup units", () => {
    expect(units.sort()).toEqual([
      "tc-admin.service",
      "tc-backup.service",
      "tc-web.service",
      "tc-worker.service",
    ]);
  });

  for (const name of units) {
    it(`${name} runs unprivileged and hardened`, () => {
      const u = read(`systemd/${name}`);
      const user = directive(u, "User");
      expect(user).toHaveLength(1);
      expect(user[0]).not.toBe("root");
      expect(directive(u, "NoNewPrivileges")).toEqual(["true"]);
      expect(directive(u, "ProtectSystem")).toEqual(["strict"]);
      expect(directive(u, "UMask")).toEqual(["0077"]);
    });
  }

  it("each app has its own user and its own env file", () => {
    const users = ["tc-web", "tc-admin", "tc-worker"].map(
      (n) => directive(read(`systemd/${n}.service`), "User")[0],
    );
    expect(new Set(users).size).toBe(3);
    expect(directive(read("systemd/tc-web.service"), "EnvironmentFile")).toContain(
      "/etc/tc/web.env",
    );
    expect(directive(read("systemd/tc-admin.service"), "EnvironmentFile")).toContain(
      "/etc/tc/admin.env",
    );
    expect(directive(read("systemd/tc-worker.service"), "EnvironmentFile")).toContain(
      "/etc/tc/worker.env",
    );
  });

  it("the Next.js servers bind to loopback only", () => {
    expect(read("systemd/tc-web.service")).toMatch(/HOSTNAME=127\.0\.0\.1 PORT=3000/);
    expect(read("systemd/tc-admin.service")).toMatch(/HOSTNAME=127\.0\.0\.1 PORT=3001/);
  });
});

describe("Caddy", () => {
  const caddy = read("caddy/Caddyfile");
  const blocks = caddy.split(/reverse_proxy /).slice(1);

  it("proxies only to loopback upstreams", () => {
    expect(blocks.length).toBe(2);
    for (const b of blocks) expect(b).toMatch(/^127\.0\.0\.1:(3000|3001) \{/);
  });

  it("sets the client address header from the TCP peer in every proxy (not spoofable)", () => {
    for (const b of blocks) {
      const body = b.slice(0, b.indexOf("\n\t}"));
      expect(body).toContain("header_up Cloudfront-Viewer-Address {remote_host}:{remote_port}");
    }
  });

  it("puts an IP allowlist in front of the operator app (R10)", () => {
    const admin = caddy.slice(caddy.indexOf("{$TC_ADMIN_HOST} {"));
    expect(admin).toMatch(/@outside not remote_ip \{\$TC_ADMIN_ALLOW\}\s+respond @outside 403/);
    expect(admin.indexOf("respond @outside 403")).toBeLessThan(admin.indexOf("reverse_proxy"));
  });

  it("never proxies the worker's invoke port", () => {
    expect(caddy).not.toContain("9700");
  });
});

describe("PostgreSQL", () => {
  it("listens on loopback only with TLS and SCRAM and logs no bind values", () => {
    const conf = read("postgres/tc.conf");
    expect(conf).toMatch(/^ssl = on$/m);
    expect(conf).toMatch(/^listen_addresses = 'localhost'$/m);
    expect(conf).toMatch(/^password_encryption = scram-sha-256$/m);
    expect(conf).toMatch(/^log_parameter_max_length = 0$/m);
  });

  it("pg_hba allows the app roles over loopback only, and postgres by peer only", () => {
    const rules = read("postgres/pg_hba.conf")
      .split("\n")
      .filter((l) => l.trim() !== "" && !l.startsWith("#"))
      .map((l) => l.trim().split(/\s+/));
    for (const r of rules) {
      if (r[0] === "local") {
        expect(r).toEqual(["local", "all", "postgres", "peer"]);
      } else {
        // TLS only, even on loopback (R2).
        expect(r[0]).toBe("hostssl");
        expect(["127.0.0.1/32", "::1/128"]).toContain(r[3]);
        expect(r[4]).toBe("scram-sha-256");
        expect(r[2]).not.toBe("all");
        expect(r[2]).not.toBe("postgres");
      }
    }
  });
});

describe("env templates", () => {
  const files = readdirSync(box("env")).filter((f) => f.endsWith(".example"));

  it("carry no secret value", () => {
    for (const f of files) {
      for (const line of read(`env/${f}`).split("\n")) {
        if (line.startsWith("#") || !line.includes("=")) continue;
        const [key, ...rest] = line.split("=");
        const value = rest.join("=");
        if (/TOKEN|SECRET|PASSWORD|KEY/.test(key!)) expect(value).toBe("");
        if (key === "DATABASE_URL") expect(value).toContain("<password>");
      }
    }
  });

  it("the web tier and the worker agree on the loopback invoke port", () => {
    expect(read("env/web.env.example")).toMatch(/^PRO_INVOKE_URL=http:\/\/127\.0\.0\.1:9700$/m);
    expect(read("env/worker.env.example")).toMatch(/^PRO_INVOKE_PORT=9700$/m);
  });

  it("each app connects with its own database role", () => {
    expect(read("env/web.env.example")).toContain("//web_rw:");
    expect(read("env/admin.env.example")).toContain("//admin_rw:");
    expect(read("env/worker.env.example")).toContain("//worker_rw:");
  });
});

describe("installer", () => {
  const sh = read("bin/tc-install.sh");

  it("stops on the first error and creates files private by default", () => {
    expect(sh).toContain("set -euo pipefail");
    expect(sh).toMatch(/^umask 077$/m);
  });

  it("writes each env file with the owner and mode of env/README.md", () => {
    const table = read("env/README.md");
    const calls = [...sh.matchAll(/write_env "\$ETC\/([a-z]+\.env)" (\S+) (\S+) (\d{4})/g)];
    expect(calls.map((c) => c[1]).sort()).toEqual([
      "admin.env",
      "backup.env",
      "caddy.env",
      "common.env",
      "migrate.env",
      "web.env",
      "worker.env",
    ]);
    for (const [, file, owner, group, mode] of calls) {
      expect(table).toMatch(
        new RegExp(`\\| ${file!.replace(".", "\\.")}\\s+\\| ${owner}:${group} ${mode}\\s+\\|`),
      );
    }
  });

  it("never prints a generated secret, and passes the owner password on stdin only", () => {
    const secrets = ["OWNER", "WEB_RW", "ADMIN_RW", "WORKER_RW", "MIGRATOR", "REPORT_RO", "INVOKE"];
    for (const line of sh.split("\n")) {
      if (!/^\s*(say|echo|printf)\b/.test(line)) continue;
      if (line.includes('>"$SECRETS"') || /^\s*echo "[A-Z_]+=\$\(secret\)"$/.test(line)) continue;
      if (line.includes("| su postgres")) continue; // the one stdin hand-over to psql
      for (const name of secrets) expect(line).not.toContain(`$${name}`);
    }
    expect(sh).not.toMatch(/psql[^\n]*password '\$/);
  });

  it("pins the Node.js release and its checksum", () => {
    expect(read("node-version").trim()).toMatch(/^24\.\d+\.\d+$/);
    const sums = read("node-sha256");
    for (const arch of ["x64", "arm64"]) {
      expect(sums).toMatch(
        new RegExp(
          `^[0-9a-f]{64}  node-v${read("node-version").trim()}-linux-${arch}\\.tar\\.xz$`,
          "m",
        ),
      );
    }
    expect(sh).toContain("sha256sum -c");
  });
});
