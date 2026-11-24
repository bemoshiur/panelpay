import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { URL, fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { awsSdkClients, awsSdkClientsFunctionsOnly } from "../../eslint.config.mjs";
import {
  boundaryProblems,
  readDirectLinks,
  readInstalledGraph,
} from "../../scripts/lib/installed-graph.mjs";

// R1: the web app and the admin app never import packages/aws, and only packages/aws depends on
// the six AWS packages (the five of section 4 and credential-providers, open point 17; aws-sdk of
// v2 is banned in the lint rules too). Three things are meant to keep that:
//   1. IAM: the roles of the apps get no permission to assume a pool role. That is the boundary.
//      It is built and proven in WP0-T5, not here, and it does not exist yet.
//   2. The lint rule on import statements (eslint.config.mjs).
//   3. This file. It catches accidents and makes a deliberate route visible in review. It is not
//      the boundary.
// Lint and this file are tripwires for accidents. They do not see: bridges outside the scanned
// folders (a file in infra/, scripts/ or a new workspace folder that re-exports packages/aws; the
// closure test, tests/repo/closure.test.mjs, covers the TypeScript programs of the apps and of the
// packages), committed symbolic links, other AWS packages that are not on the lists, aliased
// loaders, and calls that are not imports.
// This file does not guess what pnpm will do with a dependency value. It reads what the last full
// install recorded (scripts/lib/installed-graph.mjs):
//   - pnpm-lock.yaml: the package that every dependency of every project resolved to. The reader
//     checks that each dependency of each package.json is recorded with its value (or with the
//     value of an override of that very name), and it stops at every top-level key, setting,
//     dependency form and entry key that its rules do not list.
//   - node_modules/.pnpm/lock.yaml, pnpm's record of what the last full install recorded: its
//     projects must be those of pnpm-lock.yaml, and its third-party packages pass the same rules.
//     The reader stops when a second lockfile (pnpm-lock.<branch>.yaml) or a second install inside
//     a project exists.
//   - the node_modules folders that the code of an app or of the root loads from by name: the
//     root's, each app's, each folder between an app and the root, and the folder of each
//     workspace project that an app or the root reaches through its declared dependencies. Each
//     entry must lead to a package of pnpm's store or to a project that is not the root,
//     packages/aws or a function. The node_modules folders of the projects that no app and not the
//     root reaches are not read.
// What this file cannot see:
//   - a registry package that holds a copy of this code under another name;
//   - a third-party package that itself depends on one of the six: only that package can load it
//     by name, the code of an app cannot (@aws-sdk/rds-signer, for example, depends on
//     @aws-sdk/credential-providers);
//   - a link made by hand deep inside pnpm's store, and a real folder (not a link) put into
//     node_modules by hand;
//   - a lockfile edited by hand in a way the rules of the reader do not check;
//   - settings that move node_modules or the lockfile (modulesDir, virtualStoreDir, lockfileDir):
//     the reader reads the standard places; and a node_modules folder above the repository;
//   - what a bundler setting or a tsconfig path pulls in; an import of a path computed at run time;
//   - the folder node_modules/.pnpm/node_modules, into which pnpm links every workspace package by
//     default and from which only installed third-party packages load;
//   - a lifecycle script is forbidden in every workspace package.json (tests/repo/wiring.test.mjs),
//     so a postinstall cannot link packages/aws into a package after an install.

// Part 1: the repository itself.
const SDK = awsSdkClients;
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const { packages, graph } = readInstalledGraph(ROOT);
const problems = boundaryProblems(ROOT, SDK);

it("client-sesv2 (WPU-D4) is the one AWS client that only functions/ may import, and it is banned for apps/ and packages/", () => {
  expect(awsSdkClientsFunctionsOnly).toEqual(["@aws-sdk/client-sesv2"]);
  expect(readFileSync("eslint.config.mjs", "utf8")).toContain("SDK_FUNCTIONS_ONLY");
});

it("the banned AWS packages are the six AWS packages (five of section 4 and credential-providers, open point 17) and aws-sdk of the lint config", () => {
  expect([...awsSdkClients].sort()).toEqual([
    "@aws-sdk/client-cost-explorer",
    "@aws-sdk/client-lightsail",
    "@aws-sdk/client-route-53",
    "@aws-sdk/client-route-53-domains",
    "@aws-sdk/client-sts",
    "@aws-sdk/credential-providers",
    "aws-sdk",
  ]);
});

it("only a project under functions/ depends on packages/aws (R1)", () => {
  expect(packages["packages/aws"]).toBeDefined();
  expect(problems.awsUsers).toEqual([]);
});

it("only packages/aws depends on the AWS packages of section 4", () => {
  expect(graph[packages["packages/aws"]].some((d) => SDK.includes(d))).toBe(true);
  expect(problems.sdkUsers).toEqual([]);
});

it("an app or the root cannot reach packages/aws, a function or an AWS package of section 4 through what is declared (R1)", () => {
  expect(Object.keys(packages)).toEqual(expect.arrayContaining(["apps/web", "apps/admin"]));
  expect(problems.reach).toEqual([]);
});

// When this fails: a hoisting setting of pnpm (shamefullyHoist, publicHoistPattern), a dependency
// of the root package, or a link made by hand lets an app import the package without declaring
// it; or node_modules is older than pnpm-lock.yaml (run pnpm install). With nodeLinker: hoisted
// the root holds real folders instead of links, and each one is reported.
it("nothing in node_modules of the root, of an app or between leads to packages/aws, a function or an AWS package of section 4 (R1)", () => {
  expect(readDirectLinks(ROOT, ".").map((link) => link.name)).toContain("vitest");
  expect(problems.installed).toEqual([]);
});

// Part 2 and Part 3 write small workspaces into a temporary folder.
const TMP = mkdtempSync(join(tmpdir(), "tc-graph-"));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));
let workspaces = 0;

// Writes a workspace: `manifests` maps a project folder ("." is the root) to its package.json
// (an object, or a string written as it is); `lock` is the text of pnpm-lock.yaml (none if null).
// node_modules/.pnpm/lock.yaml, pnpm's record of the install, gets the same text unless
// `installed` says otherwise (null: none). `files` adds more files, `links` symbolic links
// ({ path: target }), `folders` empty folders.
function workspace(
  manifests,
  lock,
  { installed = lock, files = {}, links = {}, folders = [] } = {},
) {
  workspaces += 1;
  const root = join(TMP, `ws${workspaces}`);
  const all = Object.fromEntries(
    Object.entries(manifests).map(([dir, manifest]) => [
      dir === "." ? "package.json" : `${dir}/package.json`,
      typeof manifest === "string" ? manifest : JSON.stringify(manifest),
    ]),
  );
  if (lock !== null) all["pnpm-lock.yaml"] = lock;
  if (installed !== null) all["node_modules/.pnpm/lock.yaml"] = installed;
  Object.assign(all, files);
  mkdirSync(root, { recursive: true });
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  for (const folder of folders) mkdirSync(join(root, folder), { recursive: true });
  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    symlinkSync(target, join(root, path), "dir");
  }
  return root;
}

const HEAD = `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
`;
const ROOT_PKG = { name: "panelpay-platform" };
const WEB = { name: "@tc/web" };
// The checksum is not checked by the reader; every fixture uses this one of ms@2.1.3.
const SUM =
  "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==";
const MS_ONLY = `
packages:

  ms@2.1.3:
    resolution: {integrity: ${SUM}}

snapshots:

  ms@2.1.3: {}
`;
const webLock = (lockDeps, rest = MS_ONLY, top = "") => `${HEAD}${top}
importers:

  .: {}

  apps/web:
    dependencies:
${lockDeps}
${rest}`;
const webDepends = (deps, lockDeps, rest = MS_ONLY, options = {}) =>
  workspace(
    { ".": ROOT_PKG, "apps/web": { ...WEB, dependencies: deps } },
    webLock(lockDeps, rest),
    options,
  );
const MS_DEP = `      ms:
        specifier: 2.1.3
        version: 2.1.3`;
const DEBUG_DEP = `      debug:
        specifier: 4.4.3
        version: 4.4.3`;
// debug@4.4.3 with its dependency ms; `ms` is the form of that dependency in the snapshot.
const debugWith = (ms = "2.1.3", msPackage = `resolution: {integrity: ${SUM}}`) => `
packages:

  debug@4.4.3:
    resolution: {integrity: ${SUM}}
    engines: {node: '>=6.0'}

  ms@2.1.3:
    ${msPackage}

snapshots:

  debug@4.4.3:
    dependencies:
      ms: ${ms}

  ms@2.1.3: {}
`;

describe("readInstalledGraph gives the graph that pnpm resolved", () => {
  it("G1: workspace:* resolves to the linked project", () => {
    const root = workspace(
      {
        ".": ROOT_PKG,
        "apps/web": { ...WEB, dependencies: { "@tc/core": "workspace:*" } },
        "packages/core": { name: "@tc/core" },
      },
      `${HEAD}
importers:

  .: {}

  apps/web:
    dependencies:
      '@tc/core':
        specifier: workspace:*
        version: link:../../packages/core

  packages/core: {}
`,
    );
    expect(readInstalledGraph(root)).toEqual({
      packages: { ".": "panelpay-platform", "apps/web": "@tc/web", "packages/core": "@tc/core" },
      graph: { "panelpay-platform": [], "@tc/web": ["@tc/core"], "@tc/core": [] },
    });
  });

  it("G2: a bare path gives the name of the linked project, not the key", () => {
    const root = workspace(
      {
        ".": ROOT_PKG,
        "apps/web": { ...WEB, dependencies: { x: "../../packages/aws" } },
        "packages/aws": { name: "@tc/aws" },
      },
      `${HEAD}
importers:

  .: {}

  apps/web:
    dependencies:
      x:
        specifier: ../../packages/aws
        version: link:../../packages/aws

  packages/aws: {}
`,
    );
    expect(readInstalledGraph(root).graph["@tc/web"]).toEqual(["@tc/aws"]);
  });

  it("G3: an unscoped workspace alias gives the name of the function it links", () => {
    const root = workspace(
      {
        ".": ROOT_PKG,
        "apps/web": { ...WEB, dependencies: { x: "workspace:legacy-reader@*" } },
        "functions/legacy": { name: "legacy-reader" },
      },
      `${HEAD}
importers:

  .: {}

  apps/web:
    dependencies:
      x:
        specifier: workspace:legacy-reader@*
        version: link:../../functions/legacy

  functions/legacy: {}
`,
    );
    expect(readInstalledGraph(root).graph["@tc/web"]).toEqual(["legacy-reader"]);
  });

  it("G4: a dependency of the root is linked from the folder of the root", () => {
    const root = workspace(
      {
        ".": { ...ROOT_PKG, devDependencies: { "@tc/aws": "workspace:*" } },
        "packages/aws": { name: "@tc/aws" },
      },
      `${HEAD}
importers:

  .:
    devDependencies:
      '@tc/aws':
        specifier: workspace:*
        version: link:packages/aws

  packages/aws: {}
`,
    );
    expect(readInstalledGraph(root).graph["panelpay-platform"]).toEqual(["@tc/aws"]);
  });

  it("G5: a registry version gives the key, an alias gives the name of the package", () => {
    const root = webDepends(
      { ms: "2.1.3", sv: "npm:semver@7.8.6" },
      `${MS_DEP}
      sv:
        specifier: npm:semver@7.8.6
        version: semver@7.8.6`,
      `
packages:

  ms@2.1.3:
    resolution: {integrity: ${SUM}}

  semver@7.8.6:
    resolution: {integrity: ${SUM}}
    engines: {node: '>=10'}
    hasBin: true

snapshots:

  ms@2.1.3: {}

  semver@7.8.6: {}
`,
    );
    expect(readInstalledGraph(root).graph["@tc/web"]).toEqual(["ms", "semver"]);
  });

  it("G6: a version with a peer suffix, and one with nested parentheses", () => {
    const root = webDepends(
      { next: "16.0.0-canary.1", "react-dom": "19.1.0", react: "19.1.0" },
      `      next:
        specifier: 16.0.0-canary.1
        version: 16.0.0-canary.1(react-dom@19.1.0(react@19.1.0))(react@19.1.0)
      react:
        specifier: 19.1.0
        version: 19.1.0
      react-dom:
        specifier: 19.1.0
        version: 19.1.0(react@19.1.0)`,
      `
packages:

  next@16.0.0-canary.1:
    resolution: {integrity: ${SUM}}
    peerDependencies:
      react: ^18.2.0 || ^19.0.0
      react-dom: ^18.2.0 || ^19.0.0

  react-dom@19.1.0:
    resolution: {integrity: ${SUM}}
    peerDependencies:
      react: ^19.1.0

  react@19.1.0:
    resolution: {integrity: ${SUM}}

  scheduler@0.26.0:
    resolution: {integrity: ${SUM}}

snapshots:

  next@16.0.0-canary.1(react-dom@19.1.0(react@19.1.0))(react@19.1.0):
    dependencies:
      react: 19.1.0
      react-dom: 19.1.0(react@19.1.0)

  react-dom@19.1.0(react@19.1.0):
    dependencies:
      react: 19.1.0
      scheduler: 0.26.0

  react@19.1.0: {}

  scheduler@0.26.0: {}
`,
    );
    expect(readInstalledGraph(root).graph["@tc/web"]).toEqual(["next", "react", "react-dom"]);
  });

  const coreWith = (manifest, importer, rest = MS_ONLY, top = "") =>
    workspace(
      { ".": ROOT_PKG, "packages/core": { name: "@tc/core", ...manifest } },
      `${HEAD}${top}
importers:

  .: {}

  packages/core:
${importer}
${rest}`,
    );
  const coreRecords = (group, specifier) => `    ${group}:
      ms:
        specifier: ${specifier}
        version: 2.1.3`;

  it("G7: a key in dependencies and devDependencies is recorded under dependencies only", () => {
    const root = coreWith(
      { dependencies: { ms: "2.1.3" }, devDependencies: { ms: "2.1.3" } },
      coreRecords("dependencies", "2.1.3"),
    );
    expect(readInstalledGraph(root).graph["@tc/core"]).toEqual(["ms"]);
  });

  it("G8: a key in dependencies and optionalDependencies is recorded under optionalDependencies only", () => {
    const root = coreWith(
      { dependencies: { ms: "2.1.3" }, optionalDependencies: { ms: "2.1.3" } },
      coreRecords("optionalDependencies", "2.1.3"),
      `
packages:

  ms@2.1.3:
    resolution: {integrity: ${SUM}}

snapshots:

  ms@2.1.3:
    optional: true
`,
    );
    expect(readInstalledGraph(root).graph["@tc/core"]).toEqual(["ms"]);
  });

  it("G9: a key only in peerDependencies is recorded under dependencies with the peer value", () => {
    const root = coreWith(
      { peerDependencies: { ms: "^2.1.0" } },
      coreRecords("dependencies", "^2.1.0"),
    );
    expect(readInstalledGraph(root).graph["@tc/core"]).toEqual(["ms"]);
  });

  it("G9: a peer key that devDependencies also declares is recorded under devDependencies only", () => {
    const root = coreWith(
      { peerDependencies: { ms: "^2.1.0" }, devDependencies: { ms: "2.1.3" } },
      coreRecords("devDependencies", "2.1.3"),
    );
    expect(readInstalledGraph(root).graph["@tc/core"]).toEqual(["ms"]);
  });

  it("G10: an override that pins a direct dependency replaces its specifier", () => {
    const root = coreWith(
      { dependencies: { ms: "^2.0.0" } },
      coreRecords("dependencies", "2.1.3"),
      MS_ONLY,
      "\noverrides:\n  ms: 2.1.3\n",
    );
    expect(readInstalledGraph(root).graph["@tc/core"]).toEqual(["ms"]);
  });

  it("G10: an override in the form pnpm audit --fix writes (a range with >= in the selector)", () => {
    const root = coreWith(
      { dependencies: { ms: "~2.1.0" } },
      coreRecords("dependencies", "'>=2.1.3'"),
      MS_ONLY,
      "\noverrides:\n  ms@>=2.0.0 <2.1.3: '>=2.1.3'\n",
    );
    expect(readInstalledGraph(root).graph["@tc/core"]).toEqual(["ms"]);
  });

  it("G11: catalog: with the catalogs of the lockfile", () => {
    const root = coreWith(
      { dependencies: { ms: "catalog:" } },
      coreRecords("dependencies", "'catalog:'"),
      MS_ONLY,
      "\ncatalogs:\n  default:\n    ms:\n      specifier: 2.1.3\n      version: 2.1.3\n",
    );
    expect(readInstalledGraph(root).graph["@tc/core"]).toEqual(["ms"]);
  });

  it("G12: a lockfile without third-party packages has no packages and no snapshots", () => {
    const root = workspace(
      {
        ".": ROOT_PKG,
        "packages/aws": { name: "@tc/aws" },
        "functions/reader": { name: "@tc/fn-reader", dependencies: { "@tc/aws": "workspace:*" } },
      },
      `${HEAD}
importers:

  .: {}

  functions/reader:
    dependencies:
      '@tc/aws':
        specifier: workspace:*
        version: link:../../packages/aws

  packages/aws: {}
`,
    );
    expect(readInstalledGraph(root).graph).toEqual({
      "panelpay-platform": [],
      "@tc/fn-reader": ["@tc/aws"],
      "@tc/aws": [],
    });
  });

  it.each([
    [
      "packageExtensionsChecksum",
      "\npackageExtensionsChecksum: sha256-h691be5C9QH26488dz6KPVotM8orA9uPKoH82Cil878=\n",
    ],
    ["ignoredOptionalDependencies", "\nignoredOptionalDependencies:\n  - fsevents\n"],
    ["time", "\ntime:\n  ms@2.1.3: '2021-12-14T06:22:38.787Z'\n"],
  ])("G13: the top-level key %s of an ordinary form is accepted", (_, top) => {
    const root = webDepends({ ms: "2.1.3" }, MS_DEP);
    const text = webLock(MS_DEP, MS_ONLY, top);
    writeFileSync(join(root, "pnpm-lock.yaml"), text);
    writeFileSync(join(root, "node_modules/.pnpm/lock.yaml"), text);
    expect(readInstalledGraph(root).graph["@tc/web"]).toEqual(["ms"]);
  });
});

describe("readInstalledGraph stops at what it does not understand", () => {
  const msLock = (top = "") => webLock(MS_DEP, MS_ONLY, top);
  const msWeb = (lock, options) =>
    workspace(
      { ".": ROOT_PKG, "apps/web": { ...WEB, dependencies: { ms: "2.1.3" } } },
      lock,
      options,
    );

  it("the honest form of these stop rows passes", () => {
    expect(readInstalledGraph(msWeb(msLock())).graph["@tc/web"]).toEqual(["ms"]);
  });

  it("S1: no lockfile, a lockfile that is not YAML, a lockfile of another version", () => {
    expect(() => readInstalledGraph(msWeb(null))).toThrow(
      /^installed-graph: pnpm-lock\.yaml is missing$/,
    );
    expect(() => readInstalledGraph(msWeb("lockfileVersion: [\n"))).toThrow(
      /pnpm-lock\.yaml cannot be read as YAML/,
    );
    expect(() =>
      readInstalledGraph(
        msWeb(msLock().replace("lockfileVersion: '9.0'", "lockfileVersion: '6.0'")),
      ),
    ).toThrow(/pnpm-lock\.yaml is not lockfile version 9\.0/);
  });

  it("S1: a YAML warning stops the reader and nothing is written to stderr", () => {
    const warn = vi.spyOn(globalThis.console, "warn");
    const emit = vi.spyOn(process, "emitWarning");
    const stderr = vi.spyOn(process.stderr, "write");
    const root = msWeb(msLock().replace("lockfileVersion: '9.0'", "lockfileVersion: !x '9.0'"));
    try {
      expect(() => readInstalledGraph(root)).toThrow(/pnpm-lock\.yaml cannot be read as YAML/);
      expect([warn.mock.calls, emit.mock.calls, stderr.mock.calls]).toEqual([[], [], []]);
    } finally {
      warn.mockRestore();
      emit.mockRestore();
      stderr.mockRestore();
    }
  });

  it("S1: a file with two YAML documents stops the reader", () => {
    expect(() => readInstalledGraph(msWeb(`${msLock()}\n---\n${msLock()}`))).toThrow(
      /pnpm-lock\.yaml cannot be read as YAML/,
    );
  });

  it.each([
    ["at the top", "\n<<: {futureKey: true}\n"],
    ["in a snapshot", ""],
  ])("S1: a YAML merge key %s stops the reader", (where, top) => {
    const lock =
      where === "in a snapshot"
        ? webLock(
            DEBUG_DEP,
            debugWith("2.1.3").replace(
              "    dependencies:\n      ms: 2.1.3",
              "    <<: {dependencies: {ms: 'link:packages/aws'}}",
            ),
          )
        : msLock(top);
    const root = workspace(
      {
        ".": ROOT_PKG,
        "apps/web": {
          ...WEB,
          dependencies: where === "in a snapshot" ? { debug: "4.4.3" } : { ms: "2.1.3" },
        },
      },
      lock,
    );
    expect(() => readInstalledGraph(root)).toThrow(/pnpm-lock\.yaml holds a YAML merge key \(<<\)/);
  });

  it.each([
    [
      "pnpmfileChecksum",
      "\npnpmfileChecksum: sha256-8c9KmV0nkci08FyUjvW1jv3MLN9AWoYA3aRKGMkDcZc=\n",
    ],
    [
      "patchedDependencies",
      "\npatchedDependencies:\n  ms@2.1.3:\n    hash: 7962a522d9b80d07dae3a7cbff1bc47837a795f4fb9a738d756f090640c58d95\n    path: patches/ms@2.1.3.patch\n",
    ],
  ])("S2: the top-level key %s stops the reader and says what to do", (key, top) => {
    expect(() => readInstalledGraph(msWeb(msLock(top)))).toThrow(
      new RegExp(
        `pnpm-lock\\.yaml has the key "${key}": read what the patch or the hook changes, then teach scripts/lib/installed-graph\\.mjs the key`,
      ),
    );
  });

  it("S2: an unknown top-level key stops the reader", () => {
    expect(() => readInstalledGraph(msWeb(msLock("\nfutureKey: true\n")))).toThrow(
      /pnpm-lock\.yaml has the key "futureKey", which this file does not understand/,
    );
  });

  it.each([
    ["packageExtensionsChecksum", "\npackageExtensionsChecksum: md5-abc\n"],
    ["ignoredOptionalDependencies", "\nignoredOptionalDependencies: fsevents\n"],
    ["time", "\ntime:\n  - ms@2.1.3\n"],
  ])("S2: the key %s of another form stops the reader", (key, top) => {
    expect(() => readInstalledGraph(msWeb(msLock(top)))).toThrow(
      new RegExp(`pnpm-lock\\.yaml has a key "${key}" of an unknown form`),
    );
  });

  it.each([
    [
      "excludeLinksFromLockfile: true",
      (lock) => lock.replace("excludeLinksFromLockfile: false", "excludeLinksFromLockfile: true"),
      "missing: none; unexpected: none; another value: excludeLinksFromLockfile",
    ],
    [
      "autoInstallPeers: false",
      (lock) => lock.replace("autoInstallPeers: true", "autoInstallPeers: false"),
      "missing: none; unexpected: none; another value: autoInstallPeers",
    ],
    [
      "a third setting",
      (lock) =>
        lock.replace(
          "excludeLinksFromLockfile: false",
          "excludeLinksFromLockfile: false\n  injectWorkspacePackages: true",
        ),
      "missing: none; unexpected: injectWorkspacePackages; another value: none",
    ],
    [
      "a missing setting",
      (lock) => lock.replace("  autoInstallPeers: true\n", ""),
      "missing: autoInstallPeers; unexpected: none; another value: none",
    ],
  ])("S3: the settings stop the reader and are named: %s", (_, change, names) => {
    expect(() => readInstalledGraph(msWeb(change(msLock())))).toThrow(
      `the settings of pnpm-lock.yaml are not autoInstallPeers: true and excludeLinksFromLockfile: false (${names})`,
    );
  });

  it("S4: an importer that is no project on disk, a project on disk with no importer", () => {
    const bridge = workspace(
      { ".": ROOT_PKG, "apps/web": { ...WEB, dependencies: { "@tc/bridge": "workspace:*" } } },
      `${HEAD}
importers:

  .: {}

  apps/web:
    dependencies:
      '@tc/bridge':
        specifier: workspace:*
        version: link:../../tools/bridge

  tools/bridge: {}
`,
    );
    expect(() => readInstalledGraph(bridge)).toThrow(
      /only in the lockfile: tools\/bridge; only on disk: none\); if a folder is a new place for workspace packages, add it to WORKSPACE_FOLDERS in scripts\/lib\/changed-packages\.mjs/,
    );
    const onlyRoot = workspace(
      { ".": ROOT_PKG, "apps/web": WEB },
      `${HEAD}\nimporters:\n\n  .: {}\n`,
    );
    expect(() => readInstalledGraph(onlyRoot)).toThrow(
      /only in the lockfile: none; only on disk: apps\/web\); run pnpm install first$/,
    );
    // a package added to or removed from apps/, packages/ or functions/ before pnpm install: the
    // advice is to install, not to edit WORKSPACE_FOLDERS
    const removed = workspace(
      { ".": ROOT_PKG, "apps/web": WEB },
      `${HEAD}\nimporters:\n\n  .: {}\n\n  apps/web: {}\n\n  packages/gone: {}\n`,
    );
    const messageOf = (dir) => {
      try {
        readInstalledGraph(dir);
      } catch (error) {
        return error.message;
      }
      return "";
    };
    expect(messageOf(removed)).toMatch(/only in the lockfile: packages\/gone; only on disk: none/);
    expect(messageOf(removed)).toMatch(/run pnpm install first$/);
    expect(messageOf(removed)).not.toMatch(/WORKSPACE_FOLDERS/);
    expect(messageOf(onlyRoot)).not.toMatch(/WORKSPACE_FOLDERS/);
  });

  it("S5: a project without a name, with a name of another form, two projects with the same name", () => {
    const lockOf = (dir) => `${HEAD}\nimporters:\n\n  .: {}\n\n  apps/web: {}\n\n  ${dir}: {}\n`;
    const anon = workspace(
      { ".": ROOT_PKG, "apps/web": WEB, "packages/anon": { version: "1.0.0" } },
      lockOf("packages/anon"),
    );
    expect(() => readInstalledGraph(anon)).toThrow(
      /packages\/anon\/package\.json has no valid name/,
    );
    const odd = workspace(
      { ".": ROOT_PKG, "apps/web": WEB, "packages/odd": { name: "Odd_Name" } },
      lockOf("packages/odd"),
    );
    expect(() => readInstalledGraph(odd)).toThrow(/packages\/odd\/package\.json has no valid name/);
    const twice = workspace(
      { ".": ROOT_PKG, "apps/web": WEB, "packages/zz": { name: "@tc/web", version: "0.0.1" } },
      lockOf("packages/zz"),
    );
    expect(() => readInstalledGraph(twice)).toThrow(/two projects share the name @tc\/web/);
  });

  it("S6: an importer with dependenciesMeta, an importer with publishDirectory", () => {
    const meta = workspace(
      {
        ".": ROOT_PKG,
        "apps/web": {
          ...WEB,
          dependencies: { "@tc/aws": "workspace:*" },
          dependenciesMeta: { "@tc/aws": { injected: true } },
        },
        "packages/aws": { name: "@tc/aws" },
      },
      `${HEAD}
importers:

  .: {}

  apps/web:
    dependencies:
      '@tc/aws':
        specifier: workspace:*
        version: file:packages/aws
    dependenciesMeta:
      '@tc/aws':
        injected: true

  packages/aws: {}
`,
    );
    expect(() => readInstalledGraph(meta)).toThrow(
      /apps\/web: pnpm-lock\.yaml has "dependenciesMeta" for this project/,
    );
    const publish = workspace(
      {
        ".": ROOT_PKG,
        "apps/web": { ...WEB, dependencies: { "@tc/core": "workspace:*" } },
        "packages/aws": { name: "@tc/aws" },
        "packages/core": {
          name: "@tc/core",
          publishConfig: { directory: "../aws", linkDirectory: true },
        },
      },
      `${HEAD}
importers:

  .: {}

  apps/web:
    dependencies:
      '@tc/core':
        specifier: workspace:*
        version: link:../../packages/aws

  packages/aws: {}

  packages/core:
    publishDirectory: ../aws
`,
    );
    expect(() => readInstalledGraph(publish)).toThrow(
      /packages\/core: pnpm-lock\.yaml has "publishDirectory" for this project/,
    );
  });

  it("S7: the lockfile is not the lockfile of these package.json files", () => {
    const record = (group, specifier) =>
      `  ${group}:\n      ms:\n        specifier: ${specifier}\n        version: 2.1.3`;
    const lockWith = (importer) => `${HEAD}
importers:

  .: {}

  apps/web:
  ${importer}
${MS_ONLY}`;
    const web = (manifest, importer) =>
      workspace({ ".": ROOT_PKG, "apps/web": { ...WEB, ...manifest } }, lockWith(importer));
    const differs = web({ dependencies: { ms: "^2.1.0" } }, record("dependencies", "2.1.3"));
    expect(() => readInstalledGraph(differs)).toThrow(
      /apps\/web: ms in dependencies is not what pnpm-lock\.yaml records; run pnpm install/,
    );
    const lacks = workspace(
      { ".": ROOT_PKG, "apps/web": { ...WEB, dependencies: { ms: "2.1.3" } } },
      `${HEAD}\nimporters:\n\n  .: {}\n\n  apps/web: {}\n`,
    );
    expect(() => readInstalledGraph(lacks)).toThrow(
      /apps\/web: ms in dependencies is not what pnpm-lock\.yaml records/,
    );
    const extra = web({}, record("dependencies", "2.1.3"));
    expect(() => readInstalledGraph(extra)).toThrow(
      /apps\/web: pnpm-lock\.yaml records ms in dependencies, where package\.json does not declare it/,
    );
    const otherGroup = web({ dependencies: { ms: "2.1.3" } }, record("devDependencies", "2.1.3"));
    expect(() => readInstalledGraph(otherGroup)).toThrow(
      /apps\/web: ms in dependencies is not what pnpm-lock\.yaml records/,
    );
  });

  it.each([
    ["an override with a parent (debug>ms)", "debug>ms"],
    ["an override of another key", "left-pad"],
    ["an override for a child of ms (ms@2>debug)", "ms@2>debug"],
  ])("S7: %s does not excuse the specifier of a direct dependency", (_, selector) => {
    const root = workspace(
      { ".": ROOT_PKG, "apps/web": { ...WEB, dependencies: { ms: "^2.0.0" } } },
      msLock(`\noverrides:\n  ${selector}: 2.1.3\n`),
    );
    expect(() => readInstalledGraph(root)).toThrow(
      /apps\/web: ms in dependencies is not what pnpm-lock\.yaml records/,
    );
  });

  it("S7: a key of the lockfile named like a property of Object.prototype is still reported", () => {
    const root = workspace(
      { ".": ROOT_PKG, "apps/web": WEB },
      webLock("      constructor:\n        specifier: 1.0.0\n        version: 1.0.0", ""),
    );
    expect(() => readInstalledGraph(root)).toThrow(
      /apps\/web: pnpm-lock\.yaml records constructor in dependencies, where package\.json does not declare it/,
    );
  });

  it.each([
    ["to the root", "panelpay-platform", "workspace:*", "link:../.."],
    ["to a folder that is no project", "x", "link:../../packages", "link:../../packages"],
    ["out of the repository", "x", "link:../../../x", "link:../../../x"],
    ["to a folder named constructor", "x", "link:../../constructor", "link:../../constructor"],
    ["to a folder named toString", "x", "link:../../toString", "link:../../toString"],
  ])("S8: a link %s stops the reader", (_, key, specifier, version) => {
    const root = workspace(
      {
        ".": ROOT_PKG,
        "apps/web": { ...WEB, dependencies: { [key]: specifier } },
        "packages/aws": { name: "@tc/aws" },
      },
      `${HEAD}
importers:

  .: {}

  apps/web:
    dependencies:
      ${key}:
        specifier: ${specifier}
        version: ${version}

  packages/aws: {}
`,
    );
    expect(() => readInstalledGraph(root)).toThrow(
      new RegExp(
        `apps/web: ${key} is linked to a folder that is not a package under apps/, packages/ or functions/`,
      ),
    );
  });

  it("S9: file:, a local tarball and a URL stop the reader", () => {
    const injected = workspace(
      {
        ".": ROOT_PKG,
        "apps/web": { ...WEB, dependencies: { "@tc/aws": "workspace:*" } },
        "packages/aws": { name: "@tc/aws" },
      },
      `${HEAD}
importers:

  .: {}

  apps/web:
    dependencies:
      '@tc/aws':
        specifier: workspace:*
        version: file:packages/aws

  packages/aws: {}
`,
    );
    expect(() => readInstalledGraph(injected)).toThrow(
      /apps\/web: @tc\/aws is resolved in a form this file does not understand/,
    );
    const tarball = webDepends(
      { x: "my aws.tgz" },
      `      x:
        specifier: my aws.tgz
        version: '@tc/aws@file:apps/web/my aws.tgz'`,
      `
packages:

  '@tc/aws@file:apps/web/my aws.tgz':
    resolution: {integrity: ${SUM}, tarball: file:apps/web/my aws.tgz}
    version: 0.0.0

snapshots:

  '@tc/aws@file:apps/web/my aws.tgz': {}
`,
    );
    expect(() => readInstalledGraph(tarball)).toThrow(
      /apps\/web: x is resolved in a form this file does not understand/,
    );
    const url = webDepends(
      { ms: "github:vercel/ms#2.1.3" },
      `      ms:
        specifier: github:vercel/ms#2.1.3
        version: https://codeload.github.com/vercel/ms/tar.gz/1c6264b795492e8fdecbc82cb8802fcfbfc08d26`,
      `
packages:

  ms@https://codeload.github.com/vercel/ms/tar.gz/1c6264b795492e8fdecbc82cb8802fcfbfc08d26:
    resolution: {tarball: https://codeload.github.com/vercel/ms/tar.gz/1c6264b795492e8fdecbc82cb8802fcfbfc08d26}
    version: 2.1.3

snapshots:

  ms@https://codeload.github.com/vercel/ms/tar.gz/1c6264b795492e8fdecbc82cb8802fcfbfc08d26: {}
`,
    );
    expect(() => readInstalledGraph(url)).toThrow(
      /apps\/web: ms is resolved in a form this file does not understand/,
    );
  });

  it("S10: a registry version without its snapshot, or without its package entry", () => {
    const noSnapshot = webDepends(
      { ms: "2.1.3" },
      MS_DEP,
      `\npackages:\n\n  ms@2.1.3:\n    resolution: {integrity: ${SUM}}\n`,
    );
    expect(() => readInstalledGraph(noSnapshot)).toThrow(
      /apps\/web: ms is resolved in a form this file does not understand/,
    );
    const noPackage = webDepends({ ms: "2.1.3" }, MS_DEP, `\nsnapshots:\n\n  ms@2.1.3: {}\n`);
    expect(() => readInstalledGraph(noPackage)).toThrow(
      /apps\/web: ms is resolved in a form this file does not understand/,
    );
  });

  it.each([
    [
      "an alias whose name is not of the usual form",
      "npm:Odd_Name@2.1.3",
      "Odd_Name@2.1.3",
      "Odd_Name@2.1.3",
    ],
    ["unbalanced parentheses", "2.1.3", "2.1.3(a@1.0.0", "ms@2.1.3(a@1.0.0"],
    ["a closing parenthesis first", "2.1.3", "2.1.3)(a@1.0.0", "ms@2.1.3)(a@1.0.0"],
    ["a base with an empty prerelease", "1.0.0-", "1.0.0-", "ms@1.0.0-"],
    ["a base with two parts", "1.0", "1.0", "ms@1.0"],
  ])("S10: %s stops the reader", (_, specifier, version, id) => {
    const root = webDepends(
      { ms: specifier },
      `      ms:\n        specifier: '${specifier}'\n        version: '${version}'`,
      `
packages:

  '${id.replace(/\(.*$|\).*$/, "")}':
    resolution: {integrity: ${SUM}}

snapshots:

  '${id}': {}
`,
    );
    expect(() => readInstalledGraph(root)).toThrow(
      /apps\/web: ms is resolved in a form this file does not understand/,
    );
  });

  describe("S11: a package entry that is not resolved by integrity alone", () => {
    const resolutions = [
      ["a directory", "{directory: packages/aws, type: directory}"],
      ["a tarball next to the checksum", `{integrity: ${SUM}, tarball: file:evil.tgz}`],
      ["a checksum that is not a string", "{integrity: 5}"],
    ];
    it.each(resolutions)("%s, as a dependency of an app", (_, resolution) => {
      const root = webDepends(
        { ms: "2.1.3" },
        MS_DEP,
        `\npackages:\n\n  ms@2.1.3:\n    resolution: ${resolution}\n\nsnapshots:\n\n  ms@2.1.3: {}\n`,
      );
      expect(() => readInstalledGraph(root)).toThrow(
        /apps\/web: ms is resolved in a form this file does not understand/,
      );
    });
    it.each(resolutions)("%s, as a dependency of a third-party package", (_, resolution) => {
      const root = webDepends(
        { debug: "4.4.3" },
        DEBUG_DEP,
        debugWith("2.1.3", `resolution: ${resolution}`),
      );
      expect(() => readInstalledGraph(root)).toThrow(
        /pnpm-lock\.yaml: the package ms is not resolved from the registry by its checksum alone \(a tarball URL, a git reference or the setting lockfile-include-tarball-url causes this\)/,
      );
    });
  });

  it("S11: a package entry or a snapshot with a key the rules do not list", () => {
    const pkg = webDepends(
      { ms: "2.1.3" },
      MS_DEP,
      MS_ONLY.replace(`{integrity: ${SUM}}`, `{integrity: ${SUM}}\n    version: 2.1.3`),
    );
    expect(() => readInstalledGraph(pkg)).toThrow(
      /pnpm-lock\.yaml: the package ms has a key this file does not understand/,
    );
    const snap = webDepends(
      { ms: "2.1.3" },
      MS_DEP,
      MS_ONLY.replace("ms@2.1.3: {}", "ms@2.1.3:\n    id: x"),
    );
    expect(() => readInstalledGraph(snap)).toThrow(
      /pnpm-lock\.yaml: the installed package ms has a key this file does not understand/,
    );
  });

  it.each(["dependencies", "optionalDependencies"])(
    "S12: a snapshot whose %s holds a link stops the reader",
    (group) => {
      const lock = debugWith("link:packages/aws").replace("    dependencies:", `    ${group}:`);
      const root = workspace(
        {
          ".": ROOT_PKG,
          "apps/web": { ...WEB, dependencies: { debug: "4.4.3" } },
          "packages/aws": { name: "@tc/aws" },
        },
        `${HEAD}
overrides:
  debug>ms: link:./packages/aws

importers:

  .: {}

  apps/web:
    dependencies:
${DEBUG_DEP}

  packages/aws: {}
${lock}`,
      );
      expect(() => readInstalledGraph(root)).toThrow(
        /pnpm-lock\.yaml: the installed package debug depends on ms in a form this file does not understand/,
      );
    },
  );

  it("S13: a package.json that is not JSON, or not an object, of a project or of the root", () => {
    const lock = `${HEAD}\nimporters:\n\n  .: {}\n\n  apps/web: {}\n`;
    const project = workspace({ ".": ROOT_PKG, "apps/web": "{ not json" }, lock);
    expect(() => readInstalledGraph(project)).toThrow(
      /^installed-graph: a package\.json under apps\/, packages\/ or functions\/ cannot be read as JSON$/,
    );
    const projectNull = workspace({ ".": ROOT_PKG, "apps/web": "null" }, lock);
    expect(() => readInstalledGraph(projectNull)).toThrow(/^installed-graph: /);
    const rootPkg = workspace({ ".": "{ not json", "apps/web": WEB }, lock);
    expect(() => readInstalledGraph(rootPkg)).toThrow(
      /^installed-graph: package\.json cannot be read as JSON$/,
    );
    for (const text of ["null", "[]"]) {
      const rootOdd = workspace({ ".": text, "apps/web": WEB }, lock);
      expect(() => readInstalledGraph(rootOdd)).toThrow(
        /^installed-graph: package\.json does not hold a JSON object$/,
      );
    }
  });

  describe("S14: no message prints a value of the lockfile", () => {
    const secret = "https://user:tok3n@example.test/x.tgz";
    const messageOf = (root) => {
      try {
        readInstalledGraph(root);
      } catch (error) {
        return String(error.message);
      }
      return "";
    };

    it("a dependency of a project: the message names the project and the key", () => {
      const root = webDepends(
        { x: secret },
        `      x:\n        specifier: ${secret}\n        version: ${secret}`,
        "",
      );
      const message = messageOf(root);
      expect(message).toMatch(/^installed-graph: apps\/web: x is resolved in a form/);
      expect(message).not.toContain("tok3n");
    });

    it("a package entry of a third-party package: only its name", () => {
      const root = webDepends(
        { debug: "4.4.3" },
        DEBUG_DEP,
        `
packages:

  debug@4.4.3:
    resolution: {integrity: ${SUM}}

  ms@${secret}:
    resolution: {tarball: ${secret}}

snapshots:

  debug@4.4.3:
    dependencies:
      ms: ${secret}
`,
      );
      const message = messageOf(root);
      expect(message).toMatch(/the package ms is not resolved/);
      expect(message).not.toContain("tok3n");
    });

    it("a snapshot of a third-party package: only its name", () => {
      const root = webDepends(
        { debug: "4.4.3" },
        DEBUG_DEP,
        `
packages:

  debug@4.4.3:
    resolution: {integrity: ${SUM}}

snapshots:

  debug@4.4.3: {}

  ms@${secret}:
    dependencies:
      y: ${secret}
`,
      );
      const message = messageOf(root);
      expect(message).toMatch(/the installed package ms depends on y in a form/);
      expect(message).not.toContain("tok3n");
    });

    it("an importer of the lockfile that is no project: not printed", () => {
      const root = workspace(
        { ".": ROOT_PKG, "apps/web": WEB },
        `${HEAD}\nimporters:\n\n  .: {}\n\n  apps/web: {}\n\n  '${secret}': {}\n`,
      );
      const message = messageOf(root);
      expect(message).toMatch(/only in the lockfile: \(a name this file does not print\)/);
      expect(message).not.toContain("tok3n");
    });
  });
});

describe("readInstalledGraph reads what pnpm installed, and refuses a second lockfile or install", () => {
  const msManifests = { ".": ROOT_PKG, "apps/web": { ...WEB, dependencies: { ms: "2.1.3" } } };
  const msLock = webLock(MS_DEP);
  const HINT =
    "\\(node_modules/\\.pnpm/lock\\.yaml is pnpm's record of what is installed: if pnpm-lock\\.yaml is right, delete node_modules and run pnpm install\\)";

  it("an installed lockfile with leftovers of earlier installs in packages and snapshots passes", () => {
    const leftovers = msLock.replace(
      "snapshots:\n",
      `  semver@7.8.6:\n    resolution: {integrity: ${SUM}}\n\nsnapshots:\n\n  semver@7.8.6: {}\n`,
    );
    const root = workspace(msManifests, msLock, { installed: leftovers });
    expect(readInstalledGraph(root).graph["@tc/web"]).toEqual(["ms"]);
  });

  it("D1: a second lockfile next to pnpm-lock.yaml (gitBranchLockfile)", () => {
    const root = workspace(msManifests, msLock, { files: { "pnpm-lock.feat.yaml": msLock } });
    expect(() => readInstalledGraph(root)).toThrow(
      /the root holds a second lockfile besides pnpm-lock\.yaml/,
    );
  });

  it.each([
    ["apps/web", "pnpm-lock.yaml", { files: { "apps/web/pnpm-lock.yaml": "" } }],
    ["apps/web", "pnpm-workspace.yaml", { files: { "apps/web/pnpm-workspace.yaml": "" } }],
    ["apps/web", "node_modules/.pnpm", { folders: ["apps/web/node_modules/.pnpm"] }],
    [
      "apps/web",
      "node_modules/.modules.yaml",
      { files: { "apps/web/node_modules/.modules.yaml": "" } },
    ],
    ["apps", "node_modules/.pnpm", { folders: ["apps/node_modules/.pnpm"] }],
  ])("D1: %s holds %s: a second install", (dir, path, options) => {
    const root = workspace(msManifests, msLock, options);
    expect(() => readInstalledGraph(root)).toThrow(
      `installed-graph: ${dir} holds ${path}: a second install inside a project, which this file does not read`,
    );
  });

  it("D1: no installed lockfile", () => {
    const root = workspace(msManifests, msLock, { installed: null });
    expect(() => readInstalledGraph(root)).toThrow(
      /^installed-graph: node_modules\/\.pnpm\/lock\.yaml is missing: run pnpm install$/,
    );
  });

  it("D1: an installed lockfile whose importers differ", () => {
    const root = workspace(msManifests, msLock, {
      installed: webLock("      ms:\n        specifier: ^2.0.0\n        version: 2.1.3"),
    });
    expect(() => readInstalledGraph(root)).toThrow(
      /^installed-graph: what is installed in node_modules is not what pnpm-lock\.yaml records; run pnpm install$/,
    );
  });

  it("D1: an installed lockfile whose snapshot holds a link while pnpm-lock.yaml is clean", () => {
    const manifests = { ".": ROOT_PKG, "apps/web": { ...WEB, dependencies: { debug: "4.4.3" } } };
    const root = workspace(manifests, webLock(DEBUG_DEP, debugWith()), {
      installed: webLock(DEBUG_DEP, debugWith("link:packages/aws")),
    });
    expect(() => readInstalledGraph(root)).toThrow(
      new RegExp(
        `node_modules/\\.pnpm/lock\\.yaml: the installed package debug depends on ms in a form this file does not understand ${HINT}$`,
      ),
    );
  });

  it("D1: an installed lockfile with a key the rules do not list", () => {
    const root = workspace(msManifests, msLock, {
      installed: webLock(MS_DEP, MS_ONLY, "\nfutureKey: true\n"),
    });
    expect(() => readInstalledGraph(root)).toThrow(
      new RegExp(
        `node_modules/\\.pnpm/lock\\.yaml has the key "futureKey", which this file does not understand ${HINT}$`,
      ),
    );
  });
});

describe("boundaryProblems lists each problem in one line", () => {
  const EMPTY = { awsUsers: [], sdkUsers: [], reach: [], installed: [] };

  it("the root declares packages/aws", () => {
    const root = workspace(
      {
        ".": { ...ROOT_PKG, devDependencies: { "@tc/aws": "workspace:*" } },
        "packages/aws": { name: "@tc/aws" },
      },
      `${HEAD}
importers:

  .:
    devDependencies:
      '@tc/aws':
        specifier: workspace:*
        version: link:packages/aws

  packages/aws: {}
`,
    );
    expect(boundaryProblems(root, SDK)).toEqual({
      ...EMPTY,
      awsUsers: [". depends on @tc/aws"],
      reach: [". reaches @tc/aws"],
    });
  });

  it("an app reaches a function through another package, and every app is reported", () => {
    const root = workspace(
      {
        ".": ROOT_PKG,
        "apps/admin": { name: "@tc/admin", dependencies: { "@tc/core": "workspace:*" } },
        "apps/web": { ...WEB, dependencies: { "@tc/core": "workspace:*" } },
        "packages/core": { name: "@tc/core", dependencies: { "@tc/fn-reader": "workspace:*" } },
        "functions/reader": { name: "@tc/fn-reader" },
      },
      `${HEAD}
importers:

  .: {}

  apps/admin:
    dependencies:
      '@tc/core':
        specifier: workspace:*
        version: link:../../packages/core

  apps/web:
    dependencies:
      '@tc/core':
        specifier: workspace:*
        version: link:../../packages/core

  functions/reader: {}

  packages/core:
    dependencies:
      '@tc/fn-reader':
        specifier: workspace:*
        version: link:../../functions/reader
`,
    );
    expect(boundaryProblems(root, SDK)).toEqual({
      ...EMPTY,
      reach: ["apps/admin reaches @tc/fn-reader", "apps/web reaches @tc/fn-reader"],
    });
  });

  it("packages/core declares one of the six AWS packages, and an app reaches it", () => {
    const root = workspace(
      {
        ".": ROOT_PKG,
        "apps/web": { ...WEB, dependencies: { "@tc/core": "workspace:*" } },
        "packages/core": { name: "@tc/core", dependencies: { "@aws-sdk/client-sts": "3.1166.0" } },
      },
      `${HEAD}
importers:

  .: {}

  apps/web:
    dependencies:
      '@tc/core':
        specifier: workspace:*
        version: link:../../packages/core

  packages/core:
    dependencies:
      '@aws-sdk/client-sts':
        specifier: 3.1166.0
        version: 3.1166.0

packages:

  '@aws-sdk/client-sts@3.1166.0':
    resolution: {integrity: ${SUM}}

snapshots:

  '@aws-sdk/client-sts@3.1166.0': {}
`,
    );
    expect(boundaryProblems(root, SDK)).toEqual({
      ...EMPTY,
      sdkUsers: ["packages/core depends on @aws-sdk/client-sts"],
      reach: ["apps/web reaches @aws-sdk/client-sts"],
    });
  });

  it("LIMIT: a third-party package that depends on one of the six AWS packages is not reported", () => {
    const root = webDepends(
      { "@aws-sdk/rds-signer": "3.1166.0" },
      `      '@aws-sdk/rds-signer':
        specifier: 3.1166.0
        version: 3.1166.0`,
      `
packages:

  '@aws-sdk/credential-providers@3.1166.0':
    resolution: {integrity: ${SUM}}

  '@aws-sdk/rds-signer@3.1166.0':
    resolution: {integrity: ${SUM}}

snapshots:

  '@aws-sdk/credential-providers@3.1166.0': {}

  '@aws-sdk/rds-signer@3.1166.0':
    dependencies:
      '@aws-sdk/credential-providers': 3.1166.0
`,
    );
    expect(boundaryProblems(root, SDK)).toEqual(EMPTY);
  });

  it("node_modules of the root, of an app and between: every entry that is not allowed", () => {
    const store = (id, path, name) => [
      `node_modules/.pnpm/${id}/node_modules/${path}/package.json`,
      name === null ? "" : JSON.stringify({ name }),
    ];
    const root = workspace(
      {
        ".": ROOT_PKG,
        "apps/web": WEB,
        "packages/aws": { name: "@tc/aws" },
        "packages/core": { name: "@tc/core" },
        "functions/reader": { name: "@tc/fn-reader" },
      },
      `${HEAD}\nimporters:\n\n  .: {}\n\n  apps/web: {}\n\n  functions/reader: {}\n\n  packages/aws: {}\n\n  packages/core: {}\n`,
      {
        files: Object.fromEntries([
          store("ms@2.1.3", "ms", "ms"),
          store("a@1.0.0", "@tc/aws", "a"),
          store("b@1.0.0", "b", "@tc/aws"),
          store("@aws-sdk+client-sts@3.1166.0", "@aws-sdk/client-sts", "@aws-sdk/client-sts"),
          store("c@1.0.0", "c", null),
          ["packages/aws/node_modules/.keep", ""],
        ]),
        folders: ["apps/web/node_modules/.bin", "node_modules/.pnpm/node_modules"],
        links: {
          "apps/web/node_modules/.tc": "../../../packages/aws",
          "apps/web/node_modules/@aws-sdk/client-sts":
            "../../../../node_modules/.pnpm/@aws-sdk+client-sts@3.1166.0/node_modules/@aws-sdk/client-sts",
          "apps/web/node_modules/@tc/aws":
            "../../../../node_modules/.pnpm/a@1.0.0/node_modules/@tc/aws",
          "apps/web/node_modules/@tc/core": "../../../../packages/core",
          "apps/web/node_modules/awsdeps": "../../../packages/aws/node_modules",
          "apps/web/node_modules/b": "../../../node_modules/.pnpm/b@1.0.0/node_modules/b",
          "apps/web/node_modules/c": "../../../node_modules/.pnpm/c@1.0.0/node_modules/c",
          "apps/web/node_modules/deep": "../../../node_modules/.pnpm/node_modules",
          "apps/web/node_modules/fn": "../../../functions/reader",
          "apps/web/node_modules/ms": "../../../node_modules/.pnpm/ms@2.1.3/node_modules/ms",
          "apps/web/node_modules/up": "../../..",
          "apps/web/node_modules/x": "../../../packages/aws",
          "apps/node_modules/y": "../../packages/aws",
          "node_modules/ms": ".pnpm/ms@2.1.3/node_modules/ms",
          "node_modules/z": "../functions/reader",
        },
      },
    );
    expect(boundaryProblems(root, SDK)).toEqual({
      ...EMPTY,
      installed: [
        ".: z -> functions/reader",
        "apps: y -> packages/aws",
        "apps/web: (a name this file does not print) -> packages/aws",
        "apps/web: @aws-sdk/client-sts -> node_modules/.pnpm/…/node_modules/@aws-sdk/client-sts",
        "apps/web: @tc/aws -> node_modules/.pnpm/…/node_modules/@tc/aws",
        "apps/web: awsdeps -> packages/aws/node_modules",
        "apps/web: b -> node_modules/.pnpm/…/node_modules/b",
        "apps/web: c -> node_modules/.pnpm/…/node_modules/c",
        "apps/web: deep -> node_modules/.pnpm/…",
        "apps/web: fn -> functions/reader",
        "apps/web: up -> .",
        "apps/web: x -> packages/aws",
      ],
    });
  });

  it("node_modules of every workspace project that an app or the root reaches is read too (a postinstall link, N1)", () => {
    const lock = `${HEAD}
importers:

  .:
    devDependencies:
      '@tc/tool':
        specifier: workspace:*
        version: link:packages/tool

  apps/web:
    dependencies:
      '@tc/ui':
        specifier: workspace:*
        version: link:../../packages/ui

  packages/aws: {}

  packages/tool: {}

  packages/ui:
    dependencies:
      '@tc/lib':
        specifier: workspace:*
        version: link:../lib

  packages/lib: {}

  packages/lonely: {}
`;
    const root = workspace(
      {
        ".": { ...ROOT_PKG, devDependencies: { "@tc/tool": "workspace:*" } },
        "apps/web": { ...WEB, dependencies: { "@tc/ui": "workspace:*" } },
        "packages/aws": { name: "@tc/aws" },
        "packages/tool": { name: "@tc/tool" },
        "packages/ui": { name: "@tc/ui", dependencies: { "@tc/lib": "workspace:*" } },
        "packages/lib": { name: "@tc/lib" },
        "packages/lonely": { name: "@tc/lonely" },
      },
      lock,
      {
        files: { "node_modules/.pnpm/ms@2.1.3/node_modules/ms/package.json": '{"name":"ms"}' },
        links: {
          // reached by the app (directly and through another package), and by the root
          "packages/ui/node_modules/bridge": "../../aws",
          "packages/lib/node_modules/bridge2": "../../aws",
          "packages/tool/node_modules/bridge3": "../../aws",
          // an honest link of a reached package
          "packages/ui/node_modules/ms": "../../../node_modules/.pnpm/ms@2.1.3/node_modules/ms",
          // not reached by an app or the root: not read
          "packages/lonely/node_modules/bridge4": "../../aws",
          // packages/aws itself is never read
          "packages/aws/node_modules/ms": "../../../node_modules/.pnpm/ms@2.1.3/node_modules/ms",
        },
      },
    );
    expect(boundaryProblems(root, SDK).installed).toEqual([
      "packages/lib: bridge2 -> packages/aws",
      "packages/tool: bridge3 -> packages/aws",
      "packages/ui: bridge -> packages/aws",
    ]);
  });

  it("a link that leads out of the repository is reported without its path", () => {
    const root = workspace(
      { ".": ROOT_PKG, "apps/web": WEB },
      `${HEAD}\nimporters:\n\n  .: {}\n\n  apps/web: {}\n`,
      { links: { "apps/web/node_modules/out": "../../../.." } },
    );
    expect(boundaryProblems(root, SDK).installed).toEqual([
      "apps/web: out -> (a folder outside the repository)",
    ]);
  });
});

describe("readDirectLinks lists what a node_modules folder really holds", () => {
  const root = workspace(
    { ".": ROOT_PKG, "apps/web": WEB, "packages/aws": { name: "@tc/aws" } },
    null,
    {
      files: {
        "node_modules/.pnpm/x/node_modules/@tc/aws/package.json": JSON.stringify({
          name: "@tc/aws",
        }),
        "apps/web/node_modules/.modules.yaml": "",
        "apps/admin/node_modules": "a file",
        "apps/api/node_modules/@scopefile": "a file",
      },
      folders: ["apps/web/node_modules/.pnpm", "apps/web/node_modules/.bin"],
      links: {
        "apps/web/node_modules/@tc/aws": "../../../../packages/aws",
        "apps/web/node_modules/innocent": "../../../packages/aws",
        "apps/web/node_modules/ms": "../../../node_modules/.pnpm/x/node_modules/@tc/aws",
        "apps/web/node_modules/up": "../../..",
        "apps/web/node_modules/gone": "../nowhere",
        "apps/web/node_modules/.tc": "../../../packages/aws",
      },
    },
  );

  it("follows each entry to its real folder and reads the name found there", () => {
    expect(readDirectLinks(root, "apps/web")).toEqual([
      { name: ".tc", target: "packages/aws", packageName: "@tc/aws" },
      { name: "@tc/aws", target: "packages/aws", packageName: "@tc/aws" },
      { name: "gone", target: null, packageName: null },
      { name: "innocent", target: "packages/aws", packageName: "@tc/aws" },
      {
        name: "ms",
        target: "node_modules/.pnpm/x/node_modules/@tc/aws",
        packageName: "@tc/aws",
      },
      { name: "up", target: ".", packageName: "panelpay-platform" },
    ]);
  });

  it("a folder without node_modules holds nothing", () => {
    expect(readDirectLinks(root, "packages/aws")).toEqual([]);
  });

  it("a node_modules or a scope entry that is a file stops with a fixed message", () => {
    expect(() => readDirectLinks(root, "apps/admin")).toThrow(
      /^installed-graph: apps\/admin\/node_modules cannot be read as a folder$/,
    );
    expect(() => readDirectLinks(root, "apps/api")).toThrow(
      /^installed-graph: apps\/api\/node_modules\/@scopefile cannot be read as a folder$/,
    );
  });
});
