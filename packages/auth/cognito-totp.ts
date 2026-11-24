import type { PoolConfig } from "./config";
import type { IdpFailure, IdpResult } from "./identity";

// WPU-X11 (owner decision 2026-11-14): the customer's authenticator (TOTP) in the customer pool. The three
// operations are authorized by the customer's own access token, not by AWS credentials: plain fetch, no
// SDK, no SigV4, no secret (R1, R3, R17), the same unsigned public form as cognito-identity.ts. Nothing
// of an answer is kept or logged: the secret leaves only as the value of a successful associate, and a
// failure is a bare kind (R14). Unknown shapes, statuses and timeouts are "unavailable" (R16).
//
// The calls of this file are AssociateSoftwareToken, VerifySoftwareToken, SetUserMFAPreference, GetUser and
// GlobalSignOut. Every one takes the access token and NONE takes a ClientId, so none of them needs a
// SECRET_HASH although CustomerAppClient has a client secret (WPU-X12 round 4); the API reference pages of
// GetUser and GlobalSignOut (read 2026-11-14) list AccessToken as their only required parameter, and the
// access token must carry the scope aws.cognito.signin.user.admin. The one TOTP call that does take a
// ClientId, RespondToAuthChallenge, is in cognito-identity.ts next to InitiateAuth, behind the same `post`
// that adds the ClientId, and carries its SECRET_HASH there. A new Cognito call with a ClientId belongs
// there, not here.
//
// VERIFY on staging (JOURNEY WPU-X11): AssociateSoftwareToken with AccessToken answers SecretCode;
// VerifySoftwareToken answers Status SUCCESS or EnableSoftwareTokenMFAException for a wrong code;
// SetUserMFAPreference SoftwareTokenMfaSettings; the customer pool has mfa "optional" and
// softwareToken true (infra/stacks/auth.ts).

export interface TotpPort {
  /** A new secret for the customer's authenticator. Shown once, never stored by the platform (U9). */
  associate(accessToken: string): Promise<IdpResult<{ secret: string }>>;
  /** Checks a code against the associated secret. */
  verify(accessToken: string, code: string): Promise<IdpResult<true>>;
  /** Switches TOTP on (enabled and preferred) or off for the customer. */
  setPreference(accessToken: string, enabled: boolean): Promise<IdpResult<true>>;
  /**
   * WPU-X11 round 2: what Cognito itself holds for this customer (GetUser). The authenticator is on only
   * when UserMFASettingList names SOFTWARE_TOKEN_MFA. A call that cannot be made, a token that Cognito no
   * longer accepts and an answer of an odd shape are failures, never "on" (R16).
   */
  mfaState(accessToken: string): Promise<IdpResult<{ totp: boolean }>>;
  /**
   * WPU-X11 round 2: GlobalSignOut. Ends every session of the customer at Cognito, the one of this
   * access token included: all refresh tokens stop working.
   */
  signOutEverywhere(accessToken: string): Promise<IdpResult<true>>;
}

const TIMEOUT_MS = 5000;
const MAX_ANSWER_CHARS = 16_384;
const MAX_TOKEN_CHARS = 8192;
// Cognito's SecretCode is base32 (RFC 4648 alphabet), 16 to 128 characters (the API reference).
const SECRET = /^[A-Z2-7]{16,128}$/;
const CODE = /^[0-9]{6}$/;

type Answer = { readonly status: number; readonly body: Record<string, unknown> };

const LIMITS: ReadonlyArray<[string, IdpFailure]> = [
  ["LimitExceededException", "rate_limited"],
  ["TooManyRequestsException", "rate_limited"],
  ["TooManyFailedAttemptsException", "rate_limited"],
];
const COMMON = new Map<string, IdpFailure>([["NotAuthorizedException", "denied"], ...LIMITS]);
const VERIFY = new Map<string, IdpFailure>([
  ...COMMON,
  ["EnableSoftwareTokenMFAException", "invalid_code"],
  ["CodeMismatchException", "invalid_code"],
]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

const unavailable = (): { ok: false; kind: "unavailable" } => ({ ok: false, kind: "unavailable" });

export function cognitoTotpPort(pool: PoolConfig, fetchImpl: typeof fetch = fetch): TotpPort {
  const url = `https://cognito-idp.${pool.region}.amazonaws.com/`;

  async function post(target: string, body: Record<string, unknown>): Promise<Answer | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), TIMEOUT_MS);
    });
    const exchange = (async (): Promise<Answer | null> => {
      try {
        const res = await fetchImpl(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-amz-json-1.1",
            "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const text = await res.text();
        if (text.length > MAX_ANSWER_CHARS) return null;
        const parsed = text === "" && res.status === 200 ? {} : asRecord(JSON.parse(text));
        return parsed === undefined ? null : { status: res.status, body: parsed };
      } catch {
        return null;
      }
    })();
    try {
      return await Promise.race([exchange, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  function failure(answer: Answer, table: ReadonlyMap<string, IdpFailure>): IdpResult<never> {
    if (answer.status !== 400) return unavailable();
    const raw = answer.body["__type"];
    const type = typeof raw === "string" ? raw.slice(raw.lastIndexOf("#") + 1) : undefined;
    const kind = type === undefined ? undefined : table.get(type);
    return kind === undefined ? unavailable() : { ok: false, kind };
  }

  const tokenOk = (token: unknown): token is string =>
    typeof token === "string" && token.length > 0 && token.length <= MAX_TOKEN_CHARS;

  return {
    async associate(accessToken) {
      if (!tokenOk(accessToken)) return { ok: false, kind: "denied" };
      const answer = await post("AssociateSoftwareToken", { AccessToken: accessToken });
      if (answer === null) return unavailable();
      if (answer.status !== 200) return failure(answer, COMMON);
      const secret = answer.body["SecretCode"];
      return typeof secret === "string" && SECRET.test(secret)
        ? { ok: true, value: { secret } }
        : unavailable();
    },

    async verify(accessToken, code) {
      if (typeof code !== "string" || !CODE.test(code)) return { ok: false, kind: "invalid_code" };
      if (!tokenOk(accessToken)) return { ok: false, kind: "denied" };
      const answer = await post("VerifySoftwareToken", {
        AccessToken: accessToken,
        UserCode: code,
        FriendlyDeviceName: "PanelPay",
      });
      if (answer === null) return unavailable();
      if (answer.status !== 200) return failure(answer, VERIFY);
      const status = answer.body["Status"];
      if (status === "SUCCESS") return { ok: true, value: true };
      return status === "ERROR" ? { ok: false, kind: "invalid_code" } : unavailable();
    },

    async setPreference(accessToken, enabled) {
      if (!tokenOk(accessToken) || typeof enabled !== "boolean") {
        return { ok: false, kind: "denied" };
      }
      const answer = await post("SetUserMFAPreference", {
        AccessToken: accessToken,
        SoftwareTokenMfaSettings: { Enabled: enabled, PreferredMfa: enabled },
      });
      if (answer === null) return unavailable();
      if (answer.status !== 200) return failure(answer, COMMON);
      return { ok: true, value: true };
    },

    async mfaState(accessToken) {
      if (!tokenOk(accessToken)) return { ok: false, kind: "denied" };
      const answer = await post("GetUser", { AccessToken: accessToken });
      if (answer === null) return unavailable();
      if (answer.status !== 200) return failure(answer, COMMON);
      const list = answer.body["UserMFASettingList"];
      // Absent: no MFA at all, which is "off". Anything but an array of strings is not understood (R16).
      if (list === undefined) return { ok: true, value: { totp: false } };
      if (!Array.isArray(list) || !list.every((item) => typeof item === "string")) {
        return unavailable();
      }
      return { ok: true, value: { totp: list.includes("SOFTWARE_TOKEN_MFA") } };
    },

    async signOutEverywhere(accessToken) {
      if (!tokenOk(accessToken)) return { ok: false, kind: "denied" };
      const answer = await post("GlobalSignOut", { AccessToken: accessToken });
      if (answer === null) return unavailable();
      if (answer.status !== 200) return failure(answer, COMMON);
      return { ok: true, value: true };
    },
  };
}
