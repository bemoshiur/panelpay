import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { webMessages } from "../../../../../i18n/messages.ts";

// WPU-X11: the authenticator setup after the server answered the start action. The secret is in the
// answer of the action only (U9), shown grouped with the otpauth link, and hidden again after 60 s.

const answers: unknown[] = [];
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useActionState: () => [answers.shift() ?? {}, () => undefined, false],
  };
});

const {
  RESET,
  SECRET_VISIBLE_MS,
  TotpDisableForm,
  TotpSetupForms,
  groupSecret,
  scheduleSecretWipe,
  withReset,
} = await import("./TotpForms.tsx");
const { INITIAL_FORM_STATE } = await import("../../../../../server/action-state.ts");

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const URI = `otpauth://totp/PanelPay?secret=${SECRET}&issuer=PanelPay&algorithm=SHA1&digits=6&period=30`;
const never = async (): Promise<never> => {
  throw new Error("not called in a render");
};

function render(locale: "bn" | "en", started: unknown, confirmed: unknown = {}): string {
  answers.length = 0;
  answers.push(started, confirmed);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={webMessages[locale]} timeZone="Asia/Dhaka">
      <TotpSetupForms start={never} confirm={never} signInHref="/login" />
    </NextIntlClientProvider>,
  );
}

describe("TotpSetupForms", () => {
  it("before the start: only the start button, no secret and no code field", () => {
    const html = render("en", {});
    expect(html).toContain("Switch on the authenticator");
    expect(html).not.toContain('name="code"');
  });

  it("after the start: the secret in groups of four, the app link, the once-only note and the code field", () => {
    const html = render("en", {
      done: "started",
      secret: SECRET,
      otpauthUri: URI,
      qr: { size: 21, margin: 4, d: "M4 4h1v1h-1z" },
    });
    // The QR code as one inline SVG path made on the server, labelled, with no style attribute (U4).
    expect(html).toContain('<svg class="tc-totp-qr"');
    expect(html).toContain('viewBox="0 0 29 29"');
    expect(html).toContain('d="M4 4h1v1h-1z"');
    expect(html).toContain('aria-label="QR code to scan with your authenticator app"');
    expect(html).not.toContain("style=");
    expect(html).toContain(groupSecret(SECRET));
    expect(groupSecret(SECRET)).toBe("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP");
    expect(html).toContain(`href="${URI.replace(/&/g, "&amp;")}"`);
    expect(html).toContain("shown only once and is hidden after 60 seconds");
    expect(html).toContain('name="code"');
    expect(html).toContain('autoComplete="one-time-code"');
    expect(render("bn", { done: "started", secret: SECRET, otpauthUri: URI })).toContain("গোপন কী");
    expect(SECRET_VISIBLE_MS).toBe(60_000);
  });

  it("a wrong code shows the field error; a confirmed code shows the success text", () => {
    const wrong = render(
      "en",
      { done: "started", secret: SECRET, otpauthUri: URI },
      { error: "invalid_code", fields: { code: "wrong" } },
    );
    expect(wrong).toContain('role="alert"');
    // WPU-X11 round 2: it also says that every session ended, this one too, and links to the sign-in.
    const enabled = render(
      "en",
      { done: "started", secret: SECRET, otpauthUri: URI },
      { done: "enabled", sessionsEnded: true },
    );
    expect(enabled).toContain("The authenticator is on.");
    expect(enabled).toContain("every session was ended");
    expect(enabled).toContain('href="/login"');
    expect(enabled).toContain("Sign in again");
    // The secret is not on the page any more once the authenticator is on.
    expect(enabled).not.toContain(groupSecret(SECRET));
    expect(enabled).not.toContain("otpauth://");
    expect(
      render("bn", { done: "started", secret: SECRET }, { done: "enabled", sessionsEnded: true }),
    ).toContain("আবার সাইন ইন করুন");
  });

  it("a fresh sign-in error links to the sign-in", () => {
    const html = render("en", { error: "fresh_sign_in_required" });
    expect(html).toContain('href="/login?reauth=1"');
  });
});

afterEach(() => vi.useRealTimers());

// WPU-X11 round 2 (U9): after 60 seconds, and once the authenticator is on, the secret, the link and the QR
// path are removed from the state of the form, not only from the screen.
describe("the secret is wiped from the state, not just hidden", () => {
  const started = {
    done: "started",
    secret: SECRET,
    otpauthUri: URI,
    qr: { size: 21, margin: 4, d: "M4 4h1v1h-1z" },
  };

  it("the reset answer holds nothing of the secret", () => {
    expect(RESET).not.toBe(undefined);
    expect(INITIAL_FORM_STATE).toEqual({});
    expect(JSON.stringify(INITIAL_FORM_STATE)).not.toMatch(/secret|otpauth|qr/i);
  });

  it("withReset answers the empty state for the reset and the action's own answer for a form", async () => {
    const start = vi.fn(async () => started);
    const reduce = withReset(start);
    expect(await reduce(started, RESET as never)).toEqual(INITIAL_FORM_STATE);
    expect(start).not.toHaveBeenCalled();
    const form = new FormData();
    expect(await reduce(INITIAL_FORM_STATE, form)).toEqual(started);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("scheduleSecretWipe wipes after 60 seconds and not before; cancelling stops it", () => {
    vi.useFakeTimers();
    const wipe = vi.fn();
    scheduleSecretWipe(wipe);
    vi.advanceTimersByTime(SECRET_VISIBLE_MS - 1);
    expect(wipe).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(wipe).toHaveBeenCalledTimes(1);

    const cancelled = vi.fn();
    const cancel = scheduleSecretWipe(cancelled);
    cancel();
    vi.advanceTimersByTime(SECRET_VISIBLE_MS * 2);
    expect(cancelled).not.toHaveBeenCalled();
  });
});

describe("TotpDisableForm", () => {
  const disable = async (): Promise<never> => {
    throw new Error("not called in a render");
  };
  const renderDisable = (locale: "bn" | "en", state: unknown) => {
    answers.length = 0;
    answers.push(state);
    return renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={webMessages[locale]} timeZone="Asia/Dhaka">
        <TotpDisableForm action={disable} signInHref="/login" />
      </NextIntlClientProvider>,
    );
  };

  it("after the switch-off it says every session ended and links to the sign-in", () => {
    const html = renderDisable("en", { done: "disabled", sessionsEnded: true });
    expect(html).toContain("The authenticator was switched off.");
    expect(html).toContain("every session was ended");
    expect(html).toContain('href="/login"');
    expect(renderDisable("bn", { done: "disabled", sessionsEnded: true })).toContain(
      "আবার সাইন ইন করুন",
    );
  });

  it("a failure after the cut-off says the sessions ended although the provider could not be told", () => {
    const html = renderDisable("en", { error: "unavailable", sessionsEnded: true });
    expect(html).toContain('role="alert"');
    expect(html).toContain("could not be switched off at the sign-in service");
    expect(html).toContain('href="/login"');
  });

  it("before anything it offers the switch-off with its consequence", () => {
    const html = renderDisable("en", {});
    expect(html).toContain("Switch off the authenticator");
    expect(html).toContain("you cannot buy anything new until you switch it on again");
  });
});
