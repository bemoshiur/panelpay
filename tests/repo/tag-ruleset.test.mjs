// WPU-Y5 (d): scripts/golive/tag-ruleset.sh, the repository ruleset on the release tags refs/tags/v*. Nothing here
// calls GitHub: the script runs against a fake `gh` on PATH that logs its arguments and the body it is given.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const SCRIPT = "scripts/golive/tag-ruleset.sh";
const TOKEN = "fake-gh-login-value-for-tests";
const WANTED = "tag active refs/tags/v* creation,deletion,update RepositoryRole:5:always";

function run(env = {}) {
  const dir = mkdtempSync(join(tmpdir(), "tag-ruleset-"));
  const log = join(dir, "calls.log");
  const gh = join(dir, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
args="$(printf "%s " "$@" | tr "\\n" " ")"
body=""
if [[ "$args" == *"--input -"* ]]; then body="$(tr -d "\\n")"; fi
echo "gh $args BODY=$body" >> "${log}"
fail() { echo "gh: Some message of GitHub (HTTP $1)" >&2; exit 1; }
case "$args" in
  *"--method POST"*) [[ -z "\${FAKE_FAIL_WRITE:-}" ]] || fail "$FAKE_FAIL_WRITE"; echo 777 ;;
  *"--method PUT"*) [[ -z "\${FAKE_FAIL_WRITE:-}" ]] || fail "$FAKE_FAIL_WRITE"; echo "\${FAKE_IDS%% *}" ;;
  *"rulesets?targets=tag"*) [[ -z "\${FAKE_FAIL_LIST:-}" ]] || fail "$FAKE_FAIL_LIST"; for id in \${FAKE_IDS:-}; do echo "$id"; done ;;
  *) [[ -z "\${FAKE_FAIL_READ:-}" ]] || fail "$FAKE_FAIL_READ"; echo "\${FAKE_SHAPE:-${WANTED}}" ;;
esac`,
  );
  chmodSync(gh, 0o755);
  const result = spawnSync("bash", [join(root, SCRIPT)], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: `${dir}:/usr/bin:/bin`, HOME: dir, GH_TOKEN: TOKEN, ...env },
  });
  const calls = existsSync(log) ? readFileSync(log, "utf8") : "";
  return { ...result, calls, lines: calls.split("\n").filter(Boolean) };
}

const bodyOf = (line) => JSON.parse(line.split("BODY=")[1]);

describe("scripts/golive/tag-ruleset.sh", () => {
  it("creates the ruleset when none exists, with the documented body, and reads it back", () => {
    const r = run();
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(
      "tag-ruleset: created ruleset 777 (tc-release-tags: refs/tags/v*, creation, update and deletion for repository admins only)",
    );
    expect(r.lines).toHaveLength(3);
    expect(r.lines[0]).toContain(
      "repos/bemoshiur/panelpay/rulesets?targets=tag&includes_parents=false&per_page=100",
    );
    expect(r.lines[0]).toContain("X-GitHub-Api-Version: 2022-11-28");
    expect(r.lines[1]).toContain("--method POST repos/bemoshiur/panelpay/rulesets ");
    expect(bodyOf(r.lines[1])).toEqual({
      name: "tc-release-tags",
      target: "tag",
      enforcement: "active",
      bypass_actors: [{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" }],
      conditions: { ref_name: { include: ["refs/tags/v*"], exclude: [] } },
      rules: [{ type: "creation" }, { type: "update" }, { type: "deletion" }],
    });
    expect(r.lines[2]).toContain("repos/bemoshiur/panelpay/rulesets/777 ");
  });

  it("is idempotent: an existing ruleset of that name is updated in place (PUT), never created twice", () => {
    const r = run({ FAKE_IDS: "4242" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("tag-ruleset: updated ruleset 4242");
    expect(r.calls).not.toContain("--method POST");
    const put = r.lines.find((l) => l.includes("--method PUT"));
    expect(put).toContain("repos/bemoshiur/panelpay/rulesets/4242 ");
    expect(bodyOf(put).rules.map((x) => x.type)).toEqual(["creation", "update", "deletion"]);
  });

  it("says that GitHub Pro is needed on HTTP 403 (a private repository on Free), exits 3 and changes nothing", () => {
    for (const env of [{ FAKE_FAIL_LIST: "403" }, { FAKE_FAIL_WRITE: "403" }]) {
      const r = run(env);
      expect(r.status, JSON.stringify(env)).toBe(3);
      expect(r.stderr).toContain("HTTP 403");
      expect(r.stderr).toContain("GitHub Pro");
      expect(r.stderr).toContain("Nothing changed");
      expect(r.stdout).toBe("");
      // the raw answer of GitHub is never printed
      expect(r.stderr).not.toContain("Some message of GitHub");
    }
    expect(run({ FAKE_FAIL_LIST: "403" }).calls).not.toContain("--method");
  });

  it("names other HTTP failures without printing GitHub's answer", () => {
    const notFound = run({ FAKE_FAIL_LIST: "404" });
    expect(notFound.status).toBe(1);
    expect(notFound.stderr).toContain("HTTP 404");
    const other = run({ FAKE_FAIL_WRITE: "422" });
    expect(other.status).toBe(1);
    expect(other.stderr).toContain("HTTP 422");
    expect(other.stderr).not.toContain("Some message of GitHub");
  });

  it("refuses when the ruleset read back differs from the wanted form, or the list is ambiguous (R16)", () => {
    const wrong = run({ FAKE_SHAPE: "tag evaluate refs/tags/v* creation,deletion,update" });
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toContain("does not hold the wanted form");
    // fix round 1: a read-back that fails after a successful write never says "Nothing changed"
    const unreadable = run({ FAKE_FAIL_READ: "500" });
    expect(unreadable.status).toBe(1);
    expect(unreadable.stderr).toContain("HTTP 500");
    expect(unreadable.stderr).toContain("The ruleset WAS written (created 777)");
    expect(unreadable.stderr).toContain("check tc-release-tags in the GitHub settings");
    expect(unreadable.stderr).not.toContain("Nothing changed");
    const updatedUnreadable = run({ FAKE_IDS: "4242", FAKE_FAIL_READ: "403" });
    expect(updatedUnreadable.status).toBe(1);
    expect(updatedUnreadable.stderr).toContain("The ruleset WAS written (updated 4242)");
    expect(updatedUnreadable.stderr).not.toContain("Nothing changed");
    const two = run({ FAKE_IDS: "1 2" });
    expect(two.status).toBe(1);
    expect(two.stderr).toContain("more than one ruleset");
    expect(two.calls).not.toContain("--method");
    const junk = run({ FAKE_IDS: "abc" });
    expect(junk.status).toBe(1);
    expect(junk.calls).not.toContain("--method");
  });

  it("never prints or passes the gh token", () => {
    for (const env of [
      {},
      { FAKE_IDS: "9" },
      { FAKE_FAIL_LIST: "403" },
      { FAKE_FAIL_WRITE: "500" },
    ]) {
      const r = run(env);
      expect(r.stdout + r.stderr).not.toContain(TOKEN);
      expect(r.calls).not.toContain(TOKEN);
    }
    const text = readFileSync(join(root, SCRIPT), "utf8");
    expect(text).not.toMatch(/GH_TOKEN|GITHUB_TOKEN|auth token/);
  });

  it("refuses without gh on PATH", () => {
    const r = spawnSync("bash", [join(root, SCRIPT)], {
      cwd: root,
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", HOME: tmpdir() },
    });
    const ghOnSystem = spawnSync("bash", ["-c", "command -v gh"], {
      env: { PATH: "/usr/bin:/bin" },
    });
    if (ghOnSystem.status === 0) return; // a system gh in /usr/bin: the PATH test cannot hide it
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("gh is not installed");
  });
});
