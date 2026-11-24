import type { CustomerSession, TotpPort } from "@tc/auth";
import type { AuditRepo, CustomerProfile, ProfileRepo, RateLimitsRepo } from "@tc/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryIdentityProvider, fakeRefreshPort } from "./fakes/identity.ts";
import { getFakeState, resetFakeState } from "./fakes/outbox.ts";
import { FakeTotp, totpCodeAt } from "./fakes/totp.ts";
import {
  confirmTotpCore,
  disableTotpCore,
  otpauthUri,
  startTotpCore,
  type TotpDeps,
} from "./totp-actions.ts";

// WPU-X11: the customer's authenticator in /settings/security. R9 order in each core: authenticate (with
// the fresh sign-in of 6.1), validate, rate limit, execute (Cognito through the port with the customer's
// own access token), audit. The secret is shown once and is in no log, audit entry or error (U9, R14).
//
// Round 2 (security review): switching it OFF writes the platform copy first and calls Cognito second
// (a failure in between leaves "Cognito on, platform off", the safe direction, R16). Switching it ON or
// OFF ends every session of the customer: the cut-off of the platform and GlobalSignOut at Cognito.

const NOW = new Date("2026-11-14T10:00:00Z");
const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const SUB = "usubtotp0001";
const TOKEN = `dev.${SUB}`;
const FRESH = new Date(NOW.getTime() - 60_000);
const STALE = new Date(NOW.getTime() - 11 * 60_000);
const EMAIL = "t@example.test";
const PASSWORD = "pw-very-long-123";

const session = (signedInAt: Date): CustomerSession => ({
  customerId: CUSTOMER,
  kycStatus: "none",
  riskTier: "new",
  locale: "bn",
  signedInAt,
});

beforeEach(() => {
  resetFakeState();
  getFakeState().users.set(EMAIL, {
    sub: SUB,
    password: PASSWORD,
    confirmed: true,
    name: "T",
    locale: "bn",
    refreshCount: 0,
  });
});
afterEach(() => vi.restoreAllMocks());

function world(
  over: {
    signedInAt?: Date;
    limited?: boolean;
    noPort?: boolean;
    token?: string | null;
    enabledAt?: Date | null;
    /** The 1-based numbers of the store calls that throw. */
    storeThrowsOn?: number[];
    noticeThrows?: boolean;
    /** The limiter lets this many calls through in all, counting at the moment of the call (atomic). */
    allowOnly?: number;
  } = {},
) {
  // One list for the repository calls and the Cognito calls, in the order they happen.
  const trace: string[] = [];
  const logged: unknown[] = [];
  const notices: { template: string; data: unknown; dedupeKey: string }[] = [];
  let cutoff: Date | null = null;
  let storeCalls = 0;
  let limiterCalls = 0;
  const totp = new FakeTotp({ now: () => NOW });
  // The deps see the fake through a wrapper that writes each call into the trace.
  const traced: TotpPort = {
    associate: (t) => (trace.push("cognito:associate"), totp.associate(t)),
    verify: (t, c) => (trace.push("cognito:verify"), totp.verify(t, c)),
    setPreference: (t, e) => (
      trace.push(`cognito:setPreference:${String(e)}`),
      totp.setPreference(t, e)
    ),
    mfaState: (t) => (trace.push("cognito:mfaState"), totp.mfaState(t)),
    signOutEverywhere: (t) => (trace.push("cognito:signOutEverywhere"), totp.signOutEverywhere(t)),
  };
  let profile = {
    id: CUSTOMER,
    email: EMAIL,
    totpEnabledAt: over.enabledAt ?? null,
  } as CustomerProfile;
  const profileRepo: Partial<ProfileRepo> = {
    get: async () => profile,
    setTotpEnabled: async (at) => {
      trace.push(`profile.setTotpEnabled:${at === null ? "null" : "time"}`);
      profile = { ...profile, totpEnabledAt: at };
      return { ok: true, replayed: false, value: profile };
    },
    revokeSessions: async (at) => {
      trace.push("profile.revokeSessions");
      cutoff = at;
      return { ok: true, replayed: false, value: true };
    },
  };
  const audit: AuditRepo = {
    record: async (input) => {
      trace.push(`audit:${input.action}`);
      logged.push(input);
      return { ok: true, replayed: false, value: { id: "a" } };
    },
  };
  const rateLimits: RateLimitsRepo = {
    consume: async (limits) => {
      trace.push(`rateLimit:${limits.map((l) => l.action).join(",")}`);
      limiterCalls += 1;
      return over.limited === true ||
        (over.allowOnly !== undefined && limiterCalls > over.allowOnly)
        ? { allowed: false, action: "x", retryAfterSeconds: 9 }
        : { allowed: true };
    },
  };
  const deps: TotpDeps = {
    authenticate: async () => {
      trace.push("authenticate");
      return session(over.signedInAt ?? FRESH);
    },
    now: () => NOW,
    store: async (customerId, fn) => {
      // R8: the store is opened for the session's customer, never an id from the form.
      expect(customerId).toBe(CUSTOMER);
      storeCalls += 1;
      if (over.storeThrowsOn?.includes(storeCalls) === true) throw new Error("db down");
      return fn({
        profile: profileRepo as ProfileRepo,
        audit,
        rateLimits,
        notify: async (template, data, dedupeKey) => {
          trace.push(`notify:${template}`);
          if (over.noticeThrows === true) throw new Error("queue down");
          notices.push({ template, data, dedupeKey });
        },
      });
    },
    totp: over.noPort === true ? null : traced,
    accessToken: () => (over.token === undefined ? TOKEN : over.token),
  };
  return { deps, trace, logged, notices, totp, profile: () => profile, cutoff: () => cutoff };
}

const user = () => getFakeState().users.get(EMAIL)!;
const cognito = (trace: string[]) => trace.filter((t) => t.startsWith("cognito:"));

async function enrolled() {
  const w = world();
  const started = await startTotpCore(w.deps);
  if (!started.ok) throw new Error("start failed");
  w.trace.length = 0;
  return { w, secret: started.secret, code: totpCodeAt(started.secret, NOW) };
}

describe("startTotpCore", () => {
  it("authenticates, rate limits, asks Cognito for a secret and audits, in that order; the secret is in no audit", async () => {
    const w = world();
    const r = await startTotpCore(w.deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(r.otpauthUri).toBe(otpauthUri(r.secret));
    expect(w.trace).toEqual([
      "authenticate",
      "rateLimit:settings.totp",
      "cognito:associate",
      "audit:auth.totp_setup_started",
    ]);
    expect(JSON.stringify(w.logged)).not.toContain(r.secret);
  });

  it("needs a fresh sign-in (6.1) and refuses before any call", async () => {
    const w = world({ signedInAt: STALE });
    expect(await startTotpCore(w.deps)).toEqual({ ok: false, error: "fresh_sign_in_required" });
    expect(w.trace).toEqual(["authenticate"]);
  });

  it("refuses when the authenticator is already on, when rate limited, without a port or a token (R16)", async () => {
    expect(await startTotpCore(world({ enabledAt: NOW }).deps)).toEqual({
      ok: false,
      error: "validation",
      fields: { totp: "already_on" },
    });
    expect(await startTotpCore(world({ limited: true }).deps)).toEqual({
      ok: false,
      error: "rate_limited",
    });
    expect(await startTotpCore(world({ noPort: true }).deps)).toEqual({
      ok: false,
      error: "unavailable",
    });
    expect(await startTotpCore(world({ token: null }).deps)).toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });
});

describe("confirmTotpCore", () => {
  it("verifies the code, switches TOTP on at Cognito, then stores the time, ends the sessions, audits, tells the customer, and signs out everywhere", async () => {
    const { w, code } = await enrolled();
    expect(await confirmTotpCore(w.deps, { code })).toEqual({ ok: true, sessionsEnded: true });
    expect(w.trace).toEqual([
      "authenticate",
      "rateLimit:settings.totp",
      "cognito:verify",
      "cognito:setPreference:true",
      "profile.setTotpEnabled:time",
      "profile.revokeSessions",
      "audit:auth.totp_enabled",
      "notify:security_totp_changed",
      "cognito:signOutEverywhere",
    ]);
    expect(w.profile().totpEnabledAt).toEqual(NOW);
    expect(w.cutoff()).toEqual(NOW);
    expect(user().totpEnabled).toBe(true);
    expect(w.notices).toHaveLength(1);
    expect(w.notices[0]!.data).toEqual({ at: NOW.toISOString() });
    expect(w.notices[0]!.dedupeKey).toBe(`totp-on:${CUSTOMER}:${NOW.getTime()}`);
    expect(JSON.stringify([w.logged, w.notices])).not.toContain(code);
  });

  it("ends the other sessions: the refresh tokens of two signed-in devices stop working, and the new sign-in needs the code", async () => {
    const identity = new InMemoryIdentityProvider({
      stage: "test",
      fakes: true,
      clock: { now: () => NOW },
    });
    const { w, code } = await enrolled();
    // Two devices are signed in before the authenticator goes on.
    for (let device = 0; device < 2; device++) {
      const signedIn = await identity.signIn({ email: EMAIL, password: PASSWORD });
      expect(signedIn.ok).toBe(true);
    }
    const refreshTokens = [...getFakeState().issuedRefresh];
    expect(refreshTokens).toHaveLength(2);
    for (const rt of refreshTokens) {
      expect((await fakeRefreshPort().refresh(rt)).kind).toBe("refreshed");
    }

    expect(await confirmTotpCore(w.deps, { code })).toEqual({ ok: true, sessionsEnded: true });

    for (const rt of refreshTokens) {
      expect((await fakeRefreshPort().refresh(rt)).kind).toBe("rejected");
    }
    // The platform side: a token from before the change is older than the cut-off.
    expect(w.cutoff()!.getTime()).toBe(NOW.getTime());
    // And signing in again now asks for the code.
    expect(await identity.signIn({ email: EMAIL, password: PASSWORD })).toEqual({
      ok: true,
      value: { kind: "challenge", challenge: "totp" },
    });
  });

  it("a wrong code stores nothing, switches nothing on, and ends no session", async () => {
    const { w, secret } = await enrolled();
    const wrong = totpCodeAt(secret, NOW) === "000000" ? "111111" : "000000";
    expect(await confirmTotpCore(w.deps, { code: wrong })).toEqual({
      ok: false,
      error: "invalid_code",
      fields: { code: "wrong" },
    });
    expect(w.profile().totpEnabledAt).toBeNull();
    expect(user().totpEnabled).toBeUndefined();
    expect(w.cutoff()).toBeNull();
    expect(w.trace).not.toContain("cognito:signOutEverywhere");
    expect(w.trace).not.toContain("profile.setTotpEnabled:time");
  });

  it("refuses a code that is not six digits before any call, and needs a fresh sign-in", async () => {
    const w = world();
    for (const bad of ["", "12345", "1234567", "abcdef", 123456, null]) {
      expect(await confirmTotpCore(w.deps, { code: bad })).toEqual({
        ok: false,
        error: "validation",
        fields: { code: "malformed" },
      });
    }
    expect(cognito(w.trace)).toEqual([]);
    expect(await confirmTotpCore(world({ signedInAt: STALE }).deps, { code: "123456" })).toEqual({
      ok: false,
      error: "fresh_sign_in_required",
    });
  });

  it("is rate limited before Cognito is asked", async () => {
    const w = world({ limited: true });
    expect(await confirmTotpCore(w.deps, { code: "123456" })).toEqual({
      ok: false,
      error: "rate_limited",
    });
    expect(cognito(w.trace)).toEqual([]);
  });
});

// The review of the sign-in found check-then-count races. The authenticator actions count BEFORE they ask
// Cognito (consume first, no refund), so parallel wrong codes cannot get past the limit either.
describe("confirmTotpCore: parallel wrong codes", () => {
  it("twenty-five parallel guesses: no more than the limit of the actions reach Cognito", async () => {
    // start uses one limiter call, then ten are left for the guesses.
    const w = world({ allowOnly: 11 });
    const started = await startTotpCore(w.deps);
    if (!started.ok) throw new Error("start failed");
    const wrong = totpCodeAt(started.secret, NOW) === "000000" ? "111111" : "000000";
    const answers = await Promise.all(
      Array.from({ length: 25 }, () => confirmTotpCore(w.deps, { code: wrong })),
    );
    expect(w.totp.calls.filter((c) => c === "verify").length).toBeLessThanOrEqual(10);
    expect(
      answers.filter((a) => !a.ok && a.error === "rate_limited").length,
    ).toBeGreaterThanOrEqual(15);
    expect(w.profile().totpEnabledAt).toBeNull();
  });
});

describe("confirmTotpCore: failures after Cognito accepted the code", () => {
  // Store calls of confirm: 1 = the rate limit, 2 = the write. (start uses two before.)
  async function afterStart(over: Parameters<typeof world>[0]) {
    const w = world(over);
    const started = await startTotpCore(w.deps);
    if (!started.ok) throw new Error("start failed");
    w.trace.length = 0;
    return { w, code: totpCodeAt(started.secret, NOW) };
  }

  it("the write throws: unavailable, no cut-off, no sign-out; Cognito stays on", async () => {
    // start = store calls 1 and 2, confirm = 3 (rate limit) and 4 (write).
    const { w, code } = await afterStart({ storeThrowsOn: [4] });
    expect(await confirmTotpCore(w.deps, { code })).toEqual({ ok: false, error: "unavailable" });
    expect(w.profile().totpEnabledAt).toBeNull();
    expect(w.cutoff()).toBeNull();
    expect(user().totpEnabled).toBe(true);
    expect(w.trace).not.toContain("cognito:signOutEverywhere");
  });

  it("the notice cannot be queued: the whole write rolls back, unavailable (no change without the customer being told)", async () => {
    const { w, code } = await afterStart({ noticeThrows: true });
    expect(await confirmTotpCore(w.deps, { code })).toEqual({ ok: false, error: "unavailable" });
    expect(w.trace).not.toContain("cognito:signOutEverywhere");
  });

  it("GlobalSignOut fails: still done, the sessions are ended by the cut-off alone", async () => {
    const { w, code } = await afterStart({});
    w.totp.fail.signOutEverywhere = "unavailable";
    expect(await confirmTotpCore(w.deps, { code })).toEqual({ ok: true, sessionsEnded: true });
    expect(w.cutoff()).toEqual(NOW);
    expect(w.profile().totpEnabledAt).toEqual(NOW);
  });
});

describe("disableTotpCore", () => {
  it("writes the platform copy first (cleared, sessions ended, audited, customer told), then Cognito switches off, then GlobalSignOut", async () => {
    const w = world({ enabledAt: NOW });
    user().totpEnabled = true;
    expect(await disableTotpCore(w.deps)).toEqual({ ok: true, sessionsEnded: true });
    expect(w.trace).toEqual([
      "authenticate",
      "rateLimit:settings.totp",
      "profile.setTotpEnabled:null",
      "profile.revokeSessions",
      "audit:auth.totp_disabled",
      "notify:security_totp_changed",
      "cognito:setPreference:false",
      "cognito:signOutEverywhere",
    ]);
    expect(w.profile().totpEnabledAt).toBeNull();
    expect(w.cutoff()).toEqual(NOW);
    expect(w.notices[0]!.dedupeKey).toBe(`totp-off:${CUSTOMER}:${NOW.getTime()}`);
    expect(user().totpEnabled).toBe(false);
  });

  it("the database write throws: Cognito is not called at all, and the authenticator stays on in both places (R16)", async () => {
    // Store calls of disable: 1 = the gate, 2 = the write.
    const w = world({ enabledAt: NOW, storeThrowsOn: [2] });
    user().totpEnabled = true;
    expect(await disableTotpCore(w.deps)).toEqual({ ok: false, error: "unavailable" });
    expect(cognito(w.trace)).toEqual([]);
    expect(w.profile().totpEnabledAt).toEqual(NOW);
    expect(w.cutoff()).toBeNull();
    expect(user().totpEnabled).toBe(true);
  });

  it("the database is cleared, then the Cognito call fails: unavailable, the copy stays cleared (buying is blocked), the sessions are ended, no GlobalSignOut", async () => {
    const w = world({ enabledAt: NOW });
    user().totpEnabled = true;
    w.totp.fail.setPreference = "unavailable";
    expect(await disableTotpCore(w.deps)).toEqual({
      ok: false,
      error: "unavailable",
      sessionsEnded: true,
    });
    // Cognito on, platform off: the safe leftover.
    expect(w.profile().totpEnabledAt).toBeNull();
    expect(user().totpEnabled).toBe(true);
    expect(w.cutoff()).toEqual(NOW);
    expect(cognito(w.trace)).toEqual(["cognito:setPreference:false"]);
  });

  it("the notice cannot be queued: nothing is written and Cognito is not called", async () => {
    const w = world({ enabledAt: NOW, noticeThrows: true });
    expect(await disableTotpCore(w.deps)).toEqual({ ok: false, error: "unavailable" });
    expect(cognito(w.trace)).toEqual([]);
  });

  it("ends the other sessions of the customer too", async () => {
    const identity = new InMemoryIdentityProvider({
      stage: "test",
      fakes: true,
      clock: { now: () => NOW },
    });
    const w = world({ enabledAt: NOW });
    const signedIn = await identity.signIn({ email: EMAIL, password: PASSWORD });
    expect(signedIn.ok).toBe(true);
    const [rt] = [...getFakeState().issuedRefresh];
    expect((await fakeRefreshPort().refresh(rt!)).kind).toBe("refreshed");
    await disableTotpCore(w.deps);
    expect((await fakeRefreshPort().refresh(rt!)).kind).toBe("rejected");
  });

  // Review: after "the copy was cleared, the Cognito call failed" the customer sees "off", yet Cognito is
  // still on. A retry used to be refused as not_on and the leftover could never be cleaned up.
  it("retry after a failed switch-off: the copy is off but Cognito still says on, so the switch-off goes on to Cognito and GlobalSignOut", async () => {
    const w = world();
    user().totpEnabled = true;
    expect(await disableTotpCore(w.deps)).toEqual({ ok: true, sessionsEnded: true });
    expect(w.trace).toEqual([
      "authenticate",
      "rateLimit:settings.totp",
      "cognito:mfaState",
      "profile.setTotpEnabled:null",
      "profile.revokeSessions",
      "audit:auth.totp_disabled",
      "notify:security_totp_changed",
      "cognito:setPreference:false",
      "cognito:signOutEverywhere",
    ]);
    expect(user().totpEnabled).toBe(false);
  });

  it("copy off and Cognito off too is still not_on; a Cognito answer that cannot be had refuses and changes nothing (R16)", async () => {
    const off = world();
    expect(await disableTotpCore(off.deps)).toEqual({
      ok: false,
      error: "validation",
      fields: { totp: "not_on" },
    });
    expect(off.trace).not.toContain("profile.revokeSessions");

    const broken = world();
    broken.totp.fail.mfaState = "unavailable";
    expect(await disableTotpCore(broken.deps)).toEqual({ ok: false, error: "unavailable" });
    expect(broken.trace).not.toContain("profile.revokeSessions");
    expect(cognito(broken.trace)).toEqual(["cognito:mfaState"]);
  });

  it("the leftover retry is rate limited like every other attempt, before Cognito is asked", async () => {
    const w = world({ limited: true });
    user().totpEnabled = true;
    expect(await disableTotpCore(w.deps)).toEqual({ ok: false, error: "rate_limited" });
    expect(cognito(w.trace)).toEqual([]);
  });

  it("needs a fresh sign-in and refuses when the authenticator is not on", async () => {
    expect(await disableTotpCore(world({ enabledAt: NOW, signedInAt: STALE }).deps)).toEqual({
      ok: false,
      error: "fresh_sign_in_required",
    });
    expect(await disableTotpCore(world().deps)).toEqual({
      ok: false,
      error: "validation",
      fields: { totp: "not_on" },
    });
  });
});

describe("otpauthUri and the fake authenticator", () => {
  it("names the issuer, never the customer's e-mail", () => {
    expect(otpauthUri("JBSWY3DPEHPK3PXP")).toBe(
      "otpauth://totp/PanelPay?secret=JBSWY3DPEHPK3PXP&issuer=PanelPay&algorithm=SHA1&digits=6&period=30",
    );
  });

  it("computes the RFC 6238 test vector (SHA1, T = 59 s gives 287082)", () => {
    // RFC 6238 Appendix B: the secret is the ASCII "12345678901234567890"; the 8-digit code is 94287082.
    expect(totpCodeAt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", new Date(59_000))).toBe("287082");
  });
});
