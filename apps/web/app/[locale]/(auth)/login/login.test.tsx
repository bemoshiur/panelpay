import { describe, expect, it, vi } from "vitest";
import { intl } from "../page-harness.tsx";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
  headers: async () => new Headers(),
}));

// WPU-X11: the state the form starts in; a test sets the answer of the sign-in action here.
const answer: { state: unknown } = { state: { status: "idle" } };
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return { ...actual, useActionState: () => [answer.state, () => undefined, false] };
});

const { LoginContent } = await import("./LoginContent.tsx");

const render = (locale: "bn" | "en", over: Partial<Parameters<typeof LoginContent>[0]> = {}) =>
  intl(<LoginContent locale={locale} next={undefined} banner={null} available {...over} />, locale);

describe("the login form (16.9)", () => {
  it("has username and current-password autocomplete, email and password types, and no remember-me", () => {
    for (const locale of ["bn", "en"] as const) {
      const html = render(locale);
      expect(html).toContain('autoComplete="username"');
      expect(html).toContain('autoComplete="current-password"');
      expect(html).toContain('type="email"');
      expect(html).toContain('type="password"');
      expect(html).not.toMatch(/remember/i);
      expect(html).not.toContain('type="checkbox"');
    }
  });

  it("links to forgot-password and signup in the locale and carries the locale as a hidden field", () => {
    const en = render("en");
    expect(en).toContain('href="/en/forgot-password"');
    expect(en).toContain('href="/en/signup"');
    expect(en).toContain('name="locale" value="en"');
    const bn = render("bn");
    expect(bn).toContain('href="/en/forgot-password"');
    expect(bn).toContain('name="locale" value="bn"');
  });

  it("shows the matching success banner and nothing for null", () => {
    expect(render("en", { banner: "verified" })).toContain("Email verified.");
    expect(render("en", { banner: "reset" })).toContain("Password changed.");
    expect(render("en")).not.toContain("alert-success");
  });

  it("the submit button carries its icon and the text, and the form has the single yellow button", () => {
    const html = render("en");
    expect(html.match(/btn-default-yellow-fill/g)).toHaveLength(1);
    expect(html).toContain("fas fa-lock");
    expect(html).toContain("Sign in");
  });

  it("PRO-6: fills in a plain e-mail from the query and drops anything else", () => {
    expect(render("en", { email: "buyer@example.com" })).toContain('value="buyer@example.com"');
    for (const bad of [
      '"><script>@x.com',
      "a b@example.com",
      ["a@example.com"],
      "x".repeat(300) + "@e.com",
    ]) {
      expect(render("en", { email: bad })).not.toMatch(/name="email"[^>]*value=/);
    }
  });

  it("re-checks next before it reaches the form", () => {
    expect(render("en", { next: "//evil.com" })).not.toContain('name="next"');
    expect(render("en", { next: "/wallet" })).toContain('name="next" value="/wallet"');
  });

  it("WPU-X11: shows no authenticator field until the provider asks for the code", () => {
    answer.state = { status: "idle" };
    expect(render("en")).not.toContain('name="totpCode"');
  });

  it("WPU-X11: after totp_required asks for the code (bn first, then en) and keeps the step flag", () => {
    answer.state = {
      status: "error",
      code: "totp_required",
      values: { email: "a@example.test", totpStep: "1" },
      ref: "r1",
    };
    const bn = render("bn");
    expect(bn).toContain('name="totpCode"');
    expect(bn).toContain("অথেনটিকেটর অ্যাপের কোড");
    expect(bn).toContain('name="totpStep" value="1"');
    const en = render("en");
    expect(en).toContain("Code from your authenticator app");
    expect(en).toContain('autoComplete="one-time-code"');
    expect(en).toContain("This account uses an authenticator.");
    expect(en).toContain('value="a@example.test"');
    answer.state = { status: "idle" };
  });
});
