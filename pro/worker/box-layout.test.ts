import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// PRO-3. The box layout is configuration, so its rules are checked here: only Caddy faces the network,
// every app runs as its own unprivileged user, the database listens on loopback only, the client
// address header cannot be spoofed, and no file in the repo carries a secret value.

const box = (p: string) => fileURLToPath(new URL(`../box/${p}`, import.meta.url));
const read = (p: string) => readFileSync(box(p), "utf8");
const units = readdirSync(box("systemd")).filter((f) => f.endsWith(".service"));
// tc-firewall loads nftables rules and tc-backup-s3 uses the instance role (PRO-8 review M1), so both
// run as root; every other unit runs as its own user.
const rootUnits = ["tc-backup-s3.service", "tc-firewall.service"];
const unprivileged = units.filter((u) => !rootUnits.includes(u));

function directive(unit: string, key: string): string[] {
  return unit
    .split("\n")
    .filter((l) => l.startsWith(`${key}=`))
    .map((l) => l.slice(key.length + 1));
}

describe("systemd units", () => {
  it("has the web, admin, worker, caddy, firewall, backup and WHMCS bridge units", () => {
    expect(units.sort()).toEqual([
      "tc-admin.service",
      "tc-backup-s3.service",
      "tc-backup.service",
      "tc-bridge.service",
      "tc-caddy.service",
      "tc-firewall.service",
      "tc-web.service",
      "tc-worker.service",
    ]);
  });

  for (const name of unprivileged) {
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

  it("the Next.js servers bind to loopback ports below 1024 that no other user can take (M2)", () => {
    for (const [name, port] of [
      ["tc-web", 801],
      ["tc-admin", 802],
    ] as const) {
      const u = read(`systemd/${name}.service`);
      expect(u).toMatch(new RegExp(`HOSTNAME=127\\.0\\.0\\.1 PORT=${port}`));
      expect(directive(u, "AmbientCapabilities")).toEqual(["CAP_NET_BIND_SERVICE"]);
      expect(directive(u, "CapabilityBoundingSet")).toEqual(["CAP_NET_BIND_SERVICE"]);
    }
  });

  it("the internet-facing units cannot reach the instance metadata service (H2, R1)", () => {
    for (const name of ["tc-web", "tc-admin", "tc-caddy", "tc-bridge"]) {
      expect(directive(read(`systemd/${name}.service`), "IPAddressDeny")).toEqual([
        "169.254.169.254/32 fd00:ec2::254/128",
      ]);
    }
    // The worker is the one tier that calls AWS (provisioning, licence) with the instance role.
    expect(directive(read("systemd/tc-worker.service"), "IPAddressDeny")).toEqual([]);
  });

  it("the worker owns the invoke socket directory, which the web tier (group tc) can enter", () => {
    const u = read("systemd/tc-worker.service");
    expect(directive(u, "RuntimeDirectory")).toEqual(["tc-invoke"]);
    expect(directive(u, "RuntimeDirectoryMode")).toEqual(["0750"]);
    expect(directive(read("systemd/tc-web.service"), "Group")).toEqual(["tc"]);
  });

  it("Caddy runs from our own unit, without --environ (L6)", () => {
    const u = read("systemd/tc-caddy.service");
    expect(directive(u, "ExecStart")[0]).not.toContain("--environ");
    expect(directive(u, "User")).toEqual(["caddy"]);
  });
});

describe("Caddy", () => {
  const caddy = read("caddy/Caddyfile");
  const blocks = caddy.split(/reverse_proxy /).slice(1);
  const appBlocks = blocks.filter((b) => b.startsWith("127.0.0.1:"));

  it("proxies only to the two loopback apps and the WHMCS bridge socket", () => {
    expect(blocks.length).toBe(3);
    expect(appBlocks.length).toBe(2);
    for (const b of appBlocks) expect(b).toMatch(/^127\.0\.0\.1:(801|802) \{/);
    expect(blocks.filter((b) => b.startsWith("unix//run/tc-bridge/bridge.sock {"))).toHaveLength(1);
  });

  it("routes only /bridge/whmcs/* of the panel host to the bridge (PRO-6)", () => {
    const panel = caddy.slice(
      caddy.indexOf("{$TC_PANEL_HOST} {"),
      caddy.indexOf("{$TC_ADMIN_HOST} {"),
    );
    expect(panel).toMatch(
      /handle \/bridge\/whmcs\/\* \{\s+reverse_proxy unix\/\/run\/tc-bridge\/bridge\.sock/,
    );
    const admin = caddy.slice(caddy.indexOf("{$TC_ADMIN_HOST} {"));
    expect(admin).not.toContain("tc-bridge");
  });

  it("has no admin API (M1)", () => {
    const global = caddy.slice(caddy.indexOf("{"), caddy.indexOf("\n}"));
    expect(global).toMatch(/^\tadmin off$/m);
  });

  it("sets the client address header from the TCP peer in every proxy (not spoofable)", () => {
    for (const b of appBlocks) {
      const body = b.slice(0, b.search(/\n\t*\}\n/));
      // {http.request.remote}: "1.2.3.4:port" or "[v6]:port", which both app parsers accept (L3).
      expect(body).toContain("header_up Cloudfront-Viewer-Address {http.request.remote}");
    }
  });

  it("puts an IP allowlist in front of the operator app (R10)", () => {
    const admin = caddy.slice(caddy.indexOf("{$TC_ADMIN_HOST} {"));
    expect(admin).toMatch(/@outside not remote_ip \{\$TC_ADMIN_ALLOW\}\s+respond @outside 403/);
    expect(admin.indexOf("respond @outside 403")).toBeLessThan(admin.indexOf("reverse_proxy"));
  });

  it("never proxies the worker's invoke socket", () => {
    expect(caddy).not.toContain("tc-invoke");
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

  it("logs no statement text, so a role password never reaches the log (H1)", () => {
    const conf = read("postgres/tc.conf");
    expect(conf).toMatch(/^log_statement = 'none'$/m);
    expect(conf).toMatch(/^log_min_error_statement = 'panic'$/m);
    expect(conf).not.toMatch(/^log_statement = '(ddl|mod|all)'$/m);
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

  it("the web tier and the worker agree on the invoke socket in the worker's runtime directory", () => {
    for (const f of ["env/web.env.example", "env/worker.env.example"]) {
      expect(read(f)).toMatch(/^PRO_INVOKE_SOCKET=\/run\/tc-invoke\/invoke\.sock$/m);
    }
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
      "bridge.env",
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
      for (const name of secrets) expect(line).not.toContain(`$${name}`);
    }
    // H1: psql receives only the SCRAM verifier, never a clear-text password.
    const toPsql = sh.split("\n").filter((l) => l.includes("| su postgres"));
    expect(toPsql).toHaveLength(1);
    expect(toPsql[0]).toContain('"$VERIFIER"');
    expect(sh).toContain('printf \'%s\' "$OWNER" | node "$RELEASE/box/bin/scram-verifier.mjs"');
  });

  it("never sources an env file in bash (L1, L2)", () => {
    expect(sh).not.toMatch(/^\s*(\.|source)\s+"\$ETC/m);
    expect(sh).not.toMatch(/^\s*(\.|source)\s+"\$SECRETS/m);
    expect(sh).toContain('--property=EnvironmentFile="$ETC/migrate.env"');
  });

  it("keeps the instance role to root and the worker (PRO-8 review M1, H2)", () => {
    const nft = read("nftables/tc.nft");
    expect(nft).toMatch(
      /ip daddr 169\.254\.169\.254 meta skuid != \{ "root", "tc-worker" \} reject/,
    );
    expect(nft).toMatch(/ip6 daddr fd00:ec2::254 meta skuid != \{ "root", "tc-worker" \} reject/);
    const backup = read("systemd/tc-backup.service");
    expect(backup).toContain("OnSuccess=tc-backup-s3.service");
    expect(backup).toContain("IPAddressDeny=169.254.169.254/32 fd00:ec2::254/128");
    expect(read("bin/tc-backup.sh")).not.toMatch(/aws s3/);
    const s3 = read("systemd/tc-backup-s3.service");
    expect(s3).toContain("ReadOnlyPaths=/var/backups/tc");
    expect(s3).toContain("NoNewPrivileges=true");
  });

  it("installs the firewall rules and our Caddy unit", () => {
    expect(sh).toContain('install -m 0644 "$RELEASE/box/nftables/tc.nft" "$ETC/tc.nft"');
    expect(sh).toMatch(
      /for u in tc-firewall tc-web tc-admin tc-worker tc-caddy tc-backup tc-backup-s3 tc-bridge; do/,
    );
    expect(sh).not.toMatch(/apt-get install[^\n]* caddy/);
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
    expect(sh).toContain('"${algo}sum" -c');
  });

  it("pins the Caddy release and its SHA-512 (M3)", () => {
    const v = read("caddy-version").trim();
    expect(v).toMatch(/^2\.\d+\.\d+$/);
    for (const arch of ["amd64", "arm64"]) {
      expect(read("caddy-sha512")).toMatch(
        new RegExp(`^[0-9a-f]{128}  caddy_${v}_linux_${arch}\\.tar\\.gz$`, "m"),
      );
    }
  });
});

describe("firewall (M2)", () => {
  const nft = read("nftables/tc.nft");

  it("lets only Caddy connect to the app ports, and only platform users to PostgreSQL", () => {
    expect(nft).toMatch(/tcp dport \{ 801, 802 \} meta skuid != "caddy" reject/);
    expect(nft).toMatch(
      /tcp dport 5432 meta skuid != \{ "root", "postgres", "tc-web", "tc-admin", "tc-worker", "tc-bridge" \} reject/,
    );
  });

  it("uses its own table only, never flushing the buyer's rules", () => {
    expect(nft).not.toMatch(/flush ruleset/);
    expect(nft).toMatch(/^table inet tc_local \{$/m);
  });
});

describe("WHMCS bridge (PRO-6)", () => {
  const u = read("systemd/tc-bridge.service");

  it("runs only when set up, as its own user and group, with caddy's group only for the socket (L6)", () => {
    expect(directive(u, "ConditionPathExists")).toEqual(["/etc/tc/bridge.env"]);
    expect(directive(u, "User")).toEqual(["tc-bridge"]);
    expect(directive(u, "Group")).toEqual(["tc-bridge"]);
    expect(directive(u, "SupplementaryGroups")).toEqual(["caddy"]);
    expect(directive(u, "RuntimeDirectory")).toEqual(["tc-bridge"]);
    expect(directive(u, "RuntimeDirectoryMode")).toEqual(["0755"]);
    expect(read("bin/tc-install.sh")).toContain(
      "TC_BRIDGE_SOCKET_GID=$(getent group caddy | cut -d: -f3)",
    );
  });

  it("the installer never prints the bridge secret and asks for the WHMCS API secret without echo", () => {
    const sh = read("bin/tc-install.sh");
    expect(sh).toContain('read -r -s -p "$q: " v');
    for (const line of sh.split("\n")) {
      if (/^\s*(say|echo|printf)\b/.test(line) && !line.includes('>>"$SECRETS"')) {
        expect(line).not.toContain("$BRIDGE");
      }
    }
  });
});
