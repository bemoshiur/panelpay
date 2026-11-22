import js from "@eslint/js";
import tseslint from "typescript-eslint";

// What this file is. The lint rules below are tripwires for accidents (R1). The boundary is IAM
// (WP0-T5, not built yet). The rules read import statements, export-from statements and import()
// calls with a literal source in apps/ and packages/. They do not see: a bridge file outside
// those folders (until the closure test of tests/repo lands), a committed symbolic link, an AWS
// package that is not on the lists, a loader reached through an alias, or a call that is not an
// import. Inline directives (eslint-disable) are switched off for apps/ and packages/, so a
// per-rule exception is a reviewed change of this file.
// A source folder of apps/ or packages/ must not be called dist: the config ignores every dist
// folder.

// The six AWS packages (the five of section 4 and credential-providers, open point 17) and aws-sdk
// (the v1/v2 SDK, which no code of this repository uses). The credential-provider packages that the
// clients load themselves are transitive dependencies of the clients apps need, so they are not
// listed here (see AWS_LOADERS below for the import ban on them).
export const awsSdkClients = [
  "@aws-sdk/client-lightsail",
  "@aws-sdk/client-route-53",
  "@aws-sdk/client-route-53-domains",
  "@aws-sdk/client-sts",
  "@aws-sdk/client-cost-explorer",
  "@aws-sdk/credential-providers",
  "aws-sdk",
];

// AWS clients that functions/ may import directly (the notifier sends mail with SESv2, WPU-D4) but that
// apps/ and packages/ (except packages/aws) must never import (R1). The list of six above stays as pinned.
export const awsSdkClientsFunctionsOnly = ["@aws-sdk/client-sesv2"];

// Each group matches the bare package and every sub-path of it.
const withSubpaths = (names) => names.flatMap((n) => [n, `${n}/*`]);

// Flat config does not merge a rule across matching blocks (the last block wins), so each
// file scope below gets exactly one block that carries every restriction that applies to it.
// The path forms: packages/aws from anywhere, a sibling `aws` package reached with `../`
// (from inside packages/), and every function package, which may import @tc/aws itself.
const R1_PATH_FORMS = [
  "**/packages/aws",
  "**/packages/aws/**",
  "../**/aws",
  "../**/aws/**",
  "**/functions/**",
  "**/node_modules/**",
];
const R1 = {
  message: "R1: the web tier never provisions. Only functions/ may import @tc/aws.",
  group: ["@tc/aws", "@tc/aws/*", "@tc/fn-*", "@tc/fn-*/*", ...R1_PATH_FORMS],
};
const SDK = {
  message: "Spec section 4: these AWS SDK packages are used only inside packages/aws.",
  group: withSubpaths(awsSdkClients),
};
const SDK_FUNCTIONS_ONLY = {
  message: "R1: this AWS client is imported only by functions/, never by apps/ or packages/.",
  group: withSubpaths(awsSdkClientsFunctionsOnly),
};
const PURE_CORE = {
  message: "packages/core is pure logic: no AWS and no HTTP (spec section 5).",
  group: [
    "@aws-sdk/*",
    "@tc/aws",
    "@tc/aws/*",
    "next",
    "next/*",
    "http",
    "https",
    "node:http",
    "node:https",
    "undici",
    "axios",
    "node-fetch",
  ],
};

const DECIMAL = {
  message:
    "R4: decimal math lives only in packages/core/pricing. Everywhere else money is bigint paisa.",
  group: ["big.js", "decimal.js", "decimal.js-light", "bignumber.js"],
};
// Modules that load code by a route the import rules do not read, or that carry credentials or
// request signing out of packages/aws. Only packages/aws and functions/ may use them.
const AWS_LOADERS = {
  message:
    "R1: this module can load code or credentials by a route the import rules cannot check; only packages/aws and functions/ may use it.",
  group: [
    "module",
    "node:module",
    "@aws-sdk/nested-clients",
    "@aws-sdk/nested-clients/*",
    "@aws-sdk/credential-provider-*",
    "@aws-sdk/credential-provider-*/*",
    "@smithy/signature-v4",
    "@smithy/signature-v4/*",
  ],
};
// The apps are bundled for the web: no code from text, no child process.
const APP_MODULES = {
  message:
    "R1: this module runs code from text, a child process or a worker; the apps never use it.",
  group: [
    "vm",
    "node:vm",
    "child_process",
    "node:child_process",
    "worker_threads",
    "node:worker_threads",
  ],
};
// The statements that write operations as the system or decide on them as an admin. A Server Action
// of apps/ uses the tenant-scoped repositories instead.
const SYSTEM_WRITES = {
  group: ["@tc/db", "@tc/core"],
  importNames: [
    "enqueueOperation",
    "makeEnqueueOperation",
    "insertOperation",
    "approveOperation",
    "retryOperation",
    "rejectOperation",
  ],
  message:
    "R8/R10: customer actions use customerRepos(...).operations.request; admin decisions go through adminRepos(...).",
};
// WPU-X4 (review M1): the pool account seed writes pool_accounts and pool_capacity as the table owner.
// Only the migrator (functions/) and the CLI (scripts/) use it; the apps change capacity through the
// audited admin repositories (R10).
const SEED_POOL_MESSAGE =
  "WPU-X4: the pool account seed is for the migrator and the CLI only; the apps use the audited admin repositories (R10).";
const SEED_POOL = {
  message: SEED_POOL_MESSAGE,
  group: ["@tc/db/seed-pool", "**/packages/db/seed-pool", "**/packages/db/seed-pool.*"],
};
const SEED_POOL_DYNAMIC = {
  selector:
    "ImportExpression[source.value=/^@tc\\/db\\/seed-pool$|(^|\\/)packages\\/db\\/seed-pool(\\.[a-z]+)?$/]",
  message: SEED_POOL_MESSAGE,
};
// packages/core already bans the SDK clients and @tc/aws through PURE_CORE, so R1 adds the
// function packages and the path forms.
const R1_PATHS = { ...R1, group: ["@tc/fn-*", "@tc/fn-*/*", ...R1_PATH_FORMS] };

// R1 for dynamic imports: no-restricted-imports does not check import() (ESLint 10.14.0).
const R1_DYNAMIC_SOURCE =
  "/^@tc\\/aws(\\/|$)|^@tc\\/fn-|(^|\\/)packages\\/aws(\\/|$)|(^|\\/)functions\\/|^\\.\\.\\/(.*\\/)?aws(\\/|$)|(^|\\/)node_modules\\//i";
const R1_DYNAMIC = {
  selector: `ImportExpression[source.value=${R1_DYNAMIC_SOURCE}]`,
  message: R1.message,
};
const R1_DYNAMIC_TEMPLATE = {
  selector: `ImportExpression > TemplateLiteral[expressions.length=0] > TemplateElement[value.cooked=${R1_DYNAMIC_SOURCE}]`,
  message: R1.message,
};
// Built from the list above, so the two cannot drift. SDK_NAMES_SOURCE is for functions/ (a path
// through node_modules is refused only in apps/ and packages/); SDK_DYNAMIC_SOURCE adds it.
const SDK_NAMES_SOURCE = `^(${awsSdkClients.map((n) => n.replaceAll("/", "\\/")).join("|")})(\\/|$)`;
const SDK_DYNAMIC_SOURCE = `/${SDK_NAMES_SOURCE}|(^|\\/)node_modules\\//i`;
const SDK_DYNAMIC = {
  selector: `ImportExpression[source.value=${SDK_DYNAMIC_SOURCE}]`,
  message: SDK.message,
};
const SDK_DYNAMIC_TEMPLATE = {
  selector: `ImportExpression > TemplateLiteral[expressions.length=0] > TemplateElement[value.cooked=${SDK_DYNAMIC_SOURCE}]`,
  message: SDK.message,
};
const SDK_DYNAMIC_FUNCTIONS = {
  selector: `ImportExpression[source.value=/${SDK_NAMES_SOURCE}/i]`,
  message: SDK.message,
};

// A ? or # in the source of an import, an export-from or an import() with a literal source
// changes what a bundler loads; the rules above read the source as a plain path.
const NO_QUERY_MESSAGE =
  "R1: a ? or # in an import source is refused in apps/ and packages/, so the boundary can be checked.";
const NO_QUERY = {
  selector:
    ":matches(ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration, ImportExpression) > Literal.source[value=/[?#]/]",
  message: NO_QUERY_MESSAGE,
};
const NO_QUERY_TEMPLATE = {
  selector:
    "ImportExpression > TemplateLiteral[expressions.length=0] > TemplateElement[value.cooked=/[?#]/]",
  message: NO_QUERY_MESSAGE,
};
const NO_HIDDEN_LOADER = {
  selector: [
    'CallExpression[callee.name="createRequire"]',
    "CallExpression[callee.property.name=/^(createRequire|getBuiltinModule)$/]",
    // a computed key: x["createRequire"](...), x["getBuiltinModule"](...)
    "CallExpression[callee.property.value=/^(createRequire|getBuiltinModule)$/]",
  ].join(", "),
  message:
    "R1: createRequire and getBuiltinModule load modules that the import rules cannot check.",
};
// The selectors of block A, in one place, so the packages/db/repositories block carries them all.
const DYNAMIC_IMPORT_SYNTAX = [
  R1_DYNAMIC,
  SDK_DYNAMIC,
  NO_HIDDEN_LOADER,
  NO_QUERY,
  SEED_POOL_DYNAMIC,
  {
    selector: 'ImportExpression:not([source.type="Literal"])',
    message:
      "R1: dynamic imports in apps/ and packages/ take a string literal, so the boundary can be checked.",
  },
];

const DB_BELOW_CORE = {
  message:
    "packages/db sits below packages/core: @tc/core imports @tc/db (section F, postTransaction(tx: Tx)), so packages/db never imports @tc/core.",
  group: [
    "@tc/core",
    "@tc/core/*",
    "**/packages/core",
    "**/packages/core/**",
    "../**/core",
    "../**/core/**",
  ],
};

const restrict = (...patterns) => ({
  "no-restricted-imports": ["error", { patterns }],
});

export default tseslint.config(
  {
    ignores: [
      "design/**",
      "docs/**",
      ".claude/**",
      "**/dist/**",
      "**/node_modules/**",
      "coverage/**",
      "**/.next/**",
      "**/.open-next/**",
      "**/sst-env.d.ts",
      "**/.sst/**",
      "**/next-env.d.ts",
      ".superpowers/**",
      ".remember/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Repo scripts and tests run on Node.
    files: ["**/*.mjs"],
    languageOptions: { globals: { process: "readonly" } },
  },
  {
    // .jsx is linted too (a files pattern that ends in /** does not select a file by itself), so R1
    // is switched on for it like for .tsx.
    files: ["**/*.jsx"],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  {
    // An inline directive (eslint-disable and the like) cannot switch a rule off in apps/ or
    // packages/. An exception is a reviewed change of this file.
    files: ["apps/**", "packages/**"],
    linterOptions: { noInlineConfig: true },
  },
  {
    // apps/** and packages/** (except aws and core): R1, the SDK rule and R4.
    files: ["apps/**", "packages/**"],
    ignores: ["packages/aws/**", "packages/core/**", "packages/db/**"],
    rules: restrict(R1, SDK, SDK_FUNCTIONS_ONLY, DECIMAL, AWS_LOADERS),
  },
  {
    // apps/**: the same, plus the modules that only a server process may use.
    files: ["apps/**"],
    rules: restrict(
      R1,
      SDK,
      SDK_FUNCTIONS_ONLY,
      DECIMAL,
      AWS_LOADERS,
      APP_MODULES,
      SYSTEM_WRITES,
      SEED_POOL,
    ),
  },
  {
    // packages/db: R1, the SDK rule, R4, and the direction of the dependency on packages/core.
    files: ["packages/db/**"],
    rules: restrict(R1, SDK, SDK_FUNCTIONS_ONLY, DECIMAL, AWS_LOADERS, DB_BELOW_CORE),
  },
  {
    // packages/aws: R4 only (it is the one place that may import the SDK clients).
    files: ["packages/aws/**"],
    rules: restrict(DECIMAL),
  },
  {
    // packages/core except pricing: pure logic and R4.
    files: ["packages/core/**"],
    ignores: ["packages/core/pricing/**"],
    rules: restrict(PURE_CORE, R1_PATHS, DECIMAL, AWS_LOADERS),
  },
  {
    // packages/core/pricing: pure logic, and the only scope that may import a decimal library.
    files: ["packages/core/pricing/**"],
    rules: restrict(PURE_CORE, R1_PATHS, AWS_LOADERS),
  },
  {
    // Dynamic imports, block A: every file of apps/ and packages/ except tests (and except
    // packages/aws). The source must be a string literal, so the boundary can be checked.
    // Flat config keeps only the last matching block's no-restricted-syntax, so blocks A and B
    // match disjoint files (B matches exactly what A ignores).
    files: ["apps/**", "packages/**"],
    ignores: ["packages/aws/**", "**/*.test.ts", "**/*.test.tsx", "**/*.test.mjs"],
    rules: {
      "no-restricted-syntax": ["error", ...DYNAMIC_IMPORT_SYNTAX],
    },
  },
  {
    // Dynamic imports, block B: test files (not bundled) get only the R1 path selector.
    files: ["apps/**/*.test.{ts,tsx,mjs}", "packages/**/*.test.{ts,tsx,mjs}"],
    ignores: ["packages/aws/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        R1_DYNAMIC,
        R1_DYNAMIC_TEMPLATE,
        SDK_DYNAMIC,
        SDK_DYNAMIC_TEMPLATE,
        NO_HIDDEN_LOADER,
        NO_QUERY,
        NO_QUERY_TEMPLATE,
      ],
    },
  },
  {
    // packages/aws writes no log line: a logger on the STS client would write the ExternalId and
    // the session token. Tests of the package may use console.
    files: ["packages/aws/**"],
    ignores: ["**/*.test.ts", "**/*.test.tsx", "**/*.test.mjs"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: [
            "Property[computed=false][key.name='logger']",
            "Property[key.value='logger']",
            "MemberExpression[computed=false][property.name='logger']",
            "MemberExpression[property.value='logger']",
            "Identifier[name='console']",
          ].join(", "),
          message:
            "packages/aws writes no log line: no logger option and no console (the STS client would write the ExternalId and the session token).",
        },
      ],
    },
  },
  {
    // Code built from text cannot be checked by any import rule.
    // no-implied-eval sees a bare setTimeout("...") only when the config declares the timer globals
    // (WPU-B4: declared below, so the bare form is caught as well as globalThis. and window.).
    files: ["apps/**", "packages/**", "functions/**", "pro/**", "scripts/**", "infra/**", "verify/**"],
    languageOptions: {
      globals: { setTimeout: "readonly", setInterval: "readonly", setImmediate: "readonly" },
    },
    rules: { "no-eval": "error", "no-implied-eval": "error", "no-new-func": "error" },
  },
  {
    // Repositories are meant to put values into SQL only as bound parameters (R8: the scope is a
    // parameter; R11). This rule refuses the plain ways to put text into SQL without a parameter:
    // a call of a member named raw on any object, written with a dot or with a string in brackets,
    // and a destructuring that takes raw out of an object. String.raw as a template tag is not a
    // call and stays allowed. The check that counts is the test that reads the statements really
    // sent (packages/db/test/cross-tenant.test.ts, built in Tasks 5 and 6 of
    // docs/superpowers/plans/2026-11-11-wp1-t2-tenant-scoped-repositories.md).
    // Flat config keeps only the no-restricted-syntax of the last matching block, so this block
    // carries every selector of block A (DYNAMIC_IMPORT_SYNTAX) and adds the selectors for raw.
    files: ["packages/db/repositories/**", "packages/db/operations/**"],
    ignores: ["**/*.test.ts", "**/*.test.tsx", "**/*.test.mjs"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...DYNAMIC_IMPORT_SYNTAX,
        {
          selector: [
            // x.raw(...) for any x: sql.raw, an alias such as s.raw, x?.raw
            "CallExpression[callee.computed=false][callee.property.name='raw']",
            // x["raw"](...)
            "CallExpression[callee.property.value='raw']",
            // x[`raw`](...), a template literal without an expression
            "CallExpression[callee.property.expressions.length=0][callee.property.quasis.0.value.cooked='raw']",
            // const { raw } = x; const { raw: r } = x
            "ObjectPattern > Property[computed=false][key.name='raw']",
            // const { "raw": r } = x
            "ObjectPattern > Property[key.value='raw']",
          ].join(", "),
          message:
            "packages/db/repositories: sql.raw puts text into SQL without a parameter; use the sql template.",
        },
      ],
    },
  },
  {
    // functions/** and everything else outside apps/ and packages/: the SDK rule and R4.
    files: ["**/*"],
    ignores: ["apps/**", "packages/**"],
    rules: {
      ...restrict(SDK, DECIMAL),
      "no-restricted-syntax": ["error", SDK_DYNAMIC_FUNCTIONS],
    },
  },
);
