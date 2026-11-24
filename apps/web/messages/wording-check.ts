type Messages = { readonly [key: string]: string | Messages };
interface WordingAllow {
  readonly key: string;
  readonly reason: string;
}

// WP9-T5 machine check of the wording rules (U5, U6, 16.13, R11, R14) over composed message trees.

export interface Finding {
  readonly key: string;
  readonly rule: string;
  readonly text: string;
}

export function flatLeaves(tree: Messages): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: Messages, prefix: string): void => {
    for (const [name, value] of Object.entries(node)) {
      const path = prefix === "" ? name : `${prefix}.${name}`;
      if (typeof value === "string") out.set(path, value);
      else walk(value, path);
    }
  };
  walk(tree, "");
  return out;
}

const BENGALI = /[ঀ-৿]/;
// BRAND-2 (owner, 2026-11-24): the brand is "PanelPay". The former brand (WPU-Z8) put the AWS mark inside a
// product and a domain name, and AWS Marketplace rejected the listing for it (16.13), so the old exception for
// that token is gone: "aws-in-name" below now catches every name with AWS inside it, the former brand included.
// Brand and product marks that stay in Latin script inside Bengali text (16.13).
const TOKENS =
  /PanelPay|TiCON|Amazon Lightsail|Amazon Route 53|Amazon Web Services|Amazon\.com, Inc\.|AWS|KYC|EPS|SSH|TOTP|DNS|CDN|HTTPS?|IPv[46]|IP|SMS|OTP|PDF|CSV|API|URL|TLS|SSL|MX|TXT|CNAME|NS|SOA|CAA|SRV|ICMP|TCP|UDP|BDT|GB|MB|TB|vCPU|RAM|SSD|bKash|Nagad|Rocket|Windows|Linux|Ubuntu|Debian|MySQL|PostgreSQL|WordPress|Docker|Node\.js|Cognito|Singapore|Mumbai|Virginia|ap-[a-z]+-\d|us-east-1/g;

/** True when the text holds no word that a translator would change. */
export function isLanguageNeutral(text: string): boolean {
  const rest = text
    .replace(/\{[^}]*\}/g, " ")
    .replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+/g, " ")
    .replace(TOKENS, " ")
    .replace(/[\d\s\p{P}\p{S}]+/gu, " ")
    .trim();
  return rest === "" || !/[\p{L}]/u.test(rest);
}

export const placeholdersOf = (text: string): string[] =>
  [...new Set([...text.matchAll(/\{\s*(\w+)/g)].map((m) => m[1] as string))].sort();

const allowed = (list: readonly WordingAllow[], key: string): boolean =>
  list.some((a) =>
    a.key.endsWith(".*")
      ? key.startsWith(a.key.slice(0, -1))
      : a.key.startsWith("*.")
        ? key.endsWith(a.key.slice(1))
        : a.key === key,
  );

// Raw AWS error codes never reach customer text (U6).
const AWS_ERROR =
  /\b(AccessDenied(?:Exception)?|InvalidParameter\w*|ThrottlingException|ResourceNotFound\w*|ServiceException|InvalidInput\w*|OperationFailure\w*|UnauthenticatedException|NotFoundException|InternalFailure|RequestLimitExceeded|ValidationException)\b/;

// `except` is removed from the text before `test` runs.
const FORBIDDEN: readonly { rule: string; test: RegExp; except?: RegExp }[] = [
  { rule: "arn", test: /arn:aws[\w-]*:/i },
  { rule: "account-id", test: /(?<![\d.])\d{12}(?![\d])/ },
  { rule: "aws-error-code", test: AWS_ERROR },
  { rule: "internal-name", test: /\btc-[a-z]+-[a-z0-9]{3,}/i },
  { rule: "aws-lightsail", test: /\bAWS[\s-]*Lightsail/i },
  { rule: "bare-lightsail", test: /(?<!Amazon )Lightsail/ },
  { rule: "joined-mark", test: /\b(?:AWS|Amazon)(?:Lightsail|Route53)\b|Amazon-Lightsail/i },
  // 16.13 "Exact marks" and "Own brand first": AWS is never joined or hyphenated with another word, so it
  // is never part of a name ("MyAWS", "AWS-Hosting", "MyAWS.now"). A Bengali case ending ("AWS-এর") is
  // not a word.
  {
    rule: "aws-in-name",
    test: /[A-Za-z0-9][.-]?AWS|AWS[.-]?[A-Za-z0-9]/,
  },
  { rule: "route53", test: /(?<!Amazon )Route\s?53|Route53/ },
  { rule: "powered-by-aws", test: /powered\s+by\s+(?:AWS|Amazon)/i },
  {
    rule: "aws-endorses",
    test: /\b(?:AWS|Amazon)\s+(?:sells|supports|sponsors|endorses|certified|approved)\b/i,
  },
  { rule: "aws-endorses", test: /(?:official|authorized|authorised)\s+(?:AWS|Amazon)\b/i },
  {
    // the brand (or the company) followed by an AWS mark, as if AWS were part of the product's name
    rule: "ticon-aws-product",
    test: /(?:PanelPay|TiCON)\s+(?:AWS|Lightsail)|(?:PanelPay|TiCON)'s\s+AWS/i,
  },
  {
    rule: "aws-sku-name",
    test: /\bAWS\s+(?:Cloud Server|Managed Database|Block Storage|Object Storage)/i,
  },
  {
    rule: "todo",
    test: /\bTODO\b|\bFIXME\b|lorem ipsum|\blorem\b|\[legal text pending\]|\bTBD\b/i,
  },
];

export interface CheckOptions {
  readonly sameInBoth?: readonly WordingAllow[];
  readonly latinOnlyBn?: readonly WordingAllow[];
  /** Keys under these prefixes may hold the legal placeholders. */
  readonly legalPrefixes?: readonly string[];
}

export function checkWording(bn: Messages, en: Messages, opts: CheckOptions = {}): Finding[] {
  const found: Finding[] = [];
  const b = flatLeaves(bn);
  const e = flatLeaves(en);
  for (const key of b.keys()) {
    if (!e.has(key)) found.push({ key, rule: "missing-in-en", text: b.get(key) as string });
  }
  for (const key of e.keys()) {
    if (!b.has(key)) found.push({ key, rule: "missing-in-bn", text: e.get(key) as string });
  }
  const legal = opts.legalPrefixes ?? [];
  for (const [key, bnText] of b) {
    const enText = e.get(key);
    if (enText === undefined) continue;
    if (bnText.trim() === "") found.push({ key, rule: "empty-bn", text: bnText });
    if (enText.trim() === "") found.push({ key, rule: "empty-en", text: enText });
    if (bnText.trim() !== "" && bnText === enText && !isLanguageNeutral(bnText)) {
      if (!allowed(opts.sameInBoth ?? [], key)) {
        found.push({ key, rule: "same-in-both", text: bnText });
      }
    }
    if (
      bnText !== enText &&
      !BENGALI.test(bnText) &&
      !isLanguageNeutral(bnText) &&
      !allowed(opts.latinOnlyBn ?? [], key)
    ) {
      found.push({ key, rule: "latin-only-bn", text: bnText });
    }
    // A run of three Latin words inside Bengali text is an English sentence that was not translated.
    if (
      BENGALI.test(bnText) &&
      /(?:\b[A-Za-z]{2,}\b[ ,]+){2}\b[A-Za-z]{2,}\b/.test(
        bnText
          .replace(/\{[^}]*\}/g, " ")
          .replace(TOKENS, " ")
          .replace(/Amazon|Web|Services/g, " "),
      ) &&
      !allowed(opts.latinOnlyBn ?? [], key)
    ) {
      found.push({ key, rule: "english-run-in-bn", text: bnText });
    }
    if (placeholdersOf(bnText).join() !== placeholdersOf(enText).join()) {
      found.push({ key, rule: "placeholder-mismatch", text: `${bnText} | ${enText}` });
    }
    const isLegal = legal.some((p) => key.startsWith(p));
    for (const [text, locale] of [
      [bnText, "bn"],
      [enText, "en"],
    ] as const) {
      for (const { rule, test, except } of FORBIDDEN) {
        if (rule === "todo" && isLegal) continue;
        const subject = except === undefined ? text : text.replace(except, " ");
        if (test.test(subject)) found.push({ key, rule: `${rule}(${locale})`, text });
      }
    }
  }
  return found;
}
