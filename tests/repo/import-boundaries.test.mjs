import { readdirSync } from "node:fs";
import { posix } from "node:path";
import { ESLint } from "eslint";
import { expect, it } from "vitest";
import { readWorkspacePackages } from "../../scripts/lib/changed-packages.mjs";

// These rows test the lint rules of eslint.config.mjs. The rules are tripwires for accidents: they
// read import statements, export-from statements and import() calls with a literal source, and
// nothing else. They do not see a bridge file outside apps/ and packages/, a committed symbolic
// link, an AWS package that is not listed, a loader reached through an alias, or a call that is not
// an import. IAM (WP0-T5, not built yet) is the boundary (R1).
// A source folder of apps/ or packages/ must not be called dist: the config ignores every dist
// folder, and the walk below skips it.
// One config for every row: ESLint 10 looks up the config from the folder of each file, so a nested
// eslint.config.mjs would otherwise replace the rules for its folder.
const eslint = new ESLint({ overrideConfigFile: "eslint.config.mjs" });
async function errors(filePath, code) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.severity === 2).map((m) => m.message);
}

it.each([
  ["apps/web/x.ts", 'import "@tc/aws";', "R1:"],
  ["apps/admin/x.ts", 'import "@tc/aws/adapters/linux";', "R1:"],
  ["apps/web/x.ts", 'import "../../packages/aws/index";', "R1:"],
  ["packages/db/x.ts", 'import "@tc/aws";', "R1:"],
  ["apps/web/x.ts", 'import "@aws-sdk/client-lightsail";', "Spec section 4:"],
  ["functions/reader/x.ts", 'import "@aws-sdk/client-sts";', "Spec section 4:"],
  ["packages/core/x.ts", 'import "@aws-sdk/client-s3";', "packages/core is pure logic:"],
  ["packages/core/x.ts", 'import "node:https";', "packages/core is pure logic:"],
  ["packages/core/ledger/x.ts", 'import "big.js";', "R4:"],
  ["packages/db/x.ts", 'import "decimal.js";', "R4:"],
  ["packages/aws/x.ts", 'import "big.js";', "R4:"],
  ["apps/web/x.ts", 'import "big.js";', "R4:"],
  ["functions/scheduler/x.ts", 'import "bignumber.js";', "R4:"],
  ["packages/core/pricing/x.ts", 'import "node:https";', "packages/core is pure logic:"],
  ["apps/web/x.ts", 'import "@tc/fn-provisioner";', "R1:"],
  ["apps/admin/x.ts", 'import "../../functions/reader/index";', "R1:"],
  ["packages/db/x.ts", 'import "@tc/fn-reader";', "R1:"],
  ["packages/core/pricing/x.ts", 'import "../../aws/index";', "R1:"],
  ["apps/web/x.ts", 'await import("@tc/aws");', "R1:"],
  ["apps/admin/x.ts", 'await import("@tc/aws/adapters/linux");', "R1:"],
  ["apps/web/x.ts", 'await import("../../packages/aws/index");', "R1:"],
  ["apps/web/x.ts", "await import(`@tc/aws`);", "R1:"],
  ["apps/web/x.ts", 'const name = "@tc/aws"; await import(name);', "R1:"],
  ["packages/notify/x.ts", 'await import("@tc/aws");', "R1:"],
  ["packages/core/x.ts", 'await import("../aws/index");', "R1:"],
  ["packages/ui/x.tsx", 'export * from "@tc/aws";', "R1:"],
  ["packages/auth/x.ts", 'export { createAwsAccess } from "@tc/aws";', "R1:"],
  [
    "packages/core/x.ts",
    'export { createAwsAccess } from "@tc/aws";',
    "packages/core is pure logic:",
  ],
  ["apps/web/x.ts", 'import type { AwsError } from "@tc/aws"; export type E = AwsError;', "R1:"],
  ["apps/web/x.ts", 'const aws = require("@tc/aws"); export default aws;', "require()"],
  ["apps/web/x.ts", 'import "@aws-sdk/credential-providers";', "Spec section 4:"],
  ["apps/web/x.test.ts", 'await import("@tc/aws");', "R1:"],
  ["packages/db/test/helper.ts", 'const name = "x"; await import(name);', "R1:"],
  ["packages/ui/x.tsx", 'await import("../../functions/reader/index");', "R1:"],
  ["apps/web/x.ts", 'await import("@aws-sdk/client-lightsail");', "Spec section 4:"],
  ["apps/web/x.ts", 'await import("@aws-sdk/credential-providers/sub");', "Spec section 4:"],
  ["packages/core/x.ts", 'await import("@aws-sdk/client-sts");', "Spec section 4:"],
  ["functions/reader/x.ts", 'await import("@aws-sdk/client-sts");', "Spec section 4:"],
  ["apps/web/x.test.ts", 'await import("@aws-sdk/client-sts");', "Spec section 4:"],
  ["apps/web/x.ts", 'await import("@AWS-SDK/client-sts");', "Spec section 4:"],
  ["apps/web/x.test.ts", "await import(`@aws-sdk/client-sts`);", "Spec section 4:"],
  ["apps/web/x.test.ts", "await import(`@tc/aws`);", "R1:"],
  ["apps/web/x.ts", 'await import("../../PACKAGES/AWS/index");', "R1:"],
  ["apps/web/fixtures.test.data.ts", 'const n = "x"; await import(n);', "R1:"],
  [
    "apps/web/x.ts",
    'import { createRequire } from "node:module"; createRequire(import.meta.url)("@tc/aws");',
    "R1:",
  ],
  [
    "apps/web/x.ts",
    'process.getBuiltinModule("module").createRequire(import.meta.url)("@tc/aws");',
    "R1:",
  ],
  [
    "packages/notify/x.test.ts",
    'import { createRequire } from "node:module"; createRequire(import.meta.url)("@tc/aws");',
    "R1:",
  ],
  ["packages/ui/x.tsx", 'eval("1");', "`eval` can be harmful"],
  ["apps/web/x.ts", 'new Function("return 1")();', "Function constructor is eval"],
  ["apps/web/x.ts", 'globalThis.setTimeout("x()", 1);', "Implied eval."],
  ["packages/db/x.ts", 'import "@tc/core";', "packages/db sits below packages/core"],
  [
    "packages/db/repositories/customer/x.ts",
    'import "../../../core/types";',
    "packages/db sits below packages/core",
  ],
  [
    "packages/db/repositories/x.ts",
    'import { sql } from "drizzle-orm";\nsql.raw("select 1");',
    "packages/db/repositories: sql.raw",
  ],
  [
    "packages/db/repositories/customer/x.ts",
    'sql["raw"]("x");',
    "packages/db/repositories: sql.raw",
  ],
  [
    "packages/db/repositories/customer/x.ts",
    'import { sql as s } from "drizzle-orm"; s.raw("x");',
    "packages/db/repositories: sql.raw",
  ],
  [
    "packages/db/repositories/customer/x.ts",
    'const { raw } = sql; raw("x");',
    "packages/db/repositories: sql.raw",
  ],
  [
    "packages/db/repositories/customer/x.ts",
    'sql[`raw`]("x");',
    "packages/db/repositories: sql.raw",
  ],
  [
    "packages/db/repositories/customer/x.ts",
    'const { "raw": r } = sql; r("x");',
    "packages/db/repositories: sql.raw",
  ],
  ["packages/db/repositories/customer/x.ts", 'await import("@tc/aws");', "R1:"],
  [
    "packages/db/repositories/customer/x.ts",
    'await import("@aws-sdk/client-sts");',
    "Spec section 4:",
  ],
  [
    "packages/db/repositories/customer/x.ts",
    'import { createRequire } from "node:module"; createRequire(import.meta.url)("@tc/aws");',
    "R1:",
  ],
  ["packages/db/repositories/customer/x.ts", 'const name = "x"; await import(name);', "R1:"],
  ["packages/db/x.ts", 'import "@aws-sdk/client-sts";', "Spec section 4:"],
  ["packages/db/repositories/x.ts", 'import "../../aws/x";', "R1:"],
  // W38: an inline directive cannot switch R1 off (static and dynamic, a relative-path form).
  [
    "apps/web/x.ts",
    '// eslint-disable-next-line no-restricted-imports\nimport "../../packages/aws/index";',
    "R1:",
  ],
  [
    "apps/web/x.ts",
    '// eslint-disable-next-line\nawait import("../../packages/aws/index");',
    "R1:",
  ],
  ["apps/web/x.ts", 'import "../../packages/aws/index"; // eslint-disable-line', "R1:"],
  ["apps/web/x.ts", 'await import("../../packages/aws/index"); // eslint-disable-line', "R1:"],
  ["apps/web/x.ts", '/* eslint-disable */\nimport "../../packages/aws/index";', "R1:"],
  ["apps/web/x.ts", '/* eslint-disable */\nawait import("../../packages/aws/index");', "R1:"],
  [
    "packages/ui/x.ts",
    '/* eslint-disable no-restricted-syntax */\nawait import("../../aws/index");',
    "R1:",
  ],
  ["apps/web/x.ts", '/* eslint-disable */\nimport "@aws-sdk/client-sts";', "Spec section 4:"],
  // W41a: a source that goes through a folder named node_modules.
  ["apps/web/x.ts", 'import "../../node_modules/@tc/aws/index";', "R1:"],
  ["apps/web/x.ts", 'import "./node_modules/foo";', "R1:"],
  ["apps/web/x.ts", 'export * from "./node_modules/foo";', "R1:"],
  ["packages/ui/x.ts", 'export { a } from "../node_modules/foo/a";', "R1:"],
  ["apps/web/x.ts", 'await import("../node_modules/foo");', "R1:"],
  ["packages/notify/x.ts", 'await import("../../node_modules/foo");', "R1:"],
  ["apps/web/x.test.ts", 'await import("./node_modules/foo");', "R1:"],
  ["packages/db/repositories/x.ts", 'await import("../node_modules/foo");', "R1:"],
  ["packages/core/x.ts", 'import "../node_modules/foo";', "R1:"],
  ["apps/web/x.ts", 'await import("../node_modules/foo");', "Spec section 4:"],
  ["apps/web/x.test.ts", "await import(`../node_modules/foo`);", "Spec section 4:"],
  ["packages/db/x.ts", 'import "../node_modules/foo";', "R1:"],
  // W41b: a ? or # in an import source.
  ["apps/web/x.ts", 'import "./a?x=1";', "a ? or # in an import source"],
  ["apps/web/x.ts", 'import "./a#x";', "a ? or # in an import source"],
  ["packages/ui/x.ts", 'export * from "./a?x";', "a ? or # in an import source"],
  ["packages/ui/x.ts", 'export { a } from "./a#x";', "a ? or # in an import source"],
  ["apps/web/x.ts", 'await import("./a?x");', "a ? or # in an import source"],
  ["apps/web/x.test.ts", 'await import("./a#x");', "a ? or # in an import source"],
  ["apps/web/x.test.ts", "await import(`./a?x`);", "a ? or # in an import source"],
  ["packages/db/repositories/x.ts", 'await import("./a?x");', "a ? or # in an import source"],
  // W41c: aws-sdk (v2) joins the ban list.
  ["apps/web/x.ts", 'import "aws-sdk";', "Spec section 4:"],
  ["apps/web/x.ts", 'import "aws-sdk/clients/s3";', "Spec section 4:"],
  ["functions/reader/x.ts", 'import "aws-sdk";', "Spec section 4:"],
  ["packages/ui/x.ts", 'await import("aws-sdk");', "Spec section 4:"],
  // W41d: the second deny list.
  ["apps/web/x.ts", 'import "node:module";', "R1: this module"],
  ["packages/ui/x.ts", 'import "module";', "R1: this module"],
  ["apps/web/x.ts", 'import "@aws-sdk/nested-clients";', "R1: this module"],
  ["apps/web/x.ts", 'import "@aws-sdk/nested-clients/sts";', "R1: this module"],
  ["packages/auth/x.ts", 'import "@aws-sdk/credential-provider-node";', "R1: this module"],
  ["packages/auth/x.ts", 'import "@aws-sdk/credential-provider-ini/x";', "R1: this module"],
  ["packages/db/x.ts", 'import "@smithy/signature-v4";', "R1: this module"],
  ["packages/core/x.ts", 'import "node:module";', "R1: this module"],
  ["apps/web/x.ts", 'import "node:vm";', "R1: this module"],
  ["apps/admin/x.ts", 'import "node:child_process";', "R1: this module"],
  ["apps/web/x.ts", 'import "node:worker_threads";', "R1: this module"],
  [
    "apps/web/x.ts",
    'process["getBuiltinModule"]("module")["createRequire"](import.meta.url)("x");',
    "R1: createRequire",
  ],
  ["apps/web/x.ts", 'x["createRequire"]("x");', "R1: createRequire"],
  ["apps/web/x.test.ts", 'x["getBuiltinModule"]("x");', "R1: createRequire"],
  ["packages/db/repositories/x.ts", 'x["createRequire"]("x");', "R1: createRequire"],
  // W41e: packages/aws writes no log line.
  ["packages/aws/x.ts", "const sts = { logger: console };", "packages/aws writes no log line"],
  ["packages/aws/x.ts", "new Client({ logger: l });", "packages/aws writes no log line"],
  ["packages/aws/x.ts", 'new Client({ "logger": l });', "packages/aws writes no log line"],
  ["packages/aws/x.ts", "console.log(1);", "packages/aws writes no log line"],
  ["packages/aws/clients/x.ts", "console.error(e);", "packages/aws writes no log line"],
  ["packages/aws/x.ts", "client.logger = l;", "packages/aws writes no log line"],
  // W40b: every extension and place of a source file under apps/.
  ["apps/web/app/[locale]/x.tsx", 'import "@tc/aws";', "R1:"],
  ["apps/web/app/[locale]/x.tsx", 'import "@aws-sdk/client-sts";', "Spec section 4:"],
  ["apps/admin/x.tsx", 'import "@tc/aws";', "R1:"],
  ["apps/admin/x.tsx", 'import "@aws-sdk/client-sts";', "Spec section 4:"],
  ["apps/web/x.mjs", 'import "@tc/aws";', "R1:"],
  ["apps/web/x.mjs", 'import "@aws-sdk/client-sts";', "Spec section 4:"],
  ["apps/web/x.test.tsx", 'import "@tc/aws";', "R1:"],
  ["apps/web/x.test.tsx", 'import "@aws-sdk/client-sts";', "Spec section 4:"],
  ["apps/web/x.jsx", 'import "@tc/aws";', "R1:"],
  // The system writes of operations are not for the apps.
  ["apps/web/x.ts", 'import { enqueueOperation } from "@tc/core";', "R8/R10:"],
  ["apps/admin/x.ts", 'import { approveOperation } from "@tc/db";', "R8/R10:"],
  // WPU-X4 review M1: the pool account seed (master user, table owner) is the migrator's and the CLI's.
  ["apps/web/x.ts", 'import { seedPoolAccount } from "@tc/db/seed-pool";', "WPU-X4:"],
  ["apps/admin/x.tsx", 'export * from "@tc/db/seed-pool";', "WPU-X4:"],
  ["apps/admin/x.ts", 'import "../../packages/db/seed-pool";', "WPU-X4:"],
  ["apps/web/x.ts", 'await import("@tc/db/seed-pool");', "WPU-X4:"],
  [
    "packages/db/operations/x.ts",
    'import { sql } from "drizzle-orm";\nsql.raw("select 1");',
    "packages/db/repositories: sql.raw",
  ],
])("rejects %s with %s", async (filePath, code, prefix) => {
  const messages = await errors(filePath, code);
  expect(
    messages.some((m) => m.includes(prefix)),
    messages.join(" | "),
  ).toBe(true);
});

it.each([
  ["functions/provisioner/x.ts", 'import "@tc/aws";'],
  ["packages/aws/x.ts", 'import "@aws-sdk/client-lightsail";'],
  ["apps/web/x.ts", 'import "@aws-sdk/client-s3";'],
  ["packages/core/x.ts", 'import "@tc/db";'],
  ["packages/core/pricing/x.ts", 'import "big.js";'],
  ["functions/scheduler/x.ts", 'import "@tc/fn-reader";'],
  ["functions/provisioner/x.ts", 'await import("@tc/aws");'],
  ["apps/web/x.ts", 'await import("./chart");'],
  ["apps/web/x.ts", 'await import("@tc/awsome");'],
  ["packages/aws/x.ts", 'await import("@aws-sdk/client-lightsail");'],
  ["packages/core/naming/x.ts", 'import "../types";'],
  [
    "packages/core/pricing/x.test.ts",
    'const u = new URL("a.json", import.meta.url); await import(u.href, { with: { type: "json" } });',
  ],
  ["functions/reader/x.ts", 'const name = "x"; await import(name);'],
  ["packages/aws/x.ts", 'await import("@aws-sdk/client-sts");'],
  ["apps/web/x.test.ts", "await import(`./chart`);"],
  [
    "packages/aws/x.ts",
    'import { createRequire } from "node:module"; createRequire(import.meta.url)("x");',
  ],
  [
    "functions/reader/x.ts",
    'import { createRequire } from "node:module"; createRequire(import.meta.url)("x");',
  ],
  ["apps/web/x.test.ts", 'const n = "x"; await import(n);'],
  ["apps/web/x.ts", 'await import("@aws-sdk-helpers/x");'],
  ["packages/db/x.ts", 'import "drizzle-orm";'],
  ["packages/db/tx.ts", 'import { sql } from "drizzle-orm";\nsql.raw("set local role web_rw");'],
  ["packages/db/repositories/customer/x.ts", "export const t = String.raw`a\\b`;"],
  [
    "packages/aws/x.ts",
    'import { createRequire } from "node:module"; export const r = createRequire;',
  ],
  ["packages/aws/x.ts", 'import "@aws-sdk/credential-provider-node";'],
  ["packages/aws/x.ts", "const o = { log: 1 }; o.log = 2;"],
  ["packages/aws/x.test.ts", "console.log(1); export const x = { logger: 1 };"],
  ["functions/reader/x.ts", 'import "node:vm";'],
  ["functions/reader/x.ts", 'import "./a?x";'],
  ["packages/ui/x.ts", 'import "node:vm";'],
  ["packages/ui/x.ts", 'import "../node_modulesx/a";'],
  ["apps/web/x.ts", 'await import("./a-b");'],
  ["packages/core/x.ts", 'import { insertOperation } from "@tc/db";\nvoid insertOperation;'],
  [
    "functions/provisioner/x.ts",
    'import { enqueueOperation } from "@tc/core";\nvoid enqueueOperation;',
  ],
])("allows %s with %s", async (filePath, code) => {
  expect(await errors(filePath, code)).toEqual([]);
});

// W40a: every workspace folder except packages/aws, functions/* and pro/* gets the R1 error for @tc/aws.
// packages/core is pure logic and names @tc/aws in its own rule, so it gets that message.
const SCOPE_FOLDERS = Object.keys(readWorkspacePackages(".")).filter(
  // PRO-1: pro/* is the single-EC2 worker, a backend that runs the functions/ handlers (docs/pro/single-ec2-plan.md).
  (dir) => dir !== "packages/aws" && !dir.startsWith("functions/") && !dir.startsWith("pro/"),
);
it("the workspace has apps and packages to test the scope with", () => {
  expect(SCOPE_FOLDERS).toEqual(expect.arrayContaining(["apps/web", "apps/admin", "packages/db"]));
});
it.each(SCOPE_FOLDERS)("%s refuses an import of @tc/aws", async (dir) => {
  const messages = await errors(`${dir}/x.ts`, 'import "@tc/aws";');
  const expected = dir === "packages/core" ? "packages/core is pure logic:" : "R1:";
  expect(
    messages.some((m) => m.includes(expected)),
    messages.join(" | "),
  ).toBe(true);
});
it.each(Object.keys(readWorkspacePackages(".")).filter((dir) => dir.startsWith("functions/")))(
  "%s may import @tc/aws",
  async (dir) => {
    expect(await errors(`${dir}/x.ts`, 'import "@tc/aws";')).toEqual([]);
  },
);

// W40c: a walk over the source files of apps/ and packages/ (not git, so an untracked file counts).
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const SKIPPED = new Set(["node_modules", ".next", "dist", "coverage"]);
// Written by Next.js on dev and build, git-ignored, and holds only type references.
const GENERATED = new Set(["next-env.d.ts"]);
function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name)) found.push(...sourceFiles(path));
    } else if (SOURCE.test(entry.name) && !GENERATED.has(entry.name)) {
      found.push(path);
    }
  }
  return found;
}
it("no source file of apps/ or packages/ is ignored, and R1 is switched on for each (except packages/aws)", async () => {
  const files = [...sourceFiles("apps"), ...sourceFiles("packages")];
  expect(files.length).toBeGreaterThan(20);
  const problems = [];
  for (const file of files) {
    if (await eslint.isPathIgnored(file)) {
      problems.push(`${file}: ignored by ESLint`);
      continue;
    }
    if (file.startsWith("packages/aws/")) continue;
    const config = await eslint.calculateConfigForFile(file);
    const [severity, ...options] = config.rules["no-restricted-imports"] ?? [0];
    const groups = options.flatMap((o) => o.patterns ?? []).flatMap((p) => p.group ?? []);
    if (!(severity === 2 || severity === "error") || !groups.includes("@tc/aws")) {
      problems.push(`${file}: the restriction on @tc/aws is not switched on`);
    }
  }
  expect(problems).toEqual([]);
});

// WPU-B4 (audit item 34): the timer globals are declared, so a bare setTimeout("...") is an implied eval.
it.each([
  ["apps/web/x.ts", 'setTimeout("run()", 10);'],
  ["packages/core/x.ts", 'setInterval("run()", 10);'],
  ["functions/reader/x.ts", 'setTimeout("run()", 10);'],
  ["scripts/x.mjs", 'setTimeout("run()", 10);'],
  ["packages/core/x.ts", 'globalThis.setTimeout("run()", 10);'],
])("%s: %s is an implied eval", async (filePath, code) => {
  expect(await errors(filePath, code)).toContain(
    "Implied eval. Consider passing a function instead of a string.",
  );
});

it("a timer with a function is not an implied eval", async () => {
  expect(await errors("apps/web/x.ts", "setTimeout(() => undefined, 10);")).toEqual([]);
});
