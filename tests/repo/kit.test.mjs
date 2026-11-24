import { existsSync, readFileSync, statSync } from "node:fs";
import { expect, it } from "vitest";
import { blockAfter, sectionRange, tablesIn } from "../../scripts/lib/md.mjs";

const plan = readFileSync("TICON_CLOUD_MEGA_PLAN.md", "utf8");
const read = (file) => readFileSync(file, "utf8");

it.each([
  ["CLAUDE.md", "## P. `CLAUDE.md`"],
  [".claude/settings.json", "`.claude/settings.json`"],
  [".claude/hooks/protect-files.sh", "`.claude/hooks/protect-files.sh`"],
  [".claude/hooks/stop-check.sh", "`.claude/hooks/stop-check.sh`"],
  [".worktreeinclude", "`.worktreeinclude`"],
  [".claude/skills/wp-start/SKILL.md", "`.claude/skills/wp-start/SKILL.md`"],
  [".claude/skills/wp-verify/SKILL.md", "`.claude/skills/wp-verify/SKILL.md`"],
  [".claude/skills/handoff/SKILL.md", "`.claude/skills/handoff/SKILL.md`"],
  [".claude/agents/security-reviewer.md", "`.claude/agents/security-reviewer.md`"],
  [".claude/agents/money-reviewer.md", "`.claude/agents/money-reviewer.md`"],
  [".claude/agents/spec-checker.md", "`.claude/agents/spec-checker.md`"],
])("%s is the plan's block, unchanged", (file, marker) => {
  // WPU-Y6 (owner, 2026-11-14): the first brand name of the plan is PanelPay in these files; the plan
  // itself is edited in its own pull request. Nothing else may differ from the plan's block.
  const brand = (text) => text.replace(/TiCON\s+Cloud/g, "PanelPay");
  expect(read(file)).toBe(brand(blockAfter(plan, marker)));
});

// WPU-X30: the public pull request template replaces the private process block of the plan.
it(".github/pull_request_template.md asks for the change, the proof and the risk", () => {
  const text = read(".github/pull_request_template.md");
  for (const heading of [
    "## What changed and why",
    "## Proof",
    "## Checklist",
    "## Risk if this is wrong",
  ])
    expect(text, heading).toContain(heading);
});

it("CLAUDE.md is under 200 lines", () => {
  expect(read("CLAUDE.md").split("\n").length).toBeLessThan(200);
});
it("settings.json is valid and has the three hook events", () => {
  const settings = JSON.parse(read(".claude/settings.json"));
  expect(Object.keys(settings.hooks).sort()).toEqual(["PostToolUse", "PreToolUse", "Stop"]);
  for (const list of ["allow", "ask", "deny"])
    expect(Array.isArray(settings.permissions[list])).toBe(true);
});
it("the hook scripts are executable", () => {
  for (const file of [".claude/hooks/protect-files.sh", ".claude/hooks/stop-check.sh"]) {
    expect(statSync(file).mode & 0o111, file).not.toBe(0);
  }
});
it(".gitignore holds every line of the plan's block", () => {
  const lines = read(".gitignore").split("\n");
  for (const line of blockAfter(plan, "Lines to add to `.gitignore`").trim().split("\n")) {
    expect(lines, line).toContain(line);
  }
});
// JOURNEY.md is the owner's private working log; a public checkout does not have it, and this skips.
it.skipIf(!existsSync("JOURNEY.md"))("JOURNEY.md starts with the entry form", () => {
  const form =
    "# JOURNEY\n\nOne entry per task or handoff, newest last. Copy this form:\n\n```markdown\n" +
    blockAfter(plan, "`JOURNEY.md` entry:") +
    "```\n";
  expect(read("JOURNEY.md").startsWith(form)).toBe(true);
});

function ruleText(id) {
  const range = sectionRange(
    plan,
    id.startsWith("U") ? "16.2 UI rules" : "2. Rules that are never broken",
  );
  const row = tablesIn(plan, range.start, range.end)[0].rows.find((r) => r[0] === id);
  return row[1];
}
function idsOf(body) {
  const range = body.match(/U(\d+) to U(\d+)/);
  if (range)
    return Array.from({ length: range[2] - range[1] + 1 }, (_, i) => `U${Number(range[1]) + i}`);
  return body
    .split(" in full")[0]
    .split(",")
    .map((s) => s.trim());
}
const r = sectionRange(plan, "R. Path-scoped rules");
const ruleRows = tablesIn(plan, r.start, r.end)[0].rows;

it("Appendix R names seven rule files", () => {
  expect(ruleRows.map((row) => row[0])).toEqual([
    "`money.md`",
    "`aws.md`",
    "`data.md`",
    "`ui.md`",
    "`admin.md`",
    "`lifecycle.md`",
    "`server.md`",
  ]);
});
// Title and bullets of each rule file (the table "Titles and bullets" of the task 4 brief). The
// bullets of money.md are those of the plan's example block.
const moneyBullets = blockAfter(plan, "Example, `.claude/rules/money.md`")
  .trim()
  .split("\n")
  .filter((line) => line.startsWith("- "));
const ruleFiles = {
  "money.md": ["# Money rules", moneyBullets],
  "aws.md": [
    "# AWS rules",
    [
      "- Specification: docs/spec/03-architecture.md, docs/spec/06-identity-and-access.md and docs/spec/10-provisioning.md",
    ],
  ],
  "data.md": [
    "# Data rules",
    ["- Every new repository method takes the tenant scope and gets a cross-tenant test."],
  ],
  "ui.md": [
    "# UI rules",
    [
      "- Specification: the files in docs/spec/16/, above all 16.4 (tokens), 16.6 (kit) and 16.13 (statements and names).",
    ],
  ],
  "admin.md": ["# Admin rules", ["- Specification: docs/spec/16/16.12-admin-screens-wp8.md"]],
  "lifecycle.md": [
    "# Lifecycle rules",
    [
      "- Specification: docs/spec/11-lifecycle-engine.md",
      "- Time comes from the injected Clock only.",
    ],
  ],
  "server.md": [
    "# Server rules",
    [
      "- Specification: docs/spec/02-rules-that-are-never-broken.md and docs/spec/06-identity-and-access.md",
    ],
  ],
};
it.each(ruleRows)(
  "rule file %s is exactly the row's paths, its title, its rules in order and its bullets",
  (file, paths, body) => {
    const name = file.replaceAll("`", "");
    const [title, bullets] = ruleFiles[name];
    const expected = [
      "---",
      "paths:",
      ...paths.split(",").map((p) => `  - "${p.trim().replaceAll("`", "")}"`),
      "---",
      "",
      title,
      "",
      ...idsOf(body).flatMap((id) => [`**${id}.** ${ruleText(id)}`, ""]),
      ...bullets,
      "",
    ].join("\n");
    expect(read(`.claude/rules/${name}`)).toBe(expected);
  },
);
it("money.md ends with the three bullets of the plan's example", () => {
  const example = blockAfter(plan, "Example, `.claude/rules/money.md`").trim().split("\n");
  const bullets = example.filter((line) => line.startsWith("- "));
  expect(bullets).toHaveLength(3);
  expect(read(".claude/rules/money.md").trim().split("\n").slice(-3)).toEqual(bullets);
});

const owners = read(".github/CODEOWNERS")
  .split("\n")
  .filter((line) => line !== "" && !line.startsWith("#"))
  .map((line) => line.split(/\s+/));
it("CODEOWNERS covers the paths of spec E.1, each owned by the maintainer (WPU-X30: no placeholder handles in a public repo)", () => {
  expect(owners.map((rule) => rule[0])).toEqual([
    "/packages/core/pricing/",
    "/packages/core/ledger/",
    "/packages/core/orders/",
    "/packages/eps/",
    "/functions/payments-sweeper/",
    "/packages/db/migrations/",
    "/packages/auth/",
    "/infra/",
    "/sst.config.ts",
    "/docs/runbooks/",
    "/.claude/",
    "/CLAUDE.md",
    "/.github/",
    "/scripts/",
    "/verify/",
    "/tests/repo/",
    "/TICON_CLOUD_MEGA_PLAN.md",
    "/package.json",
    "/pnpm-workspace.yaml",
    "/eslint.config.mjs",
    "/vitest.config.mjs",
    "/tsconfig.base.json",
    "/.prettierrc.json",
    "/.prettierignore",
    "/.gitleaks.toml",
    "/.gitignore",
    "/.worktreeinclude",
  ]);
  for (const rule of owners) {
    expect(rule.slice(1), rule[0]).toEqual(["@bemoshiur"]);
  }
});
it("CODEOWNERS covers every kit path that B.2 of the plan lists", () => {
  const row = plan.split("\n").find((line) => line.startsWith("| GitHub |"));
  const kit = row.slice(row.indexOf("on the kit (")).split(")")[0];
  const paths = [...kit.matchAll(/`([^`]+)`/g)].map((match) => "/" + match[1]);
  expect(paths).toHaveLength(17);
  for (const path of paths)
    expect(
      owners.map((rule) => rule[0]),
      path,
    ).toContain(path);
});
it("CODEOWNERS covers every path of the money rule file", () => {
  const moneyPaths = ruleRows
    .find((row) => row[0] === "`money.md`")[1]
    .split(",")
    .map((path) => "/" + path.trim().replaceAll("`", "").replace("**", ""));
  expect(moneyPaths).toHaveLength(5);
  for (const path of moneyPaths)
    expect(
      owners.map((rule) => rule[0]),
      path,
    ).toContain(path);
});
it("the pricing engine sits where the money rule file looks for it", () => {
  // Appendix R scopes the money rules to packages/core/pricing/**, so the code must be at that path (Task 7).
  expect(ruleRows.find((row) => row[0] === "`money.md`")[1]).toContain(
    "`packages/core/pricing/**`",
  );
  expect(statSync("packages/core/pricing").isDirectory()).toBe(true);
});
