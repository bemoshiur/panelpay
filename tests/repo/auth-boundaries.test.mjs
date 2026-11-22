import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { expect, it } from "vitest";

// R8, R1, R3, R14, R17 for packages/auth. Only this package turns a verified Cognito sub into a
// customer id; the apps and functions get a session from it and from nothing else.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BUILD_FOLDERS = new Set(["node_modules", ".next", ".open-next", ".sst", "dist"]);
const PACKAGE_TEST_FOLDER = /^(?:apps|packages|functions)\/[^/]+\/test$/;
const SOURCE_FILE = /\.(ts|tsx|mts|cts|mjs|cjs|js)$/;
const TEST_FILE = /\.test\.(ts|tsx|mts|cts|mjs|cjs|js)$/;
const walk = (dir) =>
  readdirSync(posix.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const p = posix.join(dir, e.name);
    if (e.isDirectory()) {
      return BUILD_FOLDERS.has(e.name) || PACKAGE_TEST_FOLDER.test(p) ? [] : walk(p);
    }
    return e.isFile() ? [p] : [];
  });
const read = (f) => readFileSync(posix.join(ROOT, f), "utf8");
const sources = () =>
  ["apps", "packages", "functions"].flatMap(walk).filter((f) => SOURCE_FILE.test(f));
const nonTest = () => sources().filter((f) => !TEST_FILE.test(f));

// Comments do not call anything: a block comment or a line comment is removed first.
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const namesLookup = (text) => /\blookupCustomerBySub\b/.test(stripComments(text));

const IMPORT_SPECIFIERS =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;
const specifiersOf = (text) =>
  [...stripComments(text).matchAll(IMPORT_SPECIFIERS)].map((m) => m[1]);
const FORBIDDEN_SPECIFIER =
  /^(?:@tc\/aws(?:\/|$)|@aws-sdk\/|@smithy\/|aws-sdk(?:\/|$)|next(?:\/|$)|react(?:\/|$)|react-dom(?:\/|$))/;

it("the scan finds the identity lookup by name, and nothing else", () => {
  for (const text of [
    'import { lookupCustomerBySub } from "@tc/db";',
    "withTx((tx) => lookupCustomerBySub(tx, sub))",
    "export { lookupCustomerBySub } from './identity'",
  ]) {
    expect(namesLookup(text), text).toBe(true);
  }
  for (const text of [
    "// lookupCustomerBySub is called by packages/auth",
    "/* lookupCustomerBySub */ const a = 1;",
    "const lookupCustomerBySubject = 1;",
    "findCustomerById(tx, id)",
  ]) {
    expect(namesLookup(text), text).toBe(false);
  }
  expect(specifiersOf('import x from "next/headers";\nconst y = await import("react");')).toEqual([
    "next/headers",
    "react",
  ]);
  expect(specifiersOf('// import x from "next/headers"')).toEqual([]);
  for (const s of [
    "@tc/aws",
    "@tc/aws/lightsail",
    "@aws-sdk/client-sts",
    "next/headers",
    "next",
    "react",
    "react-dom",
    "react/jsx-runtime",
  ]) {
    expect(FORBIDDEN_SPECIFIER.test(s), s).toBe(true);
  }
  for (const s of [
    "@tc/db",
    "@tc/core",
    "aws-jwt-verify",
    "./refresh",
    "node:crypto",
    "nextjs-fake",
    "reactive",
  ]) {
    expect(FORBIDDEN_SPECIFIER.test(s), s).toBe(false);
  }
});

it("lookupCustomerBySub is named only in packages/auth, packages/db/repositories/identity.ts, packages/db/index.ts and test files", () => {
  const all = sources();
  expect(all.length).toBeGreaterThanOrEqual(50);
  const allowed = (f) =>
    f.startsWith("packages/auth/") ||
    f === "packages/db/repositories/identity.ts" ||
    f === "packages/db/index.ts" ||
    TEST_FILE.test(f);
  const offenders = all.filter((f) => !allowed(f) && namesLookup(read(f)));
  expect(offenders).toEqual([]);
  // The scan looks at the right place: the package itself does name it.
  expect(all.filter((f) => f.startsWith("packages/auth/") && namesLookup(read(f)))).toContain(
    "packages/auth/require.ts",
  );
});

// The one function that creates a customers row (WP2-T2). Like the lookup, it is for packages/auth.
const namesRegister = (text) => /\bregisterCustomer\b/.test(stripComments(text));

it("registerCustomer is named only in packages/auth, packages/db/repositories/system/registration.ts, packages/db/index.ts and test files", () => {
  const all = sources();
  const allowed = (f) =>
    f.startsWith("packages/auth/") ||
    f === "packages/db/repositories/system/registration.ts" ||
    f === "packages/db/index.ts" ||
    TEST_FILE.test(f);
  const offenders = all.filter((f) => !allowed(f) && namesRegister(read(f)));
  expect(offenders).toEqual([]);
  // The scan looks at the right place, and sees the name in each form of use.
  expect(all.filter((f) => f.startsWith("packages/auth/") && namesRegister(read(f)))).toContain(
    "packages/auth/register.ts",
  );
  for (const text of [
    'import { registerCustomer } from "@tc/db";',
    "withTx((tx) => registerCustomer(tx, input))",
    "export { registerCustomer } from './registration'",
  ]) {
    expect(namesRegister(text), text).toBe(true);
  }
  for (const text of [
    "// registerCustomer is called by packages/auth",
    "/* registerCustomer */ const a = 1;",
    "const registerCustomerForm = 1;",
    "registerAccount(deps, input)",
  ]) {
    expect(namesRegister(text), text).toBe(false);
  }
});

it("the identity port and its Cognito adapter read no environment and use no AWS package", () => {
  for (const f of ["packages/auth/identity.ts", "packages/auth/cognito-identity.ts"]) {
    const text = stripComments(read(f));
    expect(text, f).not.toMatch(/\bprocess\s*\.\s*env\b/);
    expect(text, f).not.toMatch(/\bprocess\s*\[\s*["']env["']\s*\]/);
    expect(
      specifiersOf(read(f)).filter((s) => FORBIDDEN_SPECIFIER.test(s)),
      f,
    ).toEqual([]);
  }
});

it("@tc/auth/testing is imported only by test files and by packages/auth/testing itself", () => {
  const offenders = sources().filter(
    (f) =>
      !TEST_FILE.test(f) &&
      !f.startsWith("packages/auth/testing/") &&
      specifiersOf(read(f)).some(
        (s) => s === "@tc/auth/testing" || s.startsWith("@tc/auth/testing/"),
      ),
  );
  expect(offenders).toEqual([]);
});

it("packages/auth imports no AWS package, no next/*, no react and no @tc/aws", () => {
  const files = nonTest().filter((f) => f.startsWith("packages/auth/"));
  expect(files.length).toBeGreaterThanOrEqual(10);
  const offenders = files.flatMap((f) =>
    specifiersOf(read(f))
      .filter((s) => FORBIDDEN_SPECIFIER.test(s))
      .map((s) => `${f}: ${s}`),
  );
  expect(offenders).toEqual([]);
});

it("packages/auth has no console call and no process.env outside config.ts", () => {
  const files = nonTest().filter((f) => f.startsWith("packages/auth/"));
  const offenders = files.flatMap((f) => {
    const text = stripComments(read(f));
    const found = [];
    if (/\bconsole\s*[.[]/.test(text)) found.push(`${f}: console`);
    // config.ts takes the environment as a parameter and does not read process.env either.
    if (/\bprocess\s*\.\s*env\b/.test(text) || /\bprocess\s*\[\s*["']env["']\s*\]/.test(text))
      found.push(`${f}: process.env`);
    return found;
  });
  expect(offenders).toEqual([]);
});

it("packages/auth has no cookie, session, jose or jsonwebtoken dependency", () => {
  const pkg = JSON.parse(read("packages/auth/package.json"));
  expect(Object.keys(pkg.dependencies).sort()).toEqual(["@tc/core", "@tc/db", "aws-jwt-verify"]);
  // pinned: digits only, no ^ ~ > < * x or range
  expect(pkg.dependencies["aws-jwt-verify"]).toMatch(/^\d+\.\d+\.\d+$/);
  for (const k of ["peerDependencies", "optionalDependencies"]) {
    expect(Object.keys(pkg[k] ?? {})).toEqual([]);
  }
  const risky =
    /^(?:cookie|cookies|iron-session|next-auth|@auth\/|jose|jsonwebtoken|jws|jwa|jwt-decode|passport|lucia)/;
  expect(
    Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((n) => risky.test(n)),
  ).toEqual([]);
});

it("no file under apps/ or functions/ builds a Set-Cookie for the session by hand", () => {
  const files = ["apps", "functions"].flatMap(walk).filter((f) => SOURCE_FILE.test(f));
  expect(files.length).toBeGreaterThanOrEqual(10);
  const offenders = files.filter(
    (f) => !TEST_FILE.test(f) && /__Host-tc_(?:at|rt)\b/.test(read(f)),
  );
  expect(offenders).toEqual([]);
  // The names live in cookies.ts and nowhere else in the non-test code of packages/.
  const holders = walk("packages")
    .filter((f) => SOURCE_FILE.test(f) && !TEST_FILE.test(f))
    .filter((f) => /__Host-tc_(?:at|rt)\b/.test(read(f)));
  expect(holders).toEqual(["packages/auth/cookies.ts"]);
});

// PRO-6 (security review M1): the system read that returns a customer id from an e-mail, with no tenant
// scope. Only the WHMCS bridge of the Pro edition may name it; the web and admin tiers never do.
const namesWhmcsLookup = (text) => /\bsystemWhmcs\b|\bcustomerByVerifiedEmail\b/.test(stripComments(text));

it("systemWhmcs is named only in pro/whmcs-bridge, its own module, packages/db/index.ts and test files", () => {
  const all = [...sources(), ...walk("pro").filter((f) => SOURCE_FILE.test(f))];
  const allowed = (f) =>
    f.startsWith("pro/whmcs-bridge/") ||
    f === "packages/db/repositories/system/whmcs.ts" ||
    f === "packages/db/index.ts" ||
    TEST_FILE.test(f);
  const offenders = all.filter((f) => !allowed(f) && namesWhmcsLookup(read(f)));
  expect(offenders).toEqual([]);
  expect(all.filter((f) => f.startsWith("pro/whmcs-bridge/") && namesWhmcsLookup(read(f)))).toContain(
    "pro/whmcs-bridge/credit.ts",
  );
  expect(namesWhmcsLookup('import { systemWhmcs } from "@tc/db";')).toBe(true);
  expect(namesWhmcsLookup("// systemWhmcs is for the bridge")).toBe(false);
});
