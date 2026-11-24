import { forbiddenWording, messageKeys } from "@tc/ui";
import type { Messages } from "@tc/ui/runtime";
import { describe, expect, it } from "vitest";
import { webMessages } from "../i18n/messages.ts";
import { supportBn } from "./support-bn.ts";
import { supportEn } from "./support-en.ts";

describe("support form messages (WP9-T4b)", () => {
  it("bn and en have the same keys, none empty, and no forbidden wording", () => {
    expect(messageKeys(supportBn)).toEqual(messageKeys(supportEn));
    for (const tree of [supportBn, supportEn]) {
      expect(forbiddenWording(tree)).toEqual([]);
      for (const key of messageKeys(tree)) {
        const value = key
          .split(".")
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], tree);
        expect(typeof value === "string" && value.trim().length > 0, key).toBe(true);
      }
    }
  });

  it("has a text for every category and every error the action can answer with", () => {
    const form = supportBn.SupportForm.form.category as Record<string, string>;
    expect(Object.keys(form).sort()).toEqual(
      ["legend", "billing", "technical", "kyc", "domain", "abuse", "other"].sort(),
    );
    expect(Object.keys(supportBn.SupportForm.error).sort()).toEqual(
      ["unauthenticated", "validation", "rate_limited", "forbidden", "unavailable"].sort(),
    );
  });

  it("is composed in both locales with Bengali text in bn", () => {
    for (const locale of ["bn", "en"] as const)
      expect(webMessages[locale]["SupportForm"]).toBeDefined();
    expect((webMessages.bn["SupportForm"] as Messages)["heading"] as string).toMatch(/[ঀ-৿]/);
  });
});

describe("support request messages (WPU-Z6)", () => {
  it("has a text for every error the thread actions can answer with", () => {
    expect(Object.keys(supportBn.SupportRequests.error).sort()).toEqual(
      [
        "unauthenticated",
        "validation",
        "not_found",
        "conflict",
        "rate_limited",
        "forbidden",
        "unavailable",
      ].sort(),
    );
  });

  it("signs support's replies with the brand only, never a person, in both locales", () => {
    expect(supportEn.SupportRequests.thread.author).toEqual({
      customer: "You",
      visitor: "Sent from the public support form",
      admin: "PanelPay support",
    });
    expect(supportBn.SupportRequests.thread.author.admin).toBe("PanelPay সাপোর্ট");
  });

  // Final review (Z6 minors).
  it("labels a visitor's entry neutrally, names an unknown status, and says where the answer appears", () => {
    expect(supportBn.SupportRequests.thread.author.visitor).toBe(
      "সর্বজনীন সাপোর্ট ফর্ম থেকে পাঠানো",
    );
    expect(supportBn.SupportRequests.thread.author.visitor).not.toBe(
      supportBn.SupportRequests.thread.author.customer,
    );
    expect(supportEn.SupportForm.status.unknown).toBe("Status unknown");
    expect(supportBn.SupportForm.status.unknown).toBe("অবস্থা জানা নেই");
    // signed in: the answer is in the support requests; e-mail is said to visitors only (Public namespace)
    expect(supportEn.SupportForm.intro).toMatch(/in your support requests/);
    expect(supportEn.SupportForm.done.body).toMatch(/appears in your support requests/);
    expect(supportBn.SupportForm.intro).toMatch(/সাপোর্ট অনুরোধে/);
    expect(supportBn.SupportForm.done.body).toMatch(/সাপোর্ট অনুরোধে/);
    for (const text of [
      supportEn.SupportForm.intro,
      supportEn.SupportForm.done.body,
      supportBn.SupportForm.intro,
      supportBn.SupportForm.done.body,
    ]) {
      expect(text).not.toMatch(/e-?mail|ইমেইল/i);
    }
  });

  it("states that a reply opens a closed request again, in both locales", () => {
    expect(supportEn.SupportRequests.reply.rule).toMatch(/opens a closed/);
    expect(supportEn.SupportRequests.thread.closed).toMatch(/opens it again/);
    expect(supportBn.SupportRequests.reply.rule).toMatch(/আবার খোলা/);
    expect(supportBn.SupportRequests.thread.closed).toMatch(/আবার খুলবে/);
  });

  it("is composed in both locales with Bengali text in bn", () => {
    for (const locale of ["bn", "en"] as const)
      expect(webMessages[locale]["SupportRequests"]).toBeDefined();
    expect((webMessages.bn["SupportRequests"] as Messages)["heading"] as string).toMatch(/[ঀ-৿]/);
  });
});
