import { NextIntlClientProvider, createTranslator } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Locale } from "@tc/ui/runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { webMessages } from "../../../../../i18n/messages.ts";
import type { TopUpScreen } from "../../../../../server/topup-view.ts";
import { payment } from "../wallet.fixtures.ts";

const state = vi.hoisted(() => ({
  locale: "bn" as "bn" | "en",
  panelRedirect: null as string | null,
  screen: null as unknown,
  eps: true as boolean | "throws",
  loadCalls: 0,
}));

vi.mock("next-intl/server", async () => {
  const { webMessages: messages } = await import("../../../../../i18n/messages.ts");
  return {
    getTranslations: async (options?: { locale?: "bn" | "en" }) =>
      createTranslator({
        locale: options?.locale ?? state.locale,
        messages: messages[options?.locale ?? state.locale],
      }),
  };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("../../../../../server/panel.ts", () => ({
  requirePanel: async () => {
    if (state.panelRedirect !== null) throw new Error(`REDIRECT:${state.panelRedirect}`);
    return {
      session: { customerId: "11111111-1111-4111-8111-111111111111" },
      displayName: "Rahim",
      balanceMinor: 150000n,
      market: { code: "BD", numerals: "beng" },
      enabledFamilies: ["cloudServers"],
      soonFamilies: [],
    };
  },
}));
vi.mock("../../../../../server/topup-view.ts", () => ({
  loadTopUp: async () => {
    state.loadCalls += 1;
    return state.screen;
  },
}));
vi.mock("../../../../../server/runtime.ts", () => ({
  getRuntime: async () => {
    if (state.eps === "throws") throw new Error("config: TC_STAGE is missing");
    return { config: {}, eps: state.eps ? {} : null };
  },
}));
// The Server Action is replaced: the form only needs a function to post to.
vi.mock("./actions.ts", () => ({ startTopUpAction: async () => ({ status: "idle" }) }));

const { default: TopUpPage } = await import("./page.tsx");
const { TopUpFormView, quickText } = await import("./TopUpForm.tsx");

const RANGE = { minMinor: 10000n, maxMinor: 5000000n };
const open = (over: Partial<TopUpScreen> = {}): TopUpScreen => ({
  market: { code: "BD" } as never,
  range: RANGE,
  quick: [50000n, 100000n, 500000n],
  open: [],
  ...over,
});

/** React adds one bootstrap script for a form whose action is a plain function; a real Server Action carries a URL instead. */
function withoutFormReplay(html: string): string {
  return html.replace(/<script>addEventListener\("submit".*?<\/script>/s, "");
}

function intl(node: ReactNode, locale: Locale): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={webMessages[locale]} timeZone="Asia/Dhaka">
      {node}
    </NextIntlClientProvider>,
  );
}

async function render(locale: Locale): Promise<string> {
  state.locale = locale;
  const element = await TopUpPage({ params: Promise.resolve({ locale }) });
  return intl(element, locale);
}

beforeEach(() => {
  state.locale = "bn";
  state.panelRedirect = null;
  state.screen = open();
  state.eps = true;
  state.loadCalls = 0;
});

describe("/wallet/topup: the form", () => {
  it("shows the minimum and the maximum through formatMoney, in the digits of the language", async () => {
    const bn = await render("bn");
    expect(bn).toContain("সর্বনিম্ন ৳১০০.০০, সর্বোচ্চ ৳৫০,০০০.০০");
    expect(bn).toContain("টাকার পরিমাণ (৳)");
    expect(bn).toContain("EPS দিয়ে পেমেন্ট করুন");
    const en = await render("en");
    expect(en).toContain("Minimum ৳100.00, maximum ৳50,000.00");
    expect(en).toContain("Pay with EPS");
  });

  it("the field is a text input for whole taka with a numeric keyboard and no autocomplete", async () => {
    const en = await render("en");
    expect(en).toMatch(/<input[^>]*name="amount"[^>]*>/);
    const input = en.match(/<input[^>]*name="amount"[^>]*>/)?.[0] ?? "";
    expect(input).toContain('type="text"');
    expect(input).toContain('inputMode="numeric"');
    expect(input).toContain('autoComplete="off"');
  });

  it("carries one idempotency key in a hidden field, new for each render", async () => {
    const key = (html: string) =>
      html.match(/<input type="hidden" name="idempotencyKey" value="([^"]+)"/)?.[1];
    const first = key(await render("en"));
    const second = key(await render("en"));
    expect(first).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    expect(first).not.toBe(second);
  });

  it("the submit button is a SubmitButton: a submit control the kit makes inert while the action runs (U8)", async () => {
    const en = await render("en");
    expect(en).toMatch(/<button[^>]*type="submit"[^>]*class="btn btn-default-yellow-fill"/);
  });

  it("quick amounts are radios only for two or more valid amounts", async () => {
    expect(await render("en")).toContain('name="quick"');
    expect(await render("en")).toContain('value="50000"');
    state.screen = open({ quick: [50000n] });
    expect(await render("en")).not.toContain('name="quick"');
    state.screen = open({ quick: [] });
    expect(await render("en")).not.toContain('name="quick"');
  });

  it("choosing a quick amount fills the field with whole taka, as text, without floats", () => {
    expect(quickText("50000")).toBe("500");
    expect(quickText("100000")).toBe("1000");
    expect(quickText("-1")).toBeNull();
    expect(quickText("12.5")).toBeNull();
    expect(quickText("")).toBeNull();
  });

  it("shows the typed amount live through MoneyText, and a dash while it cannot be read", () => {
    const view = (text: string, locale: Locale) =>
      intl(
        <TopUpFormView
          locale={locale}
          numerals={locale === "bn" ? "beng" : "latn"}
          range={RANGE}
          quick={[]}
          state={{ status: "idle", idempotencyKey: "key-0123456789" }}
          text={text}
          onText={() => {}}
          onFormChange={() => {}}
          formAction={() => {}}
        />,
        locale,
      );
    expect(view("1,500", "en")).toContain("৳1,500.00");
    expect(view("১৫০০", "bn")).toContain("৳১,৫০০.০০");
    expect(view("abc", "en")).toContain('aria-live="polite">—');
  });
});

describe("/wallet/topup: errors and states", () => {
  const stateView = (s: Parameters<typeof TopUpFormView>[0]["state"], locale: Locale = "en") =>
    intl(
      <TopUpFormView
        locale={locale}
        numerals={locale === "bn" ? "beng" : "latn"}
        range={RANGE}
        quick={[]}
        state={s}
        text="9"
        onText={() => {}}
        onFormChange={() => {}}
        formAction={() => {}}
      />,
      locale,
    );

  it("a field error is announced (role=alert) with an icon and words, and the typed text stays", () => {
    for (const field of ["required", "format", "too_low", "too_high"] as const) {
      const html = stateView({
        status: "error",
        idempotencyKey: "key-0123456789",
        field: { amount: field },
        requestId: "abcd1234",
      });
      expect(html, field).toMatch(
        /<p id="[^"]+-error" class="tc-field-error" role="alert"><i class="fas fa-exclamation-circle me-1" aria-hidden="true"><\/i><span class="visually-hidden">[^<]+<\/span>[A-Z]/,
      );
      expect(html, field).toContain('value="9"');
    }
    expect(
      stateView({
        status: "error",
        idempotencyKey: "key-0123456789",
        field: { amount: "too_low" },
        requestId: "abcd1234",
      }),
    ).toContain("The amount must be at least ৳100.00.");
  });

  it("EPS unavailable: a danger alert with an icon, the words, the reference id, and 'you were not charged'", () => {
    const html = stateView({
      status: "error",
      idempotencyKey: "key-0123456789",
      code: "unavailable",
      requestId: "abcd1234",
    });
    expect(html).toContain('class="alert alert-danger text-start" role="alert"');
    expect(html).toContain("fas fa-exclamation-triangle");
    expect(html).toContain("You were not charged");
    expect(html).toContain("Reference: abcd1234");
    const bn = stateView(
      {
        status: "error",
        idempotencyKey: "key-0123456789",
        code: "unavailable",
        requestId: "abcd1234",
      },
      "bn",
    );
    expect(bn).toContain("কোনো টাকা কাটা হয়নি");
  });

  it("rate limited: a warning alert that names the wait in seconds", () => {
    const html = stateView({
      status: "error",
      idempotencyKey: "key-0123456789",
      code: "rate_limited",
      retryAfterSeconds: 42,
      requestId: "abcd1234",
    });
    expect(html).toContain("alert alert-warning");
    expect(html).toContain("Try again in 42 seconds.");
  });

  it("not open (market inactive): no form, an empty state and a way back, no database read of payments", async () => {
    state.screen = open({ market: null, range: { minMinor: 0n, maxMinor: 0n }, quick: [] });
    for (const locale of ["bn", "en"] as const) {
      const html = await render(locale);
      expect(html).not.toContain("<form");
      expect(html).not.toContain('name="amount"');
      expect(html).toContain(locale === "bn" ? "টপ আপ এখনো চালু হয়নি" : "Top-up is not open yet");
      expect(html).toContain(locale === "bn" ? 'href="/en/wallet"' : 'href="/en/wallet"');
    }
  });

  it("not open (EPS not configured, or the configuration cannot be read): the same state, fail closed", async () => {
    state.eps = false;
    expect(await render("en")).not.toContain("<form action");
    state.eps = "throws";
    const html = await render("en");
    expect(html).toContain("Top-up is not open yet");
    expect(html).not.toContain("TC_STAGE");
  });

  it("lists payments waiting with links to their status pages", async () => {
    state.screen = open({
      open: [payment({ id: "0190aaaa-0000-7000-8000-000000000009", status: "redirected" })],
    });
    expect(await render("en")).toContain(
      'href="/en/wallet/topup/0190aaaa-0000-7000-8000-000000000009"',
    );
    state.screen = open();
    expect(await render("en")).not.toContain("Payments waiting");
  });

  it("explains how the payment works and that card details never reach PanelPay", async () => {
    const en = await render("en");
    expect(en).toContain("You are taken to the secure EPS page to pay.");
    expect(en).toContain("Card and mobile-wallet details never reach PanelPay.");
    const bn = await render("bn");
    expect(bn).toContain("কার্ড বা মোবাইল ওয়ালেটের তথ্য PanelPay-এ আসে না।");
  });
});

describe("/wallet/topup: the EPS badge (WPU-X21)", () => {
  it("shows the dark badge with its alt text and the caption, in bn and en", async () => {
    const en = await render("en");
    expect(en).toMatch(/<img[^>]*src="\/brand\/eps-pay-dark\.png"[^>]*>/);
    expect(en).toContain('width="1120"');
    expect(en).toContain('height="196"');
    expect(en).toContain('loading="lazy"');
    expect(en).toContain(
      "Pay with EPS: Visa, Mastercard, American Express, DBBL Nexus, UnionPay and Bangladeshi mobile wallets and banks. Verified by EPS.",
    );
    expect(en).toContain(
      "Payments are processed by EPS in taka; PanelPay never sees your card or wallet details.",
    );
    const bn = await render("bn");
    expect(bn).toContain("EPS দিয়ে পেমেন্ট করুন: ভিসা");
    expect(bn).toContain("কখনও দেখে না");
  });
});

describe("/wallet/topup: the page", () => {
  it("has no inline style and no script of ours (React's own form-replay script for a plain-function action is the one allowed)", async () => {
    for (const locale of ["bn", "en"] as const) {
      const html = await render(locale);
      expect(html).not.toContain(' style="');
      expect(withoutFormReplay(html)).not.toContain("<script");
    }
  });

  it("without a session it redirects before reading anything", async () => {
    state.panelRedirect = "/login?next=%2Fwallet%2Ftopup";
    await expect(render("bn")).rejects.toThrow("REDIRECT:/login?next=%2Fwallet%2Ftopup");
    expect(state.loadCalls).toBe(0);
  });

  it("an unknown locale is a missing page", async () => {
    await expect(TopUpPage({ params: Promise.resolve({ locale: "fr" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
