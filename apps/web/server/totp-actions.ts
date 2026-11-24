import { requireFreshSignIn } from "@tc/auth";
import type { CustomerSession, TotpPort } from "@tc/auth";
import { parseOtpCode } from "@tc/core";
import type { AuditRepo, CustomerLimit, ProfileRepo, RateLimitsRepo } from "@tc/db";

// WPU-X11 (owner decision 2026-11-14): the customer's authenticator (TOTP), one of the three steps of the
// account setup that replaced KYC as the buy condition. The cores of the three actions of
// /settings/security. R9 order in each: authenticate (with the fresh sign-in of 6.1 / U10), validate,
// rate limit, execute (Cognito through the port, with the customer's own access token), audit.
//
// The stored fact is customers.totp_enabled_at. Switching ON: Cognito first (VerifySoftwareToken, then
// SetUserMFAPreference), the fact second. Switching OFF: the fact first (cleared and committed), Cognito
// second. In both orders a failure in between leaves "Cognito on, platform off", which blocks buying and
// is safe; the other leftover, "platform on, Cognito off", would let a customer buy without the
// authenticator (R16). The secret is returned once to the Server Action (U9) and is never stored,
// logged, audited or part of an error; neither is a code or the access token (R14).
//
// Round 2 (security review): either change ends every session of the customer. The platform cut-off
// (customers.sessions_valid_after, in the same transaction) refuses every token from before it, and
// GlobalSignOut at Cognito ends the refresh tokens. Cognito cannot end the other sessions and keep this
// device's, so this device signs in again too (with the code, which also proves the app works): the
// result says `sessionsEnded` and the Server Action clears the cookies.

export interface TotpRepos {
  profile: ProfileRepo;
  audit: AuditRepo;
  rateLimits: RateLimitsRepo;
  /**
   * Queues a security notice for the customer in the same transaction (the notifier sends it after the
   * commit). Throws when it cannot, so the change is rolled back with it: no change without the notice.
   */
  notify(template: "security_totp_changed", data: { at: string }, dedupeKey: string): Promise<void>;
}

export interface TotpDeps {
  authenticate(): Promise<CustomerSession | null>;
  now(): Date;
  /** One transaction of the customer's own repositories (R8: the id comes from the session). */
  store<T>(customerId: string, fn: (repos: TotpRepos) => Promise<T>): Promise<T>;
  /** null = not configured: every action refuses (R16). */
  totp: TotpPort | null;
  /** The access token of this request's session cookie; null when there is none. */
  accessToken(): string | null;
}

export type TotpError =
  | "unauthenticated"
  | "fresh_sign_in_required"
  | "validation"
  | "rate_limited"
  | "invalid_code"
  | "unavailable";

export type TotpFailure = {
  ok: false;
  error: TotpError;
  fields?: Record<string, string>;
  /** The platform cut-off was committed before the failure: every session is over, this one too. */
  sessionsEnded?: true;
};
export type TotpResult<T extends object = object> = ({ ok: true } & T) | TotpFailure;

// Ten tries an hour cover a start, a few mistyped codes and a confirm; more is an attack on the code.
export const TOTP_LIMITS: readonly CustomerLimit[] = Object.freeze([
  Object.freeze({ action: "settings.totp", limit: 10, windowSeconds: 3600 }),
]);

const ISSUER = "PanelPay";

/**
 * The otpauth URI that an authenticator app reads (Key Uri Format). The label is the issuer only: the
 * customer's e-mail is not put into a link or a QR code.
 */
export function otpauthUri(secret: string): string {
  const issuer = encodeURIComponent(ISSUER);
  return `otpauth://totp/${issuer}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

const fail = (error: TotpError, fields?: Record<string, string>): TotpFailure => ({
  ok: false,
  error,
  ...(fields ? { fields } : {}),
});

const record = (raw: unknown): Record<string, unknown> =>
  typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};

async function guard(
  deps: TotpDeps,
): Promise<{ session: CustomerSession; port: TotpPort; token: string } | TotpFailure> {
  const session = await deps.authenticate();
  if (session === null) return fail("unauthenticated");
  if (!requireFreshSignIn(session, { now: deps.now }).ok) return fail("fresh_sign_in_required");
  if (deps.totp === null) return fail("unavailable");
  const token = deps.accessToken();
  if (token === null || token === "") return fail("unauthenticated");
  return { session, port: deps.totp, token };
}

async function audit(repos: TotpRepos, action: string): Promise<void> {
  const written = await repos.audit.record({ action, targetType: "customer" });
  if (!written.ok) throw new Error("totp: the audit entry was refused");
}

/** Maps a failure of the port to a public error; nothing of its text is kept. */
function portFailure(kind: string): TotpFailure {
  switch (kind) {
    case "invalid_code":
      return fail("invalid_code", { code: "wrong" });
    case "denied":
      return fail("unauthenticated");
    case "rate_limited":
      return fail("rate_limited");
    default:
      return fail("unavailable");
  }
}

/** Step 1: a new secret, shown once. Refused when the authenticator is already on. */
export async function startTotpCore(
  deps: TotpDeps,
): Promise<TotpResult<{ secret: string; otpauthUri: string }>> {
  const guarded = await guard(deps);
  if (!("session" in guarded)) return guarded;
  const { session, port, token } = guarded;
  try {
    const gate = await deps.store(session.customerId, async (repos) => {
      const profile = await repos.profile.get();
      if (profile === null) return "unavailable" as const;
      if (profile.totpEnabledAt !== null) return "already_on" as const;
      const limit = await repos.rateLimits.consume(TOTP_LIMITS, deps.now());
      return limit.allowed ? ("ok" as const) : ("rate_limited" as const);
    });
    if (gate === "already_on") return fail("validation", { totp: "already_on" });
    if (gate !== "ok") return fail(gate);

    const associated = await port.associate(token);
    if (!associated.ok) return portFailure(associated.kind);
    await deps.store(session.customerId, (repos) => audit(repos, "auth.totp_setup_started"));
    const { secret } = associated.value;
    return { ok: true, secret, otpauthUri: otpauthUri(secret) };
  } catch {
    return fail("unavailable");
  }
}

/** Step 2: the 6-digit code from the app. On success TOTP is on at Cognito and stored as on. */
export async function confirmTotpCore(
  deps: TotpDeps,
  raw: unknown,
): Promise<TotpResult<{ sessionsEnded: true }>> {
  const guarded = await guard(deps);
  if (!("session" in guarded)) return guarded;
  const { session, port, token } = guarded;

  const rawCode = record(raw)["code"];
  const code = typeof rawCode === "string" ? parseOtpCode(rawCode) : null;
  if (code === null) return fail("validation", { code: "malformed" });

  try {
    const allowed = await deps.store(session.customerId, async (repos) => {
      const limit = await repos.rateLimits.consume(TOTP_LIMITS, deps.now());
      return limit.allowed;
    });
    if (!allowed) return fail("rate_limited");

    const verified = await port.verify(token, code);
    if (!verified.ok) return portFailure(verified.kind);
    const enabled = await port.setPreference(token, true);
    if (!enabled.ok) return portFailure(enabled.kind);

    // Cognito is on. The fact, the cut-off, the audit row and the notice are one transaction.
    const at = deps.now();
    const written = await deps.store(session.customerId, async (repos): Promise<boolean> => {
      const saved = await repos.profile.setTotpEnabled(at);
      if (!saved.ok) return false;
      const cut = await repos.profile.revokeSessions(at);
      if (!cut.ok) return false;
      await audit(repos, "auth.totp_enabled");
      await repos.notify(
        "security_totp_changed",
        { at: at.toISOString() },
        `totp-on:${session.customerId}:${at.getTime()}`,
      );
      return true;
    });
    if (!written) return fail("unavailable");
    // The refresh tokens end at Cognito. If that fails the cut-off still refuses every older session
    // (a refreshed token keeps the auth_time of its sign-in), so the answer does not change.
    await port.signOutEverywhere(token).catch(() => undefined);
    return { ok: true, sessionsEnded: true };
  } catch {
    return fail("unavailable");
  }
}

/** Switches the authenticator off (fresh sign-in). Buying is blocked again until it is on. */
export async function disableTotpCore(
  deps: TotpDeps,
): Promise<TotpResult<{ sessionsEnded: true }>> {
  const guarded = await guard(deps);
  if (!("session" in guarded)) return guarded;
  const { session, port, token } = guarded;
  try {
    const gate = await deps.store(session.customerId, async (repos) => {
      const profile = await repos.profile.get();
      if (profile === null) return "unavailable" as const;
      const limit = await repos.rateLimits.consume(TOTP_LIMITS, deps.now());
      if (!limit.allowed) return "rate_limited" as const;
      return profile.totpEnabledAt === null ? ("copy_off" as const) : ("ok" as const);
    });
    if (gate !== "ok" && gate !== "copy_off") return fail(gate);
    if (gate === "copy_off") {
      // The copy says off. That is the end of it only if Cognito says off too. After "the copy was cleared,
      // the Cognito call failed" the customer sees "off" while Cognito is still on: ask it, and finish the
      // switch-off instead of refusing. A Cognito answer that cannot be had refuses and changes nothing (R16).
      const state = await port.mfaState(token);
      if (!state.ok) return portFailure(state.kind);
      if (!state.value.totp) return fail("validation", { totp: "not_on" });
    }

    // The platform copy first, committed with the cut-off, the audit row and the notice. If this throws,
    // nothing happened anywhere and Cognito was not asked.
    const at = deps.now();
    const written = await deps.store(session.customerId, async (repos): Promise<boolean> => {
      const saved = await repos.profile.setTotpEnabled(null);
      if (!saved.ok) return false;
      const cut = await repos.profile.revokeSessions(at);
      if (!cut.ok) return false;
      await audit(repos, "auth.totp_disabled");
      await repos.notify(
        "security_totp_changed",
        { at: at.toISOString() },
        `totp-off:${session.customerId}:${at.getTime()}`,
      );
      return true;
    });
    if (!written) return fail("unavailable");

    // Now Cognito. A failure leaves "Cognito on, platform off": buying stays blocked, the customer
    // signs in with the code and can start again. The cut-off is committed either way.
    const disabled = await port.setPreference(token, false);
    if (!disabled.ok) return { ...portFailure(disabled.kind), sessionsEnded: true };
    await port.signOutEverywhere(token).catch(() => undefined);
    return { ok: true, sessionsEnded: true };
  } catch {
    return fail("unavailable");
  }
}
