// BRAND-2 (owner, 2026-11-24): the product brand is PanelPay, after TryAWS.now (WPU-Z8, rejected by AWS
// Marketplace for the AWS mark inside the name), MeghVPS (WPU-B1) and the first brand name before them. No old
// brand name may return to any text a customer reads. WPU-Y6: the company is PanelPay too (below). Technical names (tc- prefixes, TiCON-Pools-Dev, ticon-log-protection, @tc/*)
// stay and are not scanned for.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const OLD = /TiCON\s+Cloud|টিকন\s+ক্লাউড/i;
// WPU-Z8, BRAND-2: the brands of WPU-B1 and WPU-Z8, replaced by PanelPay. The all-lower-case domain name
// "tryaws.now" is not the brand and is not matched (case-sensitive "TryAWS").
const FORMER = /MeghVPS|মেঘ\s*ভিপিএস|TryAWS|ট্রাই\s*এডব্লিউএস/;

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

it("no customer-facing message, template, logo or invoice text says MeghVPS or TryAWS.now (WPU-Z8, BRAND-2)", () => {
  const files = customerFacing();
  expect(files.length).toBeGreaterThan(20);
  const hits = files.filter((f) => FORMER.test(readFileSync(f, "utf8")));
  expect(hits).toEqual([]);
});

it("the brand is PanelPay in the shell, the admin title, the mail wordmark, the SMS, the invoice and the site name", () => {
  for (const [file, part] of [
    ["packages/ui/shells/messages/en.ts", 'brand: "PanelPay"'],
    ["packages/ui/shells/messages/bn.ts", 'brand: "PanelPay"'],
    ["packages/notify/templates/messages.ts", 'wordmark: "PanelPay"'],
    ["packages/notify/sms/otp-text.ts", "`PanelPay Your OTP is: "],
    ["packages/core/invoices/render.ts", '"PanelPay sells, bills and supports the service."'],
    ["apps/web/server/public/seo.ts", 'SITE_NAME = "PanelPay"'],
    ["apps/admin/messages/en.ts", "PanelPay Admin"],
    ["apps/web/public/brand/logo.svg", 'aria-label="PanelPay"'],
    ["apps/admin/public/brand/logo.svg", 'aria-label="PanelPay"'],
  ]) {
    expect(readFileSync(file, "utf8"), file).toContain(part);
  }
});

// BRAND-2: the brand is written exactly "PanelPay" (capital P twice), in Latin letters in both locales.
it("writes the brand exactly PanelPay in every customer-facing file", () => {
  const wrong = [];
  for (const file of customerFacing()) {
    for (const m of readFileSync(file, "utf8").matchAll(/panel[\s_-]*pay/gi)) {
      if (m[0] !== "PanelPay" && m[0] !== "panelpay") wrong.push(`${file}: ${m[0]}`);
    }
  }
  expect(wrong).toEqual([]);
});

// WPU-Y6 (owner, 2026-11-14): the company is PanelPay on every page, in every e-mail, invoice, GEO file
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

it("the company is PanelPay with its BIN and trade licence where the legal entity is printed (WPU-Y6)", () => {
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
    expect(text, file).toContain('companyName: "PanelPay"');
    expect(text, file).toContain('bin: "BIN: 000000000-0000"');
    expect(text, file).toContain('tradeLicense: "Trade License: TRAD/DNCC/000000/2000"');
  }
  expect(readFileSync("apps/web/public/facts.json", "utf8")).toContain('"legalName": "PanelPay"');
});

// WPU-Y6 (owner, 2026-11-14): the internal name of the first brand is gone too: the SST app is
// "tryaws-now" and every text says PanelPay. Kept on purpose: the specification and the plans it was
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
