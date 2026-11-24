// WPU-Z11: go-live in one account. Static and behavioural proof of the owner scripts in scripts/golive,
// the IAM transforms of infra/app.ts and infra/stacks/web.ts that the CI deploy policies need, the VERIFY
// fixes of infra/org (docs/analysis/verify-review-2026-11-13.md, B2) and the runbook. Nothing here calls
// AWS, GitHub or SST: the scripts run against fake `aws`, `gh`, `npx` and `openssl` commands on PATH.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  CI_ROLE_BOUNDARY,
  ciRoleBoundaryArn,
  instanceProfileName,
} from "../../infra/lib/ci-boundary.ts";
import {
  ALL_SECRETS,
  DB_PASSWORD_SECRET,
  FIRST_ADMIN_SUB_SECRET,
  OPTIONAL_SECRET_PLACEHOLDER,
} from "../../infra/lib/functions.ts";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(join(root, path), "utf8");
const list = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const CI_ROLES = "scripts/golive/ci-roles.sh";
const STAGE_SECRETS = "scripts/golive/stage-secrets.sh";
// WPU-Y5 (d): its behaviour is in tag-ruleset.test.mjs; the static rules below hold for it too.
const TAG_RULESET = "scripts/golive/tag-ruleset.sh";
const FAKE_ACCOUNT = "000000000000";
const OTHER_ACCOUNT = "000000000009";

// ---- fakes ------------------------------------------------------------------------------------------

// A fake command: a bash script that appends its arguments (and its standard input when asked) to a log
// and answers from environment variables the test sets.
function fakeBin() {
  const dir = mkdtempSync(join(tmpdir(), "golive-"));
  const log = join(dir, "calls.log");
  const write = (name, body) => {
    const path = join(dir, name);
    writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(path, 0o755);
  };
  write(
    "aws",
    `echo "aws $*" >> "${log}"
case "$1 $2" in
  "sts get-caller-identity") [[ "\${FAKE_STS:-ok}" == ok ]] || exit 255; echo "${FAKE_ACCOUNT}" ;;
  "organizations describe-organization")
    case "\${FAKE_ORG:-member}" in
      member) echo "${OTHER_ACCOUNT}" ;;
      management) echo "${FAKE_ACCOUNT}" ;;
      none) echo "An error occurred (AWSOrganizationsNotInUseException)" >&2; exit 254 ;;
      *) echo "An error occurred (AccessDeniedException)" >&2; exit 254 ;;
    esac ;;
  "iam list-open-id-connect-providers")
    if [[ "\${FAKE_PROVIDER:-yes}" == yes ]]; then echo "arn:aws:iam::${FAKE_ACCOUNT}:oidc-provider/token.actions.githubusercontent.com"; else echo ""; fi ;;
  "cloudformation deploy") exit 0 ;;
  "cloudformation describe-stacks") echo "CREATE_COMPLETE" ;;
  *) exit 0 ;;
esac`,
  );
  write(
    "gh",
    `echo "gh $*" >> "${log}"
case "$*" in
  *".owner.id"*) echo 11111 ;;
  *) echo 22222 ;;
esac`,
  );
  write(
    "npx",
    `if [[ "$*" == *"secret list"* ]]; then
  echo "npx $* CI=\${CI:-} TC_PRODUCTION_DEPLOY=\${TC_PRODUCTION_DEPLOY:-}" >> "${log}"
  if [[ "\${FAKE_LIST:-ok}" == empty ]]; then echo "✕  No secrets found"; exit 1; fi
  [[ "\${FAKE_LIST:-ok}" == ok ]] || exit 1
  printf '%s\\n' \${FAKE_EXISTING:-} | sed 's/$/=a-value-that-must-not-show/'
  exit 0
fi
value="$(cat)"
echo "npx $* CI=\${CI:-} TC_PRODUCTION_DEPLOY=\${TC_PRODUCTION_DEPLOY:-} VALUE=$value" >> "${log}"`,
  );
  write("openssl", `echo "rand-$RANDOM-$RANDOM-0123456789abcdef"`);
  return { dir, log };
}

function run(script, args, { env = {}, input = "" } = {}) {
  const { dir, log } = fakeBin();
  const result = spawnSync("bash", [join(root, script), ...args], {
    cwd: root,
    input,
    encoding: "utf8",
    env: {
      PATH: `${dir}:/usr/bin:/bin`,
      HOME: dir,
      AWS_ACCESS_KEY_ID: "AKIAFAKEFAKEFAKE",
      AWS_SECRET_ACCESS_KEY: "fake-secret-key-for-tests",
      ...env,
    },
  });
  const calls = existsSync(log) ? readFileSync(log, "utf8") : "";
  return { ...result, calls };
}

// ---- static rules of both scripts ---------------------------------------------------------------------

describe.each([CI_ROLES, STAGE_SECRETS, TAG_RULESET])("%s (static)", (script) => {
  const text = read(script);
  const code = text
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    // the lists of secret NAMES (readonly SMS_TOKEN_SECRET="SmsApiKey") are names, not values
    .filter((l) => !/^readonly [A-Z_]+="[A-Za-z ]+"$/.test(l))
    .join("\n");

  it("is bash with set -euo pipefail and never set -x or xtrace", () => {
    expect(text.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(code).toMatch(/^set -euo pipefail$/m);
    expect(code).not.toMatch(/set -[a-z]*x|set -o xtrace|bash -x/);
  });

  it("holds no secret, key or account literal", () => {
    expect(text).not.toMatch(/\b(AKIA|ASIA)[A-Z0-9]{12,}/);
    expect(text).not.toMatch(/(?<![0-9])[0-9]{12}(?![0-9])/);
    expect(text).not.toMatch(/arn:aws:/);
    expect(text).not.toMatch(/[0-9a-f]{32,}/i);
    expect(code).not.toMatch(/(password|token|secret|key)\s*=\s*["'][^"'$]+["']/i);
  });

  it("is shellcheck-clean when shellcheck is installed", () => {
    const probe = spawnSync("shellcheck", ["--version"], { encoding: "utf8" });
    if (probe.status !== 0) return; // CI images without shellcheck: the other rules still hold
    const r = spawnSync("shellcheck", [join(root, script)], { encoding: "utf8" });
    expect(r.stdout + r.stderr).toBe("");
    expect(r.status).toBe(0);
  });
});

// ---- scripts/golive/ci-roles.sh -----------------------------------------------------------------------

describe("scripts/golive/ci-roles.sh", () => {
  it("refuses when aws sts get-caller-identity fails, before any stack", () => {
    const r = run(CI_ROLES, [], { env: { FAKE_STS: "fail" } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("AWS credentials do not work");
    expect(r.calls).not.toContain("cloudformation");
  });

  it("refuses in the management account of the organization", () => {
    const r = run(CI_ROLES, [], { env: { FAKE_ORG: "management" } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("management account");
    expect(r.calls).not.toContain("cloudformation");
  });

  it("refuses when the organization check cannot complete (R16)", () => {
    const r = run(CI_ROLES, [], { env: { FAKE_ORG: "denied" } });
    expect(r.status).toBe(1);
    expect(r.calls).not.toContain("cloudformation");
  });

  it("deploys the three role stacks with the GitHub ids, and skips an existing OIDC provider", () => {
    const r = run(CI_ROLES, []);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim().split("\n")).toEqual([
      "tc-ci-oidc-provider SKIPPED (the account already has a provider for token.actions.githubusercontent.com)",
      "tc-ci-deploy-staging CREATE_COMPLETE",
      "tc-ci-plan-production CREATE_COMPLETE",
      "tc-ci-deploy-production CREATE_COMPLETE",
    ]);
    const deploys = r.calls.split("\n").filter((l) => l.startsWith("aws cloudformation deploy"));
    expect(deploys).toHaveLength(3);
    for (const d of deploys) {
      expect(d).toContain("GitHubOrg=bemoshiur");
      expect(d).toContain("GitHubOwnerId=11111");
      expect(d).toContain("GitHubRepo=panelpay");
      expect(d).toContain("GitHubRepoId=22222");
      expect(d).toContain("--capabilities CAPABILITY_NAMED_IAM");
    }
    expect(deploys[0]).toContain("WebDomain=staging.tryaws.now");
    expect(deploys[0]).toContain("AdminDomain=admin-staging.tryaws.now");
    expect(deploys[0]).toContain("ProtectedBranch=main");
    expect(r.calls).not.toContain("ci-oidc-provider.yaml");
  });

  it("deploys the OIDC provider stack only when the account has none", () => {
    const r = run(CI_ROLES, [], { env: { FAKE_PROVIDER: "no" } });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.split("\n")[0]).toBe("tc-ci-oidc-provider CREATE_COMPLETE");
    expect(r.calls).toContain("ci-oidc-provider.yaml");
  });

  it("takes the ids from TC_GITHUB_OWNER_ID and TC_GITHUB_REPO_ID and refuses ids that are not numbers", () => {
    const ok = run(CI_ROLES, [], { env: { TC_GITHUB_OWNER_ID: "7", TC_GITHUB_REPO_ID: "8" } });
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.calls).not.toContain("gh api");
    expect(ok.calls).toContain("GitHubOwnerId=7");
    const bad = run(CI_ROLES, [], { env: { TC_GITHUB_OWNER_ID: "x", TC_GITHUB_REPO_ID: "8" } });
    expect(bad.status).toBe(1);
    expect(bad.calls).not.toContain("cloudformation");
  });
});

// ---- scripts/golive/stage-secrets.sh ------------------------------------------------------------------

describe("scripts/golive/stage-secrets.sh", () => {
  const text = read(STAGE_SECRETS);
  const names = (line) =>
    line
      .replace(/^readonly [A-Z_]+="/, "")
      .replace(/"$/, "")
      .split(" ");
  const constant = (name) =>
    names(text.split("\n").find((l) => l.startsWith(`readonly ${name}=`)) ?? "");

  it("sets exactly the secrets of infra/lib/functions.ts (ALL_SECRETS, DB_PASSWORD_SECRET, FirstAdminSub)", () => {
    const covered = [
      ...constant("RANDOM_SECRETS"),
      ...constant("DB_PASSWORD_SECRETS"),
      ...constant("EPS_SECRETS"),
      ...constant("SMS_TOKEN_SECRET"),
      ...constant("SMS_SENDER_SECRET"),
      ...constant("FIRST_ADMIN_SECRET"),
    ];
    expect(new Set(covered).size).toBe(covered.length);
    expect([...covered].sort()).toEqual(
      [...ALL_SECRETS, ...Object.values(DB_PASSWORD_SECRET), FIRST_ADMIN_SUB_SECRET].sort(),
    );
    expect(constant("EPS_SECRETS").sort()).toEqual(
      ["EpsHashKey", "EpsMerchantId", "EpsPassword", "EpsStoreId", "EpsUsername"].sort(),
    );
  });

  it("reads the Gennet token and every EPS value with read -rs, the sender id visibly", () => {
    expect(text).toMatch(/read -rs -p "Gennet API token/);
    expect(text).toMatch(/read -rs -p "\$\{name\} for \$\{STAGE\} \(hidden; empty = /);
    expect(text).toMatch(/read -r -p "SMS sender id/);
    expect(text).toContain('readonly PLACEHOLDER="not-configured"');
    expect(text).toContain("openssl rand -hex 32");
    // only the names of the existing secrets are read
    expect(text).toContain('sst secret list --stage "$STAGE" 2>&1 | cut -d= -f1');
  });

  // WPU-Z11 fix round 1: the production guard variables can reach `sst secret list|set` only.
  it("runs only sst secret list and sst secret set through its sst wrapper", () => {
    expect(text).toContain(
      '[[ "${1:-}" == secret && ( "${2:-}" == list || "${2:-}" == set ) ]] || die',
    );
    // every sst call of the script (outside comments) is `sst secret list` or `sst secret set`
    for (const m of text.matchAll(/^[^#\n]*\bsst (secret \w+|deploy|remove|diff|refresh)/gm))
      expect(m[1], m[0]).toMatch(/^secret (list|set)$/);
    expect(text).not.toMatch(/\bsst (deploy|remove|diff|refresh)\b/);
  });

  it("refuses without exported AWS keys, before any sst call", () => {
    const r = run(STAGE_SECRETS, ["staging"], {
      env: { AWS_ACCESS_KEY_ID: "", AWS_SECRET_ACCESS_KEY: "" },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no exported AWS credentials");
    expect(r.calls).not.toContain("npx");
  });

  it("refuses when aws sts get-caller-identity fails, before any sst call", () => {
    const r = run(STAGE_SECRETS, ["staging"], { env: { FAKE_STS: "fail" } });
    expect(r.status).toBe(1);
    expect(r.calls).not.toContain("npx");
  });

  it("refuses a missing or unknown stage and an unknown flag", () => {
    for (const args of [[], ["prod"], ["staging", "--yes"], ["staging", "production"]]) {
      const r = run(STAGE_SECRETS, args);
      expect(r.status, args.join(" ")).toBe(1);
      expect(r.calls).not.toContain("npx");
    }
  });

  it("refuses when the secret names cannot be listed (R16)", () => {
    const r = run(STAGE_SECRETS, ["staging"], { env: { FAKE_LIST: "fail" } });
    expect(r.status).toBe(1);
    expect(r.calls).not.toContain("secret set");
  });

  it('treats sst\'s "No secrets found" of a new stage as an empty list and sets every name', () => {
    const r = run(STAGE_SECRETS, ["staging"], {
      env: { FAKE_LIST: "empty" },
      input: "\n\n\n\n\n\n\n\n",
    });
    expect(r.status, r.stderr).toBe(0);
    const sets = r.calls.split("\n").filter((l) => l.includes("secret set"));
    expect(sets.some((l) => l.includes("secret set EpsLimitKey"))).toBe(true);
    expect(sets.some((l) => l.includes("secret set DbPasswordMigrator"))).toBe(true);
    expect(r.stdout).toContain("done: stage staging");
  });

  it("skips what is set, stores not-configured for an empty EPS answer, and prints names only", () => {
    const r = run(STAGE_SECRETS, ["staging"], {
      env: { FAKE_EXISTING: "SmsApiKey SmsSenderId" },
      // five EPS prompts: merchant id given, the rest empty
      input: "merchant-test-value\n\n\n\n\n",
    });
    expect(r.status, r.stderr).toBe(0);
    const sets = r.calls.split("\n").filter((l) => l.includes("secret set"));
    const value = (name) =>
      sets
        .find((l) => l.startsWith(`npx --no-install sst secret set ${name} `))
        ?.split("VALUE=")[1];
    expect(value("SmsApiKey")).toBeUndefined();
    expect(value("SmsSenderId")).toBeUndefined();
    expect(value("EpsMerchantId")).toBe("merchant-test-value");
    for (const n of ["EpsStoreId", "EpsUsername", "EpsPassword", "EpsHashKey"])
      expect(value(n), n).toBe("not-configured");
    for (const n of ["EpsLimitKey", "OrderDraftSecret", "DbPasswordMigrator"])
      expect(value(n), n).toMatch(/^rand-/);
    expect(sets).toHaveLength(15);
    // values go on standard input, never on the command line, with the stage
    for (const l of sets)
      expect(l).toMatch(/^npx --no-install sst secret set [A-Za-z]+ --stage staging CI= /);
    // the output names only
    expect(r.stdout).toContain("skipped SmsApiKey");
    expect(r.stdout).toContain("set EpsMerchantId");
    expect(r.stdout + r.stderr).not.toMatch(/merchant-test-value|rand-|a-value-that-must-not-show/);
  });

  // Final review M2: the SMS gateway is optional. An empty token or sender id sets nothing (the stack's
  // placeholder not-configured applies and SMS is off), like FirstAdminSub; a value is set as before.
  it("an empty SMS token or sender id sets nothing and says SMS stays off", () => {
    expect(text).toMatch(
      /read -rs -p "Gennet API token for \$\{STAGE\} \(hidden; empty = SMS off\): " SMS_TOKEN \|\| SMS_TOKEN=""/,
    );
    expect(text).toMatch(
      /read -r -p "SMS sender id \(sid\) for \$\{STAGE\} \(empty = SMS off\): " SMS_SENDER \|\| SMS_SENDER=""/,
    );
    const smsSets = (calls) =>
      calls.split("\n").filter((l) => /secret set Sms(ApiKey|SenderId) /.test(l));
    // both empty, then five empty EPS answers and an empty FirstAdminSub
    const both = run(STAGE_SECRETS, ["staging"], { input: "\n\n\n\n\n\n\n\n" });
    expect(both.status, both.stderr).toBe(0);
    expect(smsSets(both.calls)).toEqual([]);
    expect(both.stdout).toContain(
      "skipped SmsApiKey (empty: SMS stays off, the placeholder not-configured applies)",
    );
    expect(both.stdout).toContain(
      "skipped SmsSenderId (empty: SMS stays off, the placeholder not-configured applies)",
    );
    expect(both.calls.split("\n").filter((l) => l.includes("secret set"))).toHaveLength(15);
    // a token and an empty sender id: the token is set, the sender id is not
    const one = run(STAGE_SECRETS, ["staging"], { input: "token-test-value\n\n\n\n\n\n\n\n" });
    expect(one.status, one.stderr).toBe(0);
    expect(smsSets(one.calls)).toEqual([
      "npx --no-install sst secret set SmsApiKey --stage staging CI= TC_PRODUCTION_DEPLOY= VALUE=token-test-value",
    ]);
    expect(one.stdout + one.stderr).not.toContain("token-test-value");
    // the end of the input at the SMS prompts is the same as empty answers (the EPS prompts after them
    // still need an answer each, as before)
    const eof = run(STAGE_SECRETS, ["staging"], { input: "" });
    expect(eof.stdout).toContain("skipped SmsApiKey (empty: SMS stays off");
    expect(eof.stdout).toContain("skipped SmsSenderId (empty: SMS stays off");
    expect(smsSets(eof.calls)).toEqual([]);
  });

  it("--force sets the names that already have a value", () => {
    const r = run(STAGE_SECRETS, ["staging", "--force"], {
      env: { FAKE_EXISTING: "SmsApiKey SmsSenderId" },
      input: "token-test-value\nSENDER\n\n\n\n\n\n",
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.calls).toContain(
      "sst secret set SmsApiKey --stage staging CI= TC_PRODUCTION_DEPLOY= VALUE=token-test-value",
    );
    expect(r.calls).toContain("VALUE=SENDER");
    expect(r.stdout + r.stderr).not.toContain("token-test-value");
  });

  // WPU-Z18: the optional Cognito sub of the first superadmin, the last prompt.
  describe("FirstAdminSub", () => {
    const SUB = "0A1B2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D";
    const ALL_SET =
      "EpsLimitKey OrderDraftSecret AuthLimitKey OtpHashKey AdminIpLimitKey DbPasswordWebRw " +
      "DbPasswordAdminRw DbPasswordWorkerRw DbPasswordMigrator DbPasswordReportRo SmsApiKey " +
      "SmsSenderId EpsMerchantId EpsStoreId EpsUsername EpsPassword EpsHashKey";
    const firstAdminSets = (calls) =>
      calls.split("\n").filter((l) => l.includes("secret set FirstAdminSub"));

    it("asks visibly, says to leave it empty until the Cognito admin exists, and checks the UUID form", () => {
      expect(text).toMatch(
        /read -r -p "Cognito sub of the first superadmin for \$\{STAGE\} \(leave empty until the Cognito admin exists\): " FIRST_ADMIN_SUB \|\| FIRST_ADMIN_SUB=""/,
      );
      expect(text).toContain(
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
      );
    });

    it("an empty answer, or the end of the input, sets nothing", () => {
      for (const input of ["\n", ""]) {
        const r = run(STAGE_SECRETS, ["staging"], { env: { FAKE_EXISTING: ALL_SET }, input });
        expect(r.status, r.stderr).toBe(0);
        expect(firstAdminSets(r.calls)).toEqual([]);
        expect(r.stdout).toContain(
          "skipped FirstAdminSub (empty: leave empty until the Cognito admin exists)",
        );
      }
    });

    it("sets a UUID in lowercase on standard input and prints the name only", () => {
      const r = run(STAGE_SECRETS, ["production"], {
        env: { FAKE_EXISTING: ALL_SET },
        input: `${SUB}\n`,
      });
      expect(r.status, r.stderr).toBe(0);
      expect(firstAdminSets(r.calls)).toEqual([
        `npx --no-install sst secret set FirstAdminSub --stage production CI=true TC_PRODUCTION_DEPLOY=ci-approved VALUE=${SUB.toLowerCase()}`,
      ]);
      expect(r.stdout).toContain("set FirstAdminSub");
      expect((r.stdout + r.stderr).toLowerCase()).not.toContain(SUB.toLowerCase().slice(0, 8));
    });

    it("refuses a value that is not a UUID, sets nothing for it and does not echo it", () => {
      for (const bad of [
        "admin@example.test",
        `{${SUB}}`,
        SUB.replace(/-/g, ""),
        "not-configured",
      ]) {
        const r = run(STAGE_SECRETS, ["staging"], {
          env: { FAKE_EXISTING: ALL_SET },
          input: `${bad}\n`,
        });
        expect(r.status, bad).toBe(1);
        expect(r.stderr).toContain(
          "FirstAdminSub is not a Cognito sub (a UUID); nothing set for it",
        );
        expect(firstAdminSets(r.calls)).toEqual([]);
        expect(r.stdout + r.stderr).not.toContain(bad);
      }
    });

    it("skips it when it already has a value, unless --force", () => {
      const r = run(STAGE_SECRETS, ["staging"], {
        env: { FAKE_EXISTING: `${ALL_SET} FirstAdminSub` },
        input: `${SUB}\n`,
      });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain("skipped FirstAdminSub (already set; --force replaces it)");
      expect(firstAdminSets(r.calls)).toEqual([]);
    });
  });

  it("sets the production guard variables only on its sst calls for production", () => {
    const prod = run(STAGE_SECRETS, ["production"], { input: "token\nsid\n\n\n\n\n\n" });
    expect(prod.status, prod.stderr).toBe(0);
    const sst = prod.calls.split("\n").filter((l) => l.startsWith("npx"));
    expect(sst.length).toBe(18);
    for (const l of sst) {
      expect(l).toContain("--stage production");
      expect(l).toContain("CI=true TC_PRODUCTION_DEPLOY=ci-approved");
    }
    const staging = run(STAGE_SECRETS, ["staging"], { input: "token\nsid\n\n\n\n\n\n" });
    for (const l of staging.calls.split("\n").filter((x) => x.startsWith("npx")))
      expect(l).toMatch(/CI= TC_PRODUCTION_DEPLOY=( |$)/);
  });
});

// ---- EPS placeholder (requirement 3) -------------------------------------------------------------------

describe("the EPS placeholder is the same literal in the scripts and the code", () => {
  // Final review M3: one constant, NOT_CONFIGURED of @tc/db/links. The code imports it; infra and the
  // owner script keep their literal, pinned here to equal it.
  it("apps/web, functions/payments-sweeper and the migrator's decision use the one constant of @tc/db/links", async () => {
    const { NOT_CONFIGURED } = await import("../../packages/db/links.ts");
    expect(NOT_CONFIGURED).toBe("not-configured");
    expect(read("packages/db/links.ts")).toContain(
      'export const NOT_CONFIGURED = "not-configured";',
    );
    for (const file of ["apps/web/server/secrets.ts", "functions/payments-sweeper/secrets.ts"]) {
      const text = read(file);
      expect(text, file).toMatch(/import \{[^}]*\bNOT_CONFIGURED\b[^}]*\} from "@tc\/db\/links";/);
      expect(text, file).not.toContain('"not-configured"');
    }
    expect(read("packages/db/repositories/system/first-admin.ts")).not.toContain(
      '"not-configured"',
    );
    // the literals that stay: infra (no workspace import there) and the shell script
    expect(OPTIONAL_SECRET_PLACEHOLDER).toBe(NOT_CONFIGURED);
    expect(read(STAGE_SECRETS)).toContain(`readonly PLACEHOLDER="${NOT_CONFIGURED}"`);
  });
});

// ---- infra: boundary, instance profile and role names (VERIFY B2) -------------------------------------

describe("infra/lib/ci-boundary.ts", () => {
  it("names the boundary of the stage, and none for a personal stage", () => {
    expect(ciRoleBoundaryArn("staging", FAKE_ACCOUNT)).toBe(
      `arn:aws:iam::${FAKE_ACCOUNT}:policy/TcCiRoleBoundaryStaging`,
    );
    expect(ciRoleBoundaryArn("production", FAKE_ACCOUNT)).toBe(
      `arn:aws:iam::${FAKE_ACCOUNT}:policy/TcCiRoleBoundaryProduction`,
    );
    expect(ciRoleBoundaryArn("alice", FAKE_ACCOUNT)).toBeNull();
    expect(() => ciRoleBoundaryArn("staging", "12")).toThrow();
    expect(() => ciRoleBoundaryArn("prodx", FAKE_ACCOUNT)).toThrow();
  });

  it("uses the managed policy names of the two CI templates", () => {
    for (const [stage, name] of Object.entries(CI_ROLE_BOUNDARY)) {
      const t = parse(read(`infra/org/ci-deploy-${stage}.yaml`));
      expect(t.Resources.TcCiRoleBoundary.Properties.ManagedPolicyName).toBe(name);
    }
  });

  it("names an instance profile tc-<stage>-<logical name>, inside the CI policy of the stage", () => {
    expect(instanceProfileName("staging", "VpcNatInstanceProfile")).toBe(
      "tc-staging-VpcNatInstanceProfile",
    );
    expect(instanceProfileName("production", "a b/c")).toBe("tc-production-a-b-c");
    expect(instanceProfileName("staging", "x".repeat(200))).toHaveLength(128);
    expect(() => instanceProfileName("staging", "")).toThrow();
  });
});

describe("infra/app.ts and infra/stacks/web.ts", () => {
  const app = read("infra/app.ts");
  const web = read("infra/stacks/web.ts");

  it("registers the Role and InstanceProfile transforms before any stack is imported", () => {
    const role = app.indexOf("$transform(aws.iam.Role,");
    const profile = app.indexOf("$transform(aws.iam.InstanceProfile,");
    const firstStack = app.indexOf('await import("./stacks/');
    expect(role).toBeGreaterThan(0);
    expect(profile).toBeGreaterThan(0);
    expect(role).toBeLessThan(firstStack);
    expect(profile).toBeLessThan(firstStack);
    expect(app).toContain("args.permissionsBoundary = boundaryArn;");
    expect(app).toContain("ciRoleBoundaryArn(config.stage, config.accountId)");
    expect(app).toContain("args.name ??= instanceProfileName(config.stage, name)");
  });

  it("gives both ISR revalidation subscriber roles a fixed tc-<stage>- name", () => {
    expect(web).toContain(
      'revalidationEventsSubscriber: fixedServerRole(roleName(stage, "web-revalidation")),',
    );
    expect(web).toContain(
      'revalidationEventsSubscriber: fixedServerRole(roleName(stage, "admin-revalidation")),',
    );
  });
});

// ---- infra/org: the other confirmed VERIFY items ------------------------------------------------------

describe("infra/org VERIFY fixes of 2026-11-13", () => {
  it("the trail key lets CloudTrail decrypt for the S3 Bucket Key, for this trail only", () => {
    const t = parse(read("infra/org/cloudtrail-log-bucket.yaml"));
    const statements = t.Resources.TrailKey.Properties.KeyPolicy.Statement;
    const s = statements.find((x) => x.Sid === "CloudTrailDecryptsForTheBucketKey");
    expect(s).toMatchObject({
      Effect: "Allow",
      Principal: { Service: "cloudtrail.amazonaws.com" },
      Action: "kms:Decrypt",
      Resource: "*",
    });
    // confused deputy: the same trail ARN as the encrypt statement
    const encrypt = statements.find((x) => x.Sid === "CloudTrailEncrypts");
    expect(s.Condition).toEqual({
      StringEquals: { "aws:SourceArn": encrypt.Condition.StringEquals["aws:SourceArn"] },
    });
    expect(s.Condition.StringEquals["aws:SourceArn"]).toEqual({
      "Fn::Sub": "arn:aws:cloudtrail:${AWS::Region}:${ManagementAccountId}:trail/${TrailName}",
    });
  });

  it("TcDnsProvisioner may read the contact reachability status that getDomainDetail calls", () => {
    const t = parse(read("infra/org/dns-account.yaml"));
    const role = t.Resources.TcDnsProvisioner;
    const s = role.Properties.Policies.flatMap((p) => p.PolicyDocument.Statement).find(
      (x) => x.Sid === "DomainRegistration",
    );
    expect(list(s.Action)).toContain("route53domains:GetContactReachabilityStatus");
    expect(read("infra/org/dns-account.yaml")).not.toContain("is not in packages/aws yet");
  });

  it("the GuardDuty list-members command names its required --detector-id", () => {
    for (const file of ["infra/org/guardduty.yaml", "infra/org/README.md"]) {
      expect(read(file), file).toContain("aws guardduty list-members --detector-id <id>");
    }
  });

  it("the SCP comment names the AWS limit of 10,240 characters", () => {
    const scps = read("infra/org/scps.yaml");
    expect(scps).toContain("10,240 characters");
    expect(scps).not.toContain("at most 5,120 characters (AWS limit)");
  });
});

// ---- runbook ---------------------------------------------------------------------------------------------

describe("docs/runbooks/go-live.md", () => {
  const page = read("docs/runbooks/go-live.md");

  it("is indexed and names the ordered steps with their exact commands", () => {
    expect(read("docs/runbooks/README.md")).toContain("[go-live.md](go-live.md)");
    const order = [
      "git push origin main",
      'CREDS="$(aws configure export-credentials --profile your-aws-profile --format env)" && eval "$CREDS"',
      "scripts/golive/ci-roles.sh",
      "pushing the `v*` tag IS the approval",
      "GitHub Pro",
      "scripts/golive/stage-secrets.sh staging",
      "scripts/golive/stage-secrets.sh production",
      "gh workflow run deploy-staging.yml --ref main -f gate=M0",
      "remove-staging.yml",
      "git tag -a v0.1.0",
      "git push origin v0.1.0",
      "TC_PROBE_SOURCES",
      "TOTP",
      "four eyes",
      "every product flag off",
      "budget",
      "## Rollback",
    ];
    let at = -1;
    for (const step of order) {
      const next = page.indexOf(step, at + 1);
      expect(next, step).toBeGreaterThan(at);
      at = next;
    }
    expect(page).toContain("list-open-id-connect-providers");
    // WPU-Z18 review M2: an already set FirstAdminSub is replaced by hand, never with --force
    expect(page).toContain(
      "If the script reports `skipped FirstAdminSub (already set; --force replaces it)`, never re-run it with `--force` (it rotates every random key and the database passwords); set the one name by hand with `npx sst secret set FirstAdminSub --stage production` (value on standard input, as the Rollback section describes) and redeploy.",
    );
    // WPU-Z11 fix round 2: the one-account residuals are named, the asset bucket and headers policy included
    expect(page).toContain("the shared SST asset bucket `sst-asset-*`");
    expect(page).toContain("`tc-<stage>-security-headers`");
  });

  // WPU-Y5 (d): the GitHub facts of 2026-11-14 and the order: GitHub Pro and the tag ruleset before a collaborator.
  it("records the GitHub facts and the tag ruleset script before any collaborator is added", () => {
    for (const text of [
      "private on GitHub Free",
      "HTTP 403",
      "deployment tag policy `v*` of the environment `production`",
      "one collaborator",
      "bash scripts/golive/tag-ruleset.sh",
      "`refs/tags/v*`",
    ]) {
      expect(page, text).toContain(text);
    }
    const before = page.indexOf("**Before adding any collaborator with write access:**");
    expect(before).toBeGreaterThan(-1);
    expect(page.indexOf("buy GitHub Pro", before)).toBeGreaterThan(before);
    expect(page.indexOf("scripts/golive/tag-ruleset.sh", before)).toBeGreaterThan(
      page.indexOf("buy GitHub Pro", before),
    );
  });

  // Final review I1: the production verify job runs gate M5, which holds two manual proofs. The gate stays
  // as it is; the runbook says how the owner records both, in the staging session and before the tag.
  it("names both manual proofs of gate M5 in the staging session, before the tag, and the gate keeps them", async () => {
    const { GATES } = await import("../../verify/checks.mjs");
    const { MANUAL_PROOFS } = await import("../../verify/manual-proofs.mjs");
    const ids = ["m5-gate-b-staging-cycles", "m5-reconciler-staging"];
    const m5 = GATES.M5.map((c) => [c.id, c.command.join(" ")]);
    for (const id of ids) {
      expect(MANUAL_PROOFS[id].gate).toBe("M5");
      expect(m5).toContainEqual([`manual-${id}`, `node scripts/manual-proof.mjs ${id}`]);
    }
    const workflow = read(".github/workflows/deploy-production.yml");
    expect(workflow).toContain("run: pnpm verify --gate M5");
    const session = page.indexOf("7. **Staging test session.**");
    const tag = page.indexOf("git tag -a v0.1.0");
    expect(session).toBeGreaterThan(-1);
    for (const id of ids) {
      for (const text of [`\`${id}\``, `node scripts/manual-proof.mjs ${id}`]) {
        const at = page.indexOf(text, session);
        expect(at, text).toBeGreaterThan(session);
        expect(at, text).toBeLessThan(tag);
      }
    }
    for (const key of [
      "`evidence`",
      "`recordedBy`",
      "`recordedAt`",
      "`verify/manual-proofs.json`",
    ]) {
      expect(page).toContain(key);
    }
    expect(page.indexOf("pnpm verify --gate M5", session)).toBeLessThan(tag);
  });
});
