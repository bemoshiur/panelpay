import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// WPU-Z16: the OmniRank audit and the IndexNow ping. They read the public site only: no AWS role, no
// secret, no write permission, OmniRank pinned by commit, inputs through env:.
const root = resolve(import.meta.dirname, "../..");
const text = readFileSync(join(root, ".github/workflows/omnirank.yml"), "utf8");
const workflow = parse(text);
const config = JSON.parse(readFileSync(join(root, "omnirank.config.json"), "utf8"));
const steps = (job) => workflow.jobs[job].steps;
const HOST_CHECK =
  '[[ "$TC_DOMAIN_WEB" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$ ]]';
const runs = (job) => steps(job).map((s) => (typeof s.run === "string" ? s.run : ""));

describe("omnirank.yml", () => {
  it("runs by hand against staging or production, and after a successful production deploy", () => {
    expect(workflow.on.workflow_dispatch.inputs.target.options).toEqual(["staging", "production"]);
    expect(workflow.on.workflow_dispatch.inputs.target.default).toBe("staging");
    expect(workflow.on.workflow_run.workflows).toEqual(["deploy-production"]);
    expect(workflow.jobs.audit.if).toContain("workflow_run.conclusion == 'success'");
    expect(Object.keys(workflow.on)).not.toContain("pull_request");
  });

  it("installs OmniRank v0.4.0 by its commit in a virtual environment and audits with the repo config", () => {
    expect(workflow.env.OMNIRANK_COMMIT).toMatch(/^[0-9a-f]{40}$/);
    expect(workflow.env.OMNIRANK_COMMIT).toBe("dabe4bedd6e2623aa0160cb584bf5880aaec14bc");
    const all = runs("audit").join("\n");
    expect(all).toContain("python3 -m venv");
    expect(all).toContain(
      "github.com/bemoshiur/OmniRank.git@${OMNIRANK_COMMIT}#subdirectory=scripts/py",
    );
    expect(all).toMatch(/omnirank" audit --config/);
    // The gates come from the config (audit.failOn): no --fail-on on the command line overrides them.
    expect(all).not.toContain("--fail-on");
  });

  it("installs every Python dependency from a hashed lock and OmniRank without resolving any (R17)", () => {
    const install = steps("audit").find((s) => /Install OmniRank/.test(s.name ?? "")).run;
    expect(install).toMatch(
      /pip" install --no-input --require-hashes --no-deps \\\s*-r \.github\/omnirank\/requirements\.txt/,
    );
    expect(install).toMatch(
      /pip" install --no-input --no-deps --no-build-isolation \\\s*"omnirank @ git\+/,
    );
    // Every pip install of the job is one of these two: nothing resolved from an open range.
    const installs = install.match(/pip" install[^\n]*/g);
    expect(installs).toHaveLength(2);
    for (const line of installs) expect(line).toContain("--no-deps");
    expect(install).toContain("sys.version_info[:2] == (3, 12)");
    expect(workflow.env.PIP_NO_CACHE_DIR).toBe("1");
    expect(text).not.toMatch(/uses:\s*actions\/cache|^\s*cache:/m);
  });

  it("the lock pins every package by version and by hash, setuptools included", () => {
    const path = join(root, ".github/omnirank/requirements.txt");
    const lock = readFileSync(path, "utf8");
    const entries = lock
      .split(/\n(?=[a-z0-9])/i)
      .filter((block) => /^[a-z0-9][a-z0-9._-]*==/i.test(block));
    expect(entries.length).toBeGreaterThanOrEqual(10);
    for (const entry of entries)
      expect(entry, entry.split("\n")[0]).toMatch(/--hash=sha256:[0-9a-f]{64}/);
    const names = entries.map((e) => e.split("==")[0].toLowerCase());
    for (const name of ["httpx", "beautifulsoup4", "lxml", "jsonschema", "setuptools"]) {
      expect(names, name).toContain(name);
    }
  });

  it("drops only the indexing gates on staging, which is noindex by design", () => {
    expect(JSON.parse(workflow.env.STAGING_SKIPPED_GATES)).toEqual([
      "ai-allowlist",
      "noindex-in-sitemap",
      "robots-sitemap",
      "canonical-target",
      "hreflang-noindex",
    ]);
    const audit = steps("audit").find((s) => s.name === "Audit").run;
    expect(audit).toContain(
      'if [ "$TARGET" = "staging" ]; then skip="$STAGING_SKIPPED_GATES"; else skip=\'[]\'; fi',
    );
    expect(audit).toContain(".audit.failOn -= $skip");
  });

  it("escapes newlines and pipes of the audited site's text in the summary table", () => {
    const report = steps("audit").find((s) => /summary/.test(s.name ?? "")).run;
    expect(report).toContain('gsub("[\\r\\n]"; " ")');
    expect(report).toContain('gsub("\\\\|"; "\\\\|")');
  });

  it("holds no secret, no AWS role and no expression inside a script", () => {
    expect(text).not.toMatch(/secrets\./);
    expect(text).not.toMatch(/configure-aws-credentials|id-token/);
    expect(workflow.permissions).toEqual({ contents: "read" });
    for (const job of Object.keys(workflow.jobs)) {
      for (const run of runs(job)) expect(run).not.toContain("${{");
    }
  });

  it("pings IndexNow for production only, at the origin of the environment production", () => {
    const ping = runs("indexnow").join("\n");
    expect(ping).toContain('node scripts/indexnow-ping.mjs --origin "https://$TC_DOMAIN_WEB"');
    expect(ping).toContain(HOST_CHECK);
    expect(workflow.jobs.indexnow.environment).toEqual({ name: "production", deployment: false });
    expect(workflow.jobs.indexnow.if).toContain("inputs.target == 'production'");
  });

  // Final review M4: the origins come from the variable TC_DOMAIN_WEB of the target's GitHub environment,
  // not from a host written in the workflow.
  it("reads the target origin from TC_DOMAIN_WEB of the target's environment, without a deployment", () => {
    expect(text).not.toMatch(/https:\/\/(staging\.)?tryaws\.now/);
    expect(workflow.jobs.audit.environment).toEqual({
      name: "${{ github.event.inputs.target || 'production' }}",
      deployment: false,
    });
    const choose = steps("audit").find((s) => s.name === "Choose the site");
    expect(choose.env.TC_DOMAIN_WEB).toBe("${{ vars.TC_DOMAIN_WEB }}");
    expect(choose.run).toContain(HOST_CHECK);
    expect(choose.run).toContain('echo "SITE_URL=https://$TC_DOMAIN_WEB" >> "$GITHUB_ENV"');
    const ping = steps("indexnow").find((s) => /IndexNow/.test(s.name ?? ""));
    expect(ping.env.TC_DOMAIN_WEB).toBe("${{ vars.TC_DOMAIN_WEB }}");
  });

  it("refuses a TC_DOMAIN_WEB that is not a host name, before anything is audited (R16)", () => {
    const choose = steps("audit").find((s) => s.name === "Choose the site").run;
    const dir = mkdtempSync(join(tmpdir(), "omnirank-"));
    const runChoose = (target, domain) => {
      const envFile = join(dir, `env-${Math.random().toString(16).slice(2)}`);
      writeFileSync(envFile, "");
      const r = spawnSync("bash", ["-e", "-c", choose], {
        env: { PATH: process.env.PATH, TARGET: target, TC_DOMAIN_WEB: domain, GITHUB_ENV: envFile },
        encoding: "utf8",
      });
      return { status: r.status, env: readFileSync(envFile, "utf8") };
    };
    expect(runChoose("staging", "staging.example.com")).toEqual({
      status: 0,
      env: "SITE_URL=https://staging.example.com\n",
    });
    expect(runChoose("production", "example.com").env).toBe("SITE_URL=https://example.com\n");
    for (const bad of [
      "",
      "https://example.com",
      "example.com/x",
      "example.com:443",
      "Example.com",
      "localhost",
      "example.com\nSITE_URL=https://evil.example",
      "a.b c.com",
    ]) {
      const r = runChoose("production", bad);
      expect(r.status, JSON.stringify(bad)).not.toBe(0);
      expect(r.env, JSON.stringify(bad)).toBe("");
    }
    expect(runChoose("other", "example.com").status).not.toBe(0);
  });
});

describe("omnirank.config.json", () => {
  it("is valid against the parts of OmniRank's schema it uses", () => {
    expect(Object.keys(config).sort()).toEqual(
      [
        "$schema",
        "aeo",
        "audit",
        "crawlers",
        "geo",
        "indexing",
        "nap",
        "sameAs",
        "site",
        "stack",
      ].sort(),
    );
    expect(config.$schema).toContain("/v0.4.0/schemas/omnirank.config.schema.json");
    expect(config.site).toMatchObject({
      name: "PanelPay",
      url: "https://tryaws.now",
      entityType: "Organization",
    });
    expect(config.aeo.answerBlock.default).toEqual({ unit: "words", min: 40, max: 60 });
    // sameAs lists only profiles that exist: none yet, so every value is null (the worklist).
    for (const value of Object.values(config.sameAs)) expect(value).toBeNull();
    // No literal secret: OmniRank accepts only env: pointers, and this config needs none.
    expect(config.secrets).toBeUndefined();
  });

  it("names the IndexNow key file that exists", () => {
    const key = config.indexing.indexnowKeyFile;
    expect(key).toMatch(/^apps\/web\/public\/[0-9a-f]{32}\.txt$/);
    expect(readFileSync(join(root, key), "utf8")).toBe(key.slice(-36, -4));
  });
});
