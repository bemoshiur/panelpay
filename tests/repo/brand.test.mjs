// WPU-B1, WPU-Z8: the product brand is TryAWS.now (owner decision 2026-11-13), after MeghVPS (WPU-B1) and
// the first brand name before it. No old brand name may return to any text a customer reads. WPU-Y6: the company is
// TryAWS.now too (below). Technical names (tc- prefixes, TiCON-Pools-Dev, ticon-log-protection, @tc/*)
// stay and are not scanned for.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const OLD = /TiCON\s+Cloud|টিকন\s+ক্লাউড/i;
// WPU-Z8: the brand of WPU-B1, replaced by TryAWS.now.
const FORMER = /MeghVPS|মেঘ\s*ভিপিএস/i;

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

const customerFacing = () => {
  const files = [];
  for (const dir of [
    "apps/web/messages",
    "apps/admin/messages",
    "packages/ui/shells/messages",
    "packages/notify/templates",
    "packages/notify/sms",
    "packages/notify/email",
    "apps/web/public/brand",
    "apps/admin/public/brand",
  ]) {
    if (existsSync(dir)) files.push(...walk(dir));
  }
  files.push("apps/web/server/public/seo.ts", "packages/core/invoices/render.ts");
  return files.filter((f) => /\.(ts|tsx|svg|json)$/.test(f) && !/\.test\./.test(f));
};

it("no customer-facing message, template, logo or invoice text says the first brand name", () => {
  const files = customerFacing();
  expect(files.length).toBeGreaterThan(20);
  const hits = files.filter((f) => OLD.test(readFileSync(f, "utf8")));
  expect(hits).toEqual([]);
});

it("no customer-facing message, template, logo or invoice text says MeghVPS (WPU-Z8)", () => {
  const files = customerFacing();
  expect(files.length).toBeGreaterThan(20);
  const hits = files.filter((f) => FORMER.test(readFileSync(f, "utf8")));
  expect(hits).toEqual([]);
});

it("the brand is TryAWS.now in the shell, the admin title, the mail wordmark, the SMS, the invoice and the site name", () => {
  for (const [file, part] of [
    ["packages/ui/shells/messages/en.ts", 'brand: "TryAWS.now"'],
    ["packages/ui/shells/messages/bn.ts", 'brand: "TryAWS.now"'],
    ["packages/notify/templates/messages.ts", 'wordmark: "TryAWS.now"'],
    ["packages/notify/sms/otp-text.ts", "`TryAWS.now Your OTP is: "],
    ["packages/core/invoices/render.ts", '"TryAWS.now sells, bills and supports the service."'],
    ["apps/web/server/public/seo.ts", 'SITE_NAME = "TryAWS.now"'],
    ["apps/admin/messages/en.ts", "TryAWS.now Admin"],
    ["apps/web/public/brand/logo.svg", 'aria-label="TryAWS.now"'],
    ["apps/admin/public/brand/logo.svg", 'aria-label="TryAWS.now"'],
  ]) {
    expect(readFileSync(file, "utf8"), file).toContain(part);
  }
});

// WPU-Z8: the brand is written exactly "TryAWS.now" (capital T, A, W, S; ".now" in lower case), in Latin
// letters in both locales. The all-lower-case "tryaws.now" is the domain name (out of this rule).
it("writes the brand exactly TryAWS.now in every customer-facing file", () => {
  const wrong = [];
  for (const file of customerFacing()) {
    for (const m of readFileSync(file, "utf8").matchAll(/try[\s_-]*aws[\s_-]*\.?[\s_-]*now/gi)) {
      if (m[0] !== "TryAWS.now" && m[0] !== "tryaws.now") wrong.push(`${file}: ${m[0]}`);
    }
  }
  expect(wrong).toEqual([]);
});

// WPU-Y6 (owner, 2026-11-14): the company is TryAWS.now on every page, in every e-mail, invoice, GEO file
// and JSON-LD: never "TiCON System Limited" / "TiCON System Ltd". A deliberate deviation from 16.14 of the
// spec, which names the old legal entity. The BIN and the trade licence are written exactly as given.
const OLD_COMPANY = /TiCON\s+System\s+(Limited|Ltd)|TICON\s+SYSTEM\s+(LIMITED|LTD)|টিকন\s+সিস্টেম/i;

const crawlerVisible = () => {
  const files = [...customerFacing()];
  for (const dir of ["apps/web/app", "apps/admin/app", "packages/ui/shells", "functions"]) {
    if (existsSync(dir)) {
      files.push(...walk(dir).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)));
    }
  }
  for (const name of readdirSync("apps/web/public")) {
    const p = join("apps/web/public", name);
    if (statSync(p).isFile()) files.push(p);
  }
  files.push("omnirank.config.json", "packages/core/invoices/seller.ts");
  return files;
};

it("no page, message, template, invoice, GEO file or JSON-LD names the old company (WPU-Y6)", () => {
  const files = crawlerVisible();
  expect(files).toContain("apps/web/public/llms.txt");
  expect(files).toContain("apps/web/public/facts.json");
  const hits = files.filter((f) => OLD_COMPANY.test(readFileSync(f, "utf8")));
  expect(hits).toEqual([]);
});

it("the company is TryAWS.now with its BIN and trade licence where the legal entity is printed (WPU-Y6)", () => {
  for (const file of [
    "packages/ui/shells/messages/en.ts",
    "packages/ui/shells/messages/bn.ts",
    "packages/notify/templates/messages.ts",
    "apps/web/public/llms.txt",
    "apps/web/public/llms-full.txt",
    "apps/web/public/facts.json",
  ]) {
    const text = readFileSync(file, "utf8");
    expect(text, file).toContain("000000000-0000");
    expect(text, file).toContain("TRAD/DNCC/000000/2000");
  }
  for (const file of ["packages/ui/shells/messages/en.ts", "packages/ui/shells/messages/bn.ts"]) {
    const text = readFileSync(file, "utf8");
    expect(text, file).toContain('companyName: "TryAWS.now"');
    expect(text, file).toContain('bin: "BIN: 000000000-0000"');
    expect(text, file).toContain('tradeLicense: "Trade License: TRAD/DNCC/000000/2000"');
  }
  expect(readFileSync("apps/web/public/facts.json", "utf8")).toContain('"legalName": "TryAWS.now"');
});

// WPU-Y6 (owner, 2026-11-14): the internal name of the first brand is gone too: the SST app is
// "tryaws-now" and every text says TryAWS.now. Kept on purpose: the specification and the plans it was
// split from (docs/spec, TICON_CLOUD_MEGA_PLAN.md and the first Bengali launch plan), the mockup, the
// JOURNEY.md history, the migrations already on main, and the dated records of earlier sessions
// (docs/audit, docs/analysis, docs/superpowers). The package scope @tc/*, the AWS names tc-<type>-<id>
// (R11) and the TC_* variables are other names and are not scanned for.
const OLD_INTERNAL = /TiCON[ ]Cloud|ticon[-]cloud/i;
const KEPT = [
  /^docs\/spec\//,
  /^TICON_CLOUD_MEGA_PLAN\.md$/,
  /^TiCON\sCloud Lightsail .*\.md$/,
  /^design\/mockup\//,
  /^JOURNEY\.md$/,
  /^packages\/db\/migrations\//,
  /^docs\/(audit|analysis|superpowers)\//,
  // names the first Bengali launch plan by its file name, to prove that prettier leaves it alone
  /^tests\/repo\/ignored-files\.test\.mjs$/,
];

it("no file outside the kept records names the first brand or its SST app (WPU-Y6)", () => {
  const listed = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
  expect(listed.status).toBe(0);
  const files = listed.stdout.split("\0").filter((f) => f !== "" && !KEPT.some((k) => k.test(f)));
  expect(files.length).toBeGreaterThan(500);
  const hits = files.filter((f) => existsSync(f) && OLD_INTERNAL.test(readFileSync(f, "utf8")));
  expect(hits).toEqual([]);
});

it("the SST app is tryaws-now (WPU-Y6)", () => {
  expect(readFileSync("infra/app.ts", "utf8")).toContain('name: "tryaws-now"');
});
