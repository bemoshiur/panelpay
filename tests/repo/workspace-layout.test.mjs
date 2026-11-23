import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { readWorkspacePackages } from "../../scripts/lib/changed-packages.mjs";

const packages = {
  "apps/web": "@tc/web",
  "apps/admin": "@tc/admin",
  "packages/core": "@tc/core",
  "packages/db": "@tc/db",
  "packages/aws": "@tc/aws",
  "packages/eps": "@tc/eps",
  "packages/notify": "@tc/notify",
  "packages/auth": "@tc/auth",
  "packages/ui": "@tc/ui",
  "functions/provisioner": "@tc/fn-provisioner",
  "functions/reader": "@tc/fn-reader",
  "functions/access-details": "@tc/fn-access-details",
  "functions/scheduler": "@tc/fn-scheduler",
  "functions/payments-sweeper": "@tc/fn-payments-sweeper",
  "functions/catalog-sync": "@tc/fn-catalog-sync",
  "functions/reconciler": "@tc/fn-reconciler",
  "functions/migrator": "@tc/fn-migrator",
  "functions/invoice-renderer": "@tc/fn-invoice-renderer",
  "functions/kyc-check": "@tc/fn-kyc-check",
  "functions/notifier": "@tc/fn-notifier",
  "functions/cognito-messages": "@tc/fn-cognito-messages",
  "pro/whmcs-bridge": "@tc/pro-whmcs-bridge",
  "pro/worker": "@tc/pro-worker",
};

// The shared form of a package's tsconfig.json (kit plan, Task 7). A package that needs more, for
// example "jsx" in a Next.js app, gets its difference here, so that it is reviewed with this file.
const tsconfigExtras = {
  "packages/ui": {
    compilerOptions: {
      allowImportingTsExtensions: true,
      erasableSyntaxOnly: true,
      verbatimModuleSyntax: true,
      jsx: "react-jsx",
      resolveJsonModule: true,
      types: ["node"],
    },
  },
  // Next.js rewrites the tsconfig of an app on `next dev` and `next build`; what it adds is pinned
  // here (WPU-T4). The app program loads the raw .ts sources of @tc/ui, so it allows the extension.
  "apps/web": {
    compilerOptions: { allowImportingTsExtensions: true, jsx: "react-jsx" },
  },
  "apps/admin": {
    compilerOptions: { allowImportingTsExtensions: true, jsx: "react-jsx" },
  },
};

// @tc/db also publishes its test helpers to the test files of other packages (WP1-T2).
const EXPORTS = {
  "packages/db": {
    ".": "./index.ts",
    "./buyer-rules": "./repositories/customer/buyer-rules.ts",
    "./links": "./links.ts",
    "./migrate": "./migrate.ts",
    // The pool account seed, for the migrator only; the apps may not import it (WPU-X4, review M1).
    "./seed-pool": "./seed-pool.ts",
    "./testing": "./testing/index.ts",
  },
  "packages/eps": { ".": "./index.ts", "./redirect": "./redirect.ts" },
  // "./capacity-worker": the release of capacity, worker code that the barrel no longer exports (WPU-B3).
  "packages/core": { ".": "./index.ts", "./capacity-worker": "./capacity/worker.ts" },
  // "./admin-ip": the pure allowlist functions, light enough for the proxy of the admin app (WP8-T1).
  // "./proxy": the session refresh and the pool config for proxy.ts of the customer app, which must
  // not load the database driver (WP2-T2).
  "packages/auth": {
    ".": "./index.ts",
    "./admin-ip": "./admin-ip.ts",
    "./proxy": "./proxy.ts",
    "./testing": "./testing/index.ts",
  },
  // @tc/ui also publishes the theme facts for the root layouts of both apps (WPU-T1).
  "packages/ui": {
    ".": "./index.ts",
    "./theme": "./theme/public.ts",
    "./runtime": "./runtime/index.ts",
    "./messages": "./messages/index.ts",
    "./gallery": "./gallery/index.ts",
    // The class inventory of the theme, for the mockup-anchors tests of the apps (WP3-T4).
    "./class-inventory": "./test/class-inventory.ts",
    // Is the paid Antler theme in this checkout? The tests that need it skip themselves (WPU-X30a).
    "./theme-present": "./theme/present.ts",
  },
};

it.each(Object.entries(packages))("%s is the private workspace package %s", (dir, name) => {
  const pkg = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
  expect(pkg.name).toBe(name);
  expect(pkg.private).toBe(true);
  expect(pkg.scripts.typecheck).toBe("tsc --noEmit");
  expect(existsSync(`${dir}/index.ts`), `${dir}/index.ts`).toBe(true);
  expect(existsSync(`${dir}/src`), `${dir}/src`).toBe(false);
  expect(pkg.exports).toEqual(EXPORTS[dir] ?? { ".": "./index.ts" });
  for (const target of Object.values(pkg.exports))
    expect(existsSync(`${dir}/${target}`), `${dir}/${target}`).toBe(true);
  expect(JSON.parse(readFileSync(`${dir}/tsconfig.json`, "utf8")), `${dir}/tsconfig.json`).toEqual({
    extends: "../../tsconfig.base.json",
    include: ["**/*.ts", "**/*.tsx"],
    exclude: ["node_modules", "dist", ".next", ".sst"],
    ...tsconfigExtras[dir],
  });
});

it("every workspace package on disk is in the table above, and every row is on disk", () => {
  const found = Object.keys(readWorkspacePackages("."));
  const listed = Object.keys(packages);
  const problems = [
    ...found
      .filter((dir) => !listed.includes(dir))
      .map(
        (dir) =>
          `${dir}: add it to the table of tests/repo/workspace-layout.test.mjs (spec section 5), with a typecheck script`,
      ),
    ...listed
      .filter((dir) => !found.includes(dir))
      .map((dir) => `${dir}: in the table but not a workspace package on disk`),
  ];
  expect(problems).toEqual([]);
});

it("the pricing engine is where the spec and the money rule file name it", () => {
  for (const file of [
    "packages/core/types.ts",
    "packages/core/pricing/quote.ts",
    "packages/core/pricing/index.ts",
  ]) {
    expect(existsSync(file), file).toBe(true);
  }
});

it("has the other folders of spec section 5", () => {
  for (const dir of [
    "infra/org",
    "tests/repo",
    "design/brand",
    "design/reference",
    "scripts/lib",
    "verify",
    "content",
    "docs/runbooks",
  ]) {
    expect(existsSync(dir), dir).toBe(true);
  }
});

// The mockup is the paid Antler theme; a public checkout has none (docs/theme.md). One that is there
// must have the layout of spec section 5.
it.skipIf(!existsSync("design/mockup"))("a design/mockup folder has its template folder", () => {
  expect(existsSync("design/mockup/template")).toBe(true);
});

it("no longer has mockup/ at the root", () => {
  expect(existsSync("mockup")).toBe(false);
});

// The places of workspace packages are named twice: WORKSPACE_FOLDERS (scripts/lib/changed-packages.mjs,
// which --quick and the graph test read) and the globs of pnpm-workspace.yaml (which pnpm installs).
// They must be the same four folders, so that no package is installed that the checks never read.
it("WORKSPACE_FOLDERS and the globs of pnpm-workspace.yaml name the same folders", () => {
  const source = readFileSync("scripts/lib/changed-packages.mjs", "utf8");
  const folders = /const WORKSPACE_FOLDERS = (\[[^\]]*\]);/.exec(source)?.[1];
  expect(folders).toBeDefined();
  expect(JSON.parse(folders)).toEqual(["apps", "packages", "functions", "pro"]);
  expect(parse(readFileSync("pnpm-workspace.yaml", "utf8")).packages).toEqual([
    "apps/*",
    "packages/*",
    "functions/*",
    "pro/*",
  ]);
});

// PRO-1 review: a workspace folder that the root Vitest config does not list has tests that CI never runs.
it("the root Vitest projects cover every workspace folder", () => {
  const config = readFileSync("vitest.config.mjs", "utf8");
  for (const glob of ["apps/*", "packages/*", "functions/*", "pro/*"]) {
    expect(config).toContain(`"${glob}",`);
  }
});

it("runs on the Node version pinned in .nvmrc", () => {
  const pinned = readFileSync(".nvmrc", "utf8").trim();
  expect(pinned).toMatch(/^24\.\d+\.\d+$/);
  expect(process.versions.node).toBe(pinned);
  const root = JSON.parse(readFileSync("package.json", "utf8"));
  expect(root.engines.node).toBe(">=24 <25");
  expect(root.packageManager).toMatch(/^pnpm@10\./);
});
