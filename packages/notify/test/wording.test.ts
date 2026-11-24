import { describe, expect, it } from "vitest";
import { checkWording, flatLeaves } from "../../../apps/web/messages/wording-check";
import { otpSmsText } from "../sms/otp-text";
import { COGNITO_TEXTS } from "../templates/cognito";
import { BN, EN, SHARED } from "../templates/messages";

// WP9-T5: the email and SMS texts follow the same wording rules as the screens (U5, U6, 16.13,
// 16.14): bn and en have the same keys and placeholders, no empty text, no English left in bn, no
// AWS account id, ARN, raw AWS error or internal name, and the exact marks.
type Tree = Parameters<typeof checkWording>[0];
const tree = (value: unknown): Tree => value as Tree;
const show = (f: readonly { key: string; rule: string; text: string }[]): string[] =>
  f.map((x) => `${x.rule}  ${x.key}  ${x.text.slice(0, 90)}`);

describe("notify wording (WP9-T5)", () => {
  it("template catalogs: same keys, placeholders and wording rules in bn and en", () => {
    expect(show(checkWording(tree({ t: BN }), tree({ t: EN })))).toEqual([]);
    expect(flatLeaves(tree({ t: BN })).size).toBeGreaterThan(100);
  });

  it("WPU-D4: the three Cognito messages follow the same wording rules in bn and en", () => {
    const bn = tree({
      c: Object.fromEntries(Object.entries(COGNITO_TEXTS).map(([k, v]) => [k, v.bn])),
    });
    const en = tree({
      c: Object.fromEntries(Object.entries(COGNITO_TEXTS).map(([k, v]) => [k, v.en])),
    });
    // the code and the user name are Cognito's own placeholders, replaced by Cognito after our answer
    expect(show(checkWording(bn, en))).toEqual([]);
    expect(flatLeaves(bn).size).toBeGreaterThanOrEqual(15);
  });

  it("shared footer texts: same keys and rules; statements of 16.13 stay unchanged", () => {
    const findings = checkWording(tree({ s: SHARED.bn }), tree({ s: SHARED.en }), {
      sameInBoth: [
        { key: "s.wordmark", reason: "brand" },
        { key: "s.trademark", reason: "16.13: the trademark line is English in both locales" },
        { key: "s.address", reason: "postal address of the company, in Latin" },
        { key: "s.regions.*", reason: "AWS Region names are shown in English in the shared text" },
      ],
    });
    expect(show(findings.filter((f) => !f.key.startsWith("s.regions.")))).toEqual([]);
    expect(SHARED.bn.awsShort).toBe("১০০% AWS অবকাঠামো। Amazon Lightsail দিয়ে তৈরি।");
    expect(SHARED.en.awsShort).toBe("100% AWS infrastructure. Built on Amazon Lightsail.");
  });

  it("WPU-Z8: the brand PanelPay opens every SMS and is the wordmark and the footer note of every email", () => {
    let sms = 0;
    for (const catalog of [BN, EN]) {
      for (const [id, text] of Object.entries(catalog)) {
        if (text.sms === undefined) continue;
        expect(text.sms.startsWith("PanelPay: "), id).toBe(true);
        sms += 1;
      }
    }
    expect(sms).toBeGreaterThanOrEqual(20);
    expect(SHARED.bn.wordmark).toBe("PanelPay");
    expect(SHARED.en.wordmark).toBe("PanelPay");
    expect(SHARED.bn.footerNote).toBe(
      "এই বার্তাটি আপনার PanelPay অ্যাকাউন্টের জন্য পাঠানো হয়েছে।",
    );
    expect(SHARED.en.footerNote).toBe("This message was sent for your PanelPay account.");
    for (const [kind, texts] of Object.entries(COGNITO_TEXTS)) {
      expect(texts.bn.subject.startsWith("PanelPay"), kind).toBe(true);
      expect(texts.en.subject.startsWith("PanelPay"), kind).toBe(true);
    }
  });

  it("OTP SMS text: the gateway's English format for every locale (WPU-Z3), with the brand PanelPay, no link, no other AWS name", () => {
    const text = otpSmsText("123456");
    expect(text.startsWith("PanelPay ")).toBe(true);
    expect(text).not.toMatch(/https?:|www\./i);
    // 16.13: the owner's exception (2026-11-13) covers the exact token PanelPay and nothing else
    expect(text.replace("PanelPay", "")).not.toMatch(/AWS|Amazon|Lightsail/i);
    expect(text).not.toMatch(/[ঀ-৿]/);
  });
});
