import { describe, expect, it } from "vitest";
import { NotifyError, TEMPLATE_IDS } from "../queue/types";
import { BN, EN, SHARED } from "../templates/messages";
import {
  channelsOf,
  parseTemplateData,
  renderEmail,
  renderInApp,
  renderSms,
  type RenderContext,
} from "../templates/render";
import { smsLength, scanSecrets } from "../text/guards";
import { SAMPLES, WITHOUT_SMS } from "./samples";

const ctx = (locale: "bn" | "en", numerals: "beng" | "latn" = "beng"): RenderContext => ({
  locale,
  numerals,
  panelOrigin: "https://my.ticoncloud.test",
});
const parsed = (id: (typeof TEMPLATE_IDS)[number], data = SAMPLES[id].data) =>
  parseTemplateData(id, data);

describe.each(TEMPLATE_IDS)("template %s", (id) => {
  it("has the channels of 16.14", () => {
    expect([...channelsOf(id, parsed(id))]).toEqual(SAMPLES[id].channels);
  });

  it.each(["bn", "en"] as const)(
    "renders every channel in %s with no placeholder left",
    (locale) => {
      const data = parsed(id);
      const email = renderEmail(id, data, ctx(locale));
      expect(email.subject.length).toBeGreaterThan(0);
      for (const s of [
        email.subject,
        email.text,
        email.html,
        JSON.stringify(renderInApp(id, data, ctx(locale))),
      ]) {
        expect(s).not.toMatch(/\{[A-Za-z]+\}/);
      }
      // the AWS statement and the trademark line of 16.13, unchanged, in the footer
      // (the digit one of the Bengali text is wrapped in its own span, WPU-F1: compare without it)
      expect(email.html.replace(/<span style="[^"]*">১<\/span>/g, "১")).toContain(
        SHARED[locale].awsShort,
      );
      expect(email.text).toContain(SHARED[locale].trademark);
      // table layout and inline CSS only: no style element, no script, no external origin
      expect(email.html).toContain("<table");
      expect(email.html).not.toMatch(
        /<style|<script|<link|<img|https?:\/\/(?!my\.ticoncloud\.test)/,
      );
      expect(email.html).not.toContain("AWS Lightsail");
      const sms = renderSms(id, data, ctx(locale));
      if (SAMPLES[id].channels.includes("sms")) {
        expect(sms).not.toBeNull();
        expect(sms).not.toMatch(/\{[A-Za-z]+\}/);
        expect(sms).not.toMatch(/https?:/);
        const len = smsLength(sms as string);
        expect(len.chars).toBeLessThanOrEqual(160);
        // an English SMS stays GSM-7
        if (locale === "en") expect(len.encoding).toBe("gsm7");
      } else {
        expect(sms).toBeNull();
      }
    },
  );

  it("holds no secret, no full phone, no email, in any locale", () => {
    for (const locale of ["bn", "en"] as const) {
      const data = parsed(id);
      const email = renderEmail(id, data, ctx(locale));
      expect(scanSecrets(email.subject)).toBeNull();
      expect(scanSecrets(email.text.replace(SHARED[locale].trademark, ""))).toBeNull();
      expect(scanSecrets(renderInApp(id, data, ctx(locale)).body)).toBeNull();
    }
  });

  it("links to the panel's own domain, with /en for English and no query", () => {
    const bn = renderInApp(id, parsed(id), ctx("bn")).href;
    const en = renderInApp(id, parsed(id), ctx("en")).href;
    expect(bn.startsWith("https://my.ticoncloud.test/")).toBe(true);
    expect(en.startsWith("https://my.ticoncloud.test/en/")).toBe(true);
    expect(bn + en).not.toMatch(/[?#]/);
  });

  it("refuses an undeclared field, such as a password, a token or an OTP", () => {
    for (const k of ["password", "token", "otp", "temporaryPassword"]) {
      expect(() => parseTemplateData(id, { ...SAMPLES[id].data, [k]: "x" })).toThrow(NotifyError);
    }
  });
});

// WPU-Y6 (owner, 2026-11-14): every e-mail footer names the company PanelPay with its BIN and trade
// licence, exactly as the owner gave them, never the old legal name.
it("the e-mail footer names the company PanelPay with its BIN and trade licence", () => {
  for (const locale of ["bn", "en"] as const) {
    const address = SHARED[locale].address;
    expect(address.startsWith("PanelPay, ")).toBe(true);
    expect(address).toContain("BIN: 000000000-0000");
    expect(address).toContain("Trade License: TRAD/DNCC/000000/2000");
    const id = TEMPLATE_IDS[0];
    const email = renderEmail(id, parsed(id), ctx(locale));
    for (const part of [email.text, email.html]) {
      expect(part).toContain("BIN: 000000000-0000");
      expect(part).not.toMatch(/TiCON System/i);
    }
  }
});

it("the two catalogs have the same placeholders in every string", () => {
  const names = (s: string) => [...s.matchAll(/\{([A-Za-z]+)\}/g)].map((m) => m[1]).sort();
  for (const id of TEMPLATE_IDS) {
    const strings = (c: typeof BN) => ({
      subject: names(c[id].subject),
      headline: names(c[id].headline),
      body: c[id].body.map(names),
      sms: c[id].sms === undefined ? null : names(c[id].sms),
      extra: Object.keys(c[id].extra ?? {}).sort(),
    });
    expect(strings(BN), id).toEqual(strings(EN));
  }
});

it("no catalog string holds a forbidden form of the AWS names", () => {
  const all = JSON.stringify([BN, EN, SHARED]);
  expect(all).not.toMatch(/AWS Lightsail|AWS-Lightsail|AWSLightsail/);
  // no internal resource name, no account id, no ARN
  expect(all).not.toMatch(/\btc-[a-z]+-|arn:aws|\b\d{12}\b/);
});

it("an SMS is the same set for the rows where 16.14 says 'at 1 day' or 'at 7 days'", () => {
  for (const [id, data] of Object.entries(WITHOUT_SMS)) {
    const t = id as (typeof TEMPLATE_IDS)[number];
    expect(renderSms(t, parseTemplateData(t, data), ctx("en"))).toBeNull();
    expect(channelsOf(t, parseTemplateData(t, data))).toEqual(["email", "in_app"]);
  }
});

describe("hostile customer text", () => {
  const hostile = `<script>alert(1)</script>"'&{amount}`;
  it("a label that is not letters, digits and hyphen is refused", () => {
    expect(() =>
      parseTemplateData("resource_ready", { ...SAMPLES.resource_ready.data, label: hostile }),
    ).toThrow(NotifyError);
  });
  it("a KYC reason appears as escaped text, never as markup, and {amount} stays literal", () => {
    const data = parseTemplateData("kyc_rejected", {
      submissionId: SAMPLES.kyc_rejected.data.submissionId,
      reason: hostile,
    });
    const html = renderEmail("kyc_rejected", data, ctx("en")).html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;{amount}");
  });
  it("a reason with a right-to-left override or a control character is refused", () => {
    for (const reason of ["a‮b", "a\u0000b", "a​b"]) {
      expect(() =>
        parseTemplateData("kyc_rejected", { ...SAMPLES.kyc_rejected.data, reason }),
      ).toThrow(NotifyError);
    }
  });
});

describe("formats", () => {
  it("Bengali numerals by default in bn, Latin when the market says so, never in en", () => {
    const data = parsed("topup_receipt");
    expect(renderEmail("topup_receipt", data, ctx("bn", "beng")).text).toContain("৳১,৫০০.০০");
    expect(renderEmail("topup_receipt", data, ctx("bn", "latn")).text).toContain("৳1,500.00");
    expect(renderEmail("topup_receipt", data, ctx("en", "beng")).text).toContain("BDT 1,500.00");
  });
  it("a date is the Dhaka date", () => {
    expect(renderEmail("topup_receipt", parsed("topup_receipt"), ctx("en")).text).toContain(
      "11 Nov 2026",
    );
  });
  it("technical values stay Latin in Bengali: an invoice number and an IP address", () => {
    expect(renderEmail("order_paid", parsed("order_paid"), ctx("bn", "beng")).text).toContain(
      "TC-2026-000123",
    );
    expect(
      renderEmail("security_new_sign_in", parsed("security_new_sign_in"), ctx("bn", "beng")).text,
    ).toContain("203.0.113.7");
  });
  it("the order failed message says what failed, the refund and the new balance", () => {
    const t = renderEmail(
      "order_failed_refunded",
      parsed("order_failed_refunded"),
      ctx("en", "latn"),
    ).text;
    expect(t).toContain("could not be created");
    expect(t).toContain("BDT 999.00");
    expect(t).toContain("BDT 3,000.00");
  });
  it("the grace message says until when, the amount and the balance", () => {
    const t = renderEmail("grace_started", parsed("grace_started"), ctx("en", "latn")).text;
    expect(t).toContain("11 Nov 2026");
    expect(t).toContain("BDT 999.00");
  });
});
