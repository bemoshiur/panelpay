import { inspect } from "node:util";
import type { InitializeRequest } from "@tc/eps";
import { OTP_SEND_RULES } from "@tc/notify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  bridgeLoaded: 0,
  authLoaded: 0,
  configureAuth: vi.fn(),
  cookie: "a=b" as string | null,
}));

// The factory runs only when the module is really imported: it is the spy on the dynamic import.
vi.mock("./fakes/eps-bridge.ts", async (importOriginal) => {
  state.bridgeLoaded += 1;
  return importOriginal();
});
vi.mock("./fakes/dev-auth.ts", async (importOriginal) => {
  state.authLoaded += 1;
  return importOriginal();
});
vi.mock("next/headers", () => ({
  headers: async () => new Headers(state.cookie === null ? {} : { cookie: state.cookie }),
}));
vi.mock("@tc/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tc/auth")>()),
  configureAuth: state.configureAuth,
}));

const SECRETS = {
  SST_RESOURCE_EpsMerchantId: '{"type":"sst.sst.Secret","value":"planted-merchant-1111"}',
  SST_RESOURCE_EpsStoreId: '{"type":"sst.sst.Secret","value":"planted-store-2222"}',
  SST_RESOURCE_EpsUsername: '{"type":"sst.sst.Secret","value":"planted-user-3333"}',
  SST_RESOURCE_EpsPassword: '{"type":"sst.sst.Secret","value":"planted-password-4444"}',
  SST_RESOURCE_EpsHashKey: '{"type":"sst.sst.Secret","value":"planted-hashkey-5555"}',
  SST_RESOURCE_EpsLimitKey: '{"type":"sst.sst.Secret","value":"planted-limitkey-6666"}',
};
const PLANTED = ["1111", "2222", "3333", "4444", "5555", "6666"].map((n) => `-${n}`);

const STAGING = {
  TC_STAGE: "staging",
  APP_ORIGIN: "https://cloud.example.com",
  NODE_ENV: "production",
};
const FAKE = {
  TC_STAGE: "test",
  APP_ORIGIN: "http://localhost:3000",
  NODE_ENV: "test",
  TC_EPS: "fake",
};

// The secrets of these tests come from the SST_RESOURCE_<Name> variables of the environment object
// (envLinks); the run-time path through the SST SDK is secrets-sst.test.ts (WPU-Z15). getRuntime keeps
// its default, the SDK, with nothing linked.
async function load() {
  vi.resetModules();
  const runtime = await import("./runtime.ts");
  const { envLinks } = await import("@tc/db/links");
  const { linkedSecrets } = await import("./secrets.ts");
  const assembleRuntime = (env: Record<string, string | undefined>) =>
    runtime.assembleRuntime(env, linkedSecrets(envLinks(env)), envLinks(env));
  return { ...runtime, assembleRuntime };
}

beforeEach(() => {
  state.bridgeLoaded = 0;
  state.authLoaded = 0;
  state.configureAuth.mockReset();
  state.cookie = "a=b";
  delete (globalThis as Record<string, unknown>)["__tcWebRuntime"];
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("assembleRuntime: the real gateway", () => {
  it("five secrets and no sixth give no EPS (fail closed)", async () => {
    const { assembleRuntime } = await load();
    const five: Record<string, string | undefined> = { ...SECRETS };
    delete five["SST_RESOURCE_EpsLimitKey"];
    const built = await assembleRuntime({ ...STAGING, ...five });
    expect(built.runtime.eps).toBeNull();
    expect(built.deps).toBeNull();
    expect(state.bridgeLoaded).toBe(0);
  });

  it("any one missing secret gives no EPS", async () => {
    const { assembleRuntime } = await load();
    for (const name of Object.keys(SECRETS)) {
      const env: Record<string, string | undefined> = { ...STAGING, ...SECRETS };
      delete env[name];
      expect((await assembleRuntime(env)).runtime.eps, name).toBeNull();
    }
  });

  it("all six secrets give an EPS, and the runtime shows none of them", async () => {
    const { assembleRuntime } = await load();
    const { runtime } = await assembleRuntime({ ...STAGING, ...SECRETS });
    expect(runtime.eps).not.toBeNull();
    expect(typeof runtime.eps?.startTopUp).toBe("function");
    expect(runtime.config).toEqual({
      stage: "staging",
      appOrigin: "https://cloud.example.com",
      epsMode: "sandbox",
      fakes: false,
      fake: { eps: false, idp: false, sms: false },
    });
    const shown = [
      JSON.stringify(runtime),
      inspect(runtime, { depth: 10, showHidden: true }),
      String(runtime),
    ].join("\n");
    for (const planted of PLANTED) expect(shown).not.toContain(planted);
  });

  it("builds EpsDeps exactly: return urls from the origin, the clock, the transaction and the id", async () => {
    const { assembleRuntime } = await load();
    const { deps } = await assembleRuntime({ ...STAGING, ...SECRETS });
    expect(deps?.urls).toEqual({
      successUrl: "https://cloud.example.com/pay/eps/success",
      failUrl: "https://cloud.example.com/pay/eps/fail",
      cancelUrl: "https://cloud.example.com/pay/eps/cancel",
    });
    expect(Math.abs((deps?.clock.now().getTime() ?? 0) - Date.now())).toBeLessThan(1000);
    expect(deps?.newPaymentId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(deps?.randomBytes(16)).toHaveLength(16);
    expect(typeof deps?.run).toBe("function");
    expect(deps?.limitKey).toBe("planted-limitkey-6666");
  });

  it("a production config with TC_EPS=fake throws and never reaches the dynamic import", async () => {
    const { assembleRuntime } = await load();
    await expect(
      assembleRuntime({ ...STAGING, TC_STAGE: "production", TC_EPS: "fake", ...SECRETS }),
    ).rejects.toThrow();
    await expect(assembleRuntime({ ...STAGING, TC_EPS: "fake" })).rejects.toThrow();
    expect(state.bridgeLoaded).toBe(0);
    expect(state.authLoaded).toBe(0);
  });

  it("a production config without fakes never loads the fakes either", async () => {
    const { assembleRuntime } = await load();
    await assembleRuntime({ ...STAGING, TC_STAGE: "production", ...SECRETS });
    expect(state.bridgeLoaded).toBe(0);
    expect(state.authLoaded).toBe(0);
  });
});

// WPU-Z11: production goes live before the EPS production keys exist. scripts/golive/stage-secrets.sh
// stores the placeholder `not-configured` for each EPS value left empty (and a random EpsLimitKey).
describe("assembleRuntime: EPS not configured yet (WPU-Z11)", () => {
  const PLACEHOLDER = '{"type":"sst.sst.Secret","value":"not-configured"}';
  const EPS_FIVE = ["EpsMerchantId", "EpsStoreId", "EpsUsername", "EpsPassword", "EpsHashKey"];
  const GO_LIVE: Record<string, string> = {
    ...SECRETS,
    ...Object.fromEntries(EPS_FIVE.map((name) => [`SST_RESOURCE_${name}`, PLACEHOLDER])),
  };
  const PRODUCTION = { ...STAGING, TC_STAGE: "production" };

  it("the web app starts in production with the placeholders, with no EPS and no call to EPS", async () => {
    const { assembleRuntime } = await load();
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const built = await assembleRuntime({ ...PRODUCTION, ...GO_LIVE });
    expect(built.runtime.config.stage).toBe("production");
    expect(built.runtime.config.epsMode).toBe("production");
    expect(built.runtime.eps).toBeNull();
    expect(built.deps).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(state.bridgeLoaded).toBe(0);
  });

  it("one EPS value on the placeholder is enough for no EPS (all or nothing)", async () => {
    const { assembleRuntime } = await load();
    for (const name of EPS_FIVE) {
      const env = { ...PRODUCTION, ...SECRETS, [`SST_RESOURCE_${name}`]: PLACEHOLDER };
      const built = await assembleRuntime(env);
      expect(built.runtime.eps, name).toBeNull();
      expect(built.deps, name).toBeNull();
    }
  });

  it("logs nothing and shows neither the placeholder nor a secret", async () => {
    const { assembleRuntime } = await load();
    const lines = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
    ];
    const { runtime } = await assembleRuntime({ ...PRODUCTION, ...GO_LIVE });
    for (const spy of lines) expect(spy).not.toHaveBeenCalled();
    const shown = [
      JSON.stringify(runtime),
      inspect(runtime, { depth: 10, showHidden: true }),
      String(runtime),
    ].join("\n");
    expect(shown).not.toContain("not-configured");
    expect(shown).not.toContain("planted-limitkey-6666");
  });
});

describe("assembleRuntime: fake mode", () => {
  it("builds an EPS without secrets, over the dev bridge, with hand-built http return urls", async () => {
    const { assembleRuntime } = await load();
    const { runtime, deps, verifier } = await assembleRuntime(FAKE);
    expect(runtime.config.fakes).toBe(true);
    expect(runtime.eps).not.toBeNull();
    expect(state.bridgeLoaded).toBe(1);
    expect(verifier).toBeDefined();
    expect(deps?.urls.successUrl).toBe("http://localhost:3000/pay/eps/success");
    const request: InitializeRequest = {
      merchantTransactionId: "0123456789abcdef0123456789abcdef",
      customerOrderId: "o1",
      totalAmountMinor: 50_000n,
      ipAddress: "127.0.0.1",
      productName: "Wallet top-up",
      ...(deps?.urls as { successUrl: string; failUrl: string; cancelUrl: string }),
    };
    const answer = await deps?.gateway.initialize(request);
    expect(answer?.ok).toBe(true);
    if (answer?.ok) expect(answer.redirectUrl).toMatch(/^\/dev\/eps\/checkout\?data=\d+$/);
  });
});

describe("assembleRuntime: the auth parts", () => {
  const POOL = {
    COGNITO_CUSTOMER_POOL_ID: "eu-west-1_Abc123XyZ",
    COGNITO_CUSTOMER_CLIENT_ID: "abcdefghij1234567890",
  };
  // The example client of the Cognito API reference, not a real one (R3).
  const SIGN_UP_LINK = {
    SST_RESOURCE_CustomerSignUpClient:
      '{"id":"1example23456789","secret":"13ka4h7u28d9oo44tqpq9djqsfvhvu8rk4d2ighvpu0k8fj1c2r9"}',
  };
  // Round 4: the token-issuing customer client has a secret too; its link carries the same client id as
  // COGNITO_CUSTOMER_CLIENT_ID. A made-up value (R3).
  const CUSTOMER_LINK = {
    SST_RESOURCE_CustomerAppClient:
      '{"id":"abcdefghij1234567890","secret":"customer0app0client0secret0abcdef"}',
  };
  const LINKS = { ...SIGN_UP_LINK, ...CUSTOMER_LINK };
  const KEYS = {
    SST_RESOURCE_AuthLimitKey:
      '{"type":"sst.sst.Secret","value":"planted-authkey-7777-0123456789abcdef"}',
    SST_RESOURCE_OtpHashKey:
      '{"type":"sst.sst.Secret","value":"planted-otpkey-8888-0123456789abcdef"}',
  };

  it("without AuthLimitKey authLimitKey is null; a key shorter than 32 characters is the same", async () => {
    const { assembleRuntime } = await load();
    expect((await assembleRuntime({ ...STAGING, ...POOL })).runtime.authLimitKey).toBeNull();
    const short = { SST_RESOURCE_AuthLimitKey: '{"value":"short"}' };
    expect(
      (await assembleRuntime({ ...STAGING, ...POOL, ...short })).runtime.authLimitKey,
    ).toBeNull();
    const found = await assembleRuntime({ ...STAGING, ...POOL, ...KEYS });
    expect(found.runtime.authLimitKey).toBe("planted-authkey-7777-0123456789abcdef");
  });

  it("with the pool variables missing or malformed identity is null", async () => {
    const { assembleRuntime } = await load();
    expect((await assembleRuntime({ ...STAGING })).runtime.identity).toBeNull();
    const bad = { COGNITO_CUSTOMER_POOL_ID: "nope", COGNITO_CUSTOMER_CLIENT_ID: "x" };
    expect((await assembleRuntime({ ...STAGING, ...bad })).runtime.identity).toBeNull();
    const ok = await assembleRuntime({ ...STAGING, ...POOL, ...LINKS });
    expect(typeof ok.runtime.identity?.signUp).toBe("function");
  });

  // WPU-X12: the server-only sign-up client is the SST link CustomerSignUpClient ({ id, secret }).
  // Without it, or with a malformed one, there is no identity provider at all (R16).
  it("without the sign-up client link, or with a malformed one, identity is null", async () => {
    const { assembleRuntime } = await load();
    expect((await assembleRuntime({ ...STAGING, ...POOL })).runtime.identity).toBeNull();
    for (const raw of [
      "not json",
      '{"id":"1example23456789"}',
      '{"id":"1example23456789","secret":"not-configured"}',
      '{"id":"bad id","secret":"13ka4h7u28d9oo44tqpq9djqsfvhvu8rk4d2ighvpu0k8fj1c2r9"}',
    ]) {
      const env = {
        ...STAGING,
        ...POOL,
        ...CUSTOMER_LINK,
        SST_RESOURCE_CustomerSignUpClient: raw,
      };
      expect((await assembleRuntime(env)).runtime.identity, raw).toBeNull();
    }
  });

  // Round 4: the same for the customer client's link, which must also name the client of the pool.
  it("without the customer client link, or with a malformed or foreign one, identity is null", async () => {
    const { assembleRuntime } = await load();
    expect(
      (await assembleRuntime({ ...STAGING, ...POOL, ...SIGN_UP_LINK })).runtime.identity,
    ).toBeNull();
    for (const raw of [
      "not json",
      '{"id":"abcdefghij1234567890"}',
      '{"id":"abcdefghij1234567890","secret":"not-configured"}',
      '{"id":"zyxwvutsrq0987654321","secret":"customer0app0client0secret0abcdef"}',
    ]) {
      const env = { ...STAGING, ...POOL, ...SIGN_UP_LINK, SST_RESOURCE_CustomerAppClient: raw };
      expect((await assembleRuntime(env)).runtime.identity, raw).toBeNull();
    }
  });

  // Round 4 (security review, low): a trigger refusal is folded to "ok" for the page and logged on its own
  // as a fixed reason, with no address, so an alarm can match it.
  it("logs a refusing trigger as trigger_refused, with no address, and answers ok", async () => {
    const refused = () =>
      new Response(JSON.stringify({ __type: "UserLambdaValidationException", message: "x" }), {
        status: 400,
      });
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(refused()));
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    const { assembleRuntime } = await load();
    const { runtime } = await assembleRuntime({ ...STAGING, ...POOL, ...LINKS });
    const email = "planted.person@example.test";
    expect(await runtime.identity?.forgotPassword(email)).toEqual({ ok: true, value: true });
    expect(await runtime.identity?.resendConfirmationCode(email)).toEqual({
      ok: true,
      value: true,
    });
    expect(lines).toEqual([
      JSON.stringify({ event: "auth.forgot", reason: "trigger_refused" }),
      JSON.stringify({ event: "auth.resend", reason: "trigger_refused" }),
    ]);
    expect(lines.join("")).not.toContain(email);
  });

  // WPU-Z3: the SMS gateway (Gennet). Planted values, never real ones (R3).
  const SMS = {
    SST_RESOURCE_SmsApiKey: '{"type":"sst.sst.Secret","value":"planted-smstoken-9999"}',
    SST_RESOURCE_SmsSenderId: '{"type":"sst.sst.Secret","value":"PLANTEDSENDER0000"}',
  };

  it("outside fakes the OTP service needs the hashing key and both secrets of the SMS gateway (WPU-Z3)", async () => {
    const { assembleRuntime } = await load();
    expect((await assembleRuntime({ ...STAGING, ...POOL, ...KEYS })).runtime.otp).toBeNull();
    for (const name of [...Object.keys(SMS), "SST_RESOURCE_OtpHashKey"]) {
      const env: Record<string, string | undefined> = { ...STAGING, ...POOL, ...KEYS, ...SMS };
      delete env[name];
      expect((await assembleRuntime(env)).runtime.otp, name).toBeNull();
    }
    for (const stage of ["staging", "production"]) {
      const { runtime } = await assembleRuntime({
        ...STAGING,
        TC_STAGE: stage,
        ...POOL,
        ...KEYS,
        ...SMS,
      });
      expect(runtime.otp?.sms.constructor.name, stage).toBe("GatewaySmsProvider");
      expect(runtime.otp?.pepper, stage).toBe("planted-otpkey-8888-0123456789abcdef");
      // vi.resetModules gives the runtime its own copy of @tc/notify: equal, not the same array
      expect(runtime.otp?.limits, stage).toEqual(OTP_SEND_RULES);
    }
  });

  // Final review M2: the SMS secrets may stay on the placeholder not-configured (SMS off). Then there is no
  // OTP service (the screens show "SMS unavailable") and no request ever reaches Gennet.
  it("either SMS secret on the placeholder not-configured is no OTP service and no call to Gennet", async () => {
    const { assembleRuntime } = await load();
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const placeholder = '{"type":"sst.sst.Secret","value":"not-configured"}';
    for (const stage of ["staging", "production"]) {
      for (const off of [
        { SST_RESOURCE_SmsApiKey: placeholder },
        { SST_RESOURCE_SmsSenderId: placeholder },
        { SST_RESOURCE_SmsApiKey: placeholder, SST_RESOURCE_SmsSenderId: placeholder },
      ]) {
        const env = { ...STAGING, TC_STAGE: stage, ...POOL, ...KEYS, ...SMS, ...off };
        expect((await assembleRuntime(env)).runtime.otp, stage).toBeNull();
      }
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("in stage local or test without the fake switch no gateway is built, even with its secrets", async () => {
    const { assembleRuntime } = await load();
    for (const stage of ["local", "test"]) {
      const { runtime } = await assembleRuntime({
        TC_STAGE: stage,
        APP_ORIGIN: "http://localhost:3000",
        NODE_ENV: "test",
        ...POOL,
        ...KEYS,
        ...SMS,
      });
      expect(runtime.otp, stage).toBeNull();
    }
  });

  it("the gateway of the runtime posts to Gennet with the two secrets and the reference (fetch stubbed)", async () => {
    const { assembleRuntime } = await load();
    const { runtime } = await assembleRuntime({ ...STAGING, ...POOL, ...KEYS, ...SMS });
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      const answer = {
        status: "SUCCESS",
        status_code: 200,
        error_message: "",
        smsinfo: [{ sms_status: "SUCCESS", status_message: "Success", reference_id: "gw-1" }],
      };
      return new Response(JSON.stringify(answer), { status: 200 });
    });
    const text = "PanelPay Your OTP is: 123456. Please do not share your OTP with anyone.";
    expect(await runtime.otp?.sms.send("+8801712345678", text, "challenge-1")).toEqual({
      ok: true,
      messageId: "gw-1",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://isms.gennet.com.bd/api/v3/send-sms");
    expect(calls[0]?.body).toMatchObject({
      api_token: "planted-smstoken-9999",
      sid: "PLANTEDSENDER0000",
      msisdn: "8801712345678",
      sms: text,
    });
    expect(calls[0]?.body["csms_id"]).toMatch(/^[A-Z0-9]{20}$/);
  });

  it("the runtime never shows the OTP key or the SMS secrets, in JSON or in inspect", async () => {
    const { assembleRuntime } = await load();
    for (const env of [
      { ...STAGING, ...POOL, ...KEYS },
      { ...STAGING, ...POOL, ...KEYS, ...SMS },
    ]) {
      const { runtime } = await assembleRuntime(env);
      const shown = [JSON.stringify(runtime), inspect(runtime, { depth: 10, showHidden: true })];
      for (const planted of ["planted-otpkey-8888", "planted-smstoken-9999", "PLANTEDSENDER0000"]) {
        expect(shown.join("\n")).not.toContain(planted);
      }
    }
  });

  it("fake mode builds the in-memory identity provider, the SMS provider and random keys", async () => {
    const { assembleRuntime } = await load();
    const { runtime } = await assembleRuntime({
      ...FAKE,
      ...POOL,
      TC_IDP: "fake",
      TC_SMS: "fake",
    });
    expect(runtime.config.fake).toEqual({ eps: true, idp: true, sms: true });
    expect(runtime.identity?.constructor.name).toBe("InMemoryIdentityProvider");
    expect(runtime.otp).not.toBeNull();
    expect(typeof runtime.otp?.sms.send).toBe("function");
    expect(runtime.authLimitKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("TC_IDP=fake in a production-like config throws before any fake loads", async () => {
    const { assembleRuntime } = await load();
    await expect(assembleRuntime({ ...STAGING, ...POOL, TC_IDP: "fake" })).rejects.toThrow();
    await expect(assembleRuntime({ ...STAGING, ...POOL, TC_SMS: "fake" })).rejects.toThrow();
    expect(state.authLoaded).toBe(0);
  });
});

describe("assembleRuntime: log and alert (R14)", () => {
  it("log writes one JSON line and drops keys it does not know", async () => {
    const { assembleRuntime } = await load();
    const { deps } = await assembleRuntime({ ...STAGING, ...SECRETS });
    const write = vi.spyOn(console, "log").mockImplementation(() => {});
    deps?.log("eps.return", {
      state: "credited",
      reason: "success",
      phone: "01712345678",
      token: "t",
    } as Record<string, string>);
    expect(write).toHaveBeenCalledTimes(1);
    const line = String(write.mock.calls[0]?.[0]);
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual({ event: "eps.return", state: "credited", reason: "success" });
  });

  it("alert writes one payment_review line with decimal text amounts and no other field", async () => {
    const { assembleRuntime } = await load();
    const { deps } = await assembleRuntime({ ...STAGING, ...SECRETS });
    const write = vi.spyOn(console, "log").mockImplementation(() => {});
    await deps?.alert.raise({
      kind: "payment_review",
      paymentId: "p1",
      reason: "amount_mismatch",
      expectedMinor: 50_000n,
      gotMinor: null,
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual({
      event: "payment_review",
      severity: "alert",
      paymentId: "p1",
      reason: "amount_mismatch",
      expectedMinor: "50000",
      gotMinor: null,
    });
  });

  it("a failing sink never breaks the caller", async () => {
    const { assembleRuntime } = await load();
    const { deps } = await assembleRuntime({ ...STAGING, ...SECRETS });
    vi.spyOn(console, "log").mockImplementation(() => {
      throw new Error("sink down");
    });
    expect(() => deps?.log("x", { state: "a" })).not.toThrow();
    await expect(
      deps?.alert.raise({
        kind: "payment_review",
        paymentId: "p",
        reason: "r",
        expectedMinor: 1n,
        gotMinor: 2n,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("getRuntime", () => {
  function stub(env: Record<string, string>) {
    for (const [k, v] of Object.entries({
      COGNITO_CUSTOMER_POOL_ID: "eu-west-1_Abc123XyZ",
      COGNITO_CUSTOMER_CLIENT_ID: "abcdefghij1234567890",
      ...env,
    })) {
      vi.stubEnv(k, v);
    }
  }

  it("is cached: two calls give one object and configure auth once", async () => {
    stub(FAKE);
    const { getRuntime } = await load();
    const [a, b] = await Promise.all([getRuntime(), getRuntime()]);
    expect(a).toBe(b);
    expect(await getRuntime()).toBe(a);
    expect(state.configureAuth).toHaveBeenCalledTimes(1);
  });

  it("configures auth with the dev verifier in fake mode and reads the cookie header", async () => {
    stub(FAKE);
    const { getRuntime } = await load();
    await getRuntime();
    const arg = state.configureAuth.mock.calls[0]?.[0] as {
      deps?: { verifier?: { verify: (t: string) => Promise<{ ok: boolean }> } };
      readCookieHeader: () => Promise<string | null>;
      config: { customer: { userPoolId: string } };
    };
    expect(arg.config.customer.userPoolId).toBe("eu-west-1_Abc123XyZ");
    expect(await arg.readCookieHeader()).toBe("a=b");
    expect((await arg.deps?.verifier?.verify("dev.someone"))?.ok).toBe(true);
  });

  it("configures auth with the real verifier outside fake mode", async () => {
    stub({ ...STAGING, ...SECRETS });
    const { getRuntime } = await load();
    await getRuntime();
    const arg = state.configureAuth.mock.calls[0]?.[0] as { deps?: unknown };
    expect(arg.deps).toBeUndefined();
    expect(state.bridgeLoaded).toBe(0);
    expect(state.authLoaded).toBe(0);
  });

  it("a failure is not cached: the next call tries again", async () => {
    stub({ ...FAKE, TC_STAGE: "nonsense" });
    const { getRuntime } = await load();
    await expect(getRuntime()).rejects.toThrow();
    vi.stubEnv("TC_STAGE", "test");
    await expect(getRuntime()).resolves.toBeDefined();
  });
});

describe("assembleRuntime: the reader of the Metrics tab (WPU-G4)", () => {
  const ID = "0190aaaa-0000-7000-8000-000000000001";
  const CUSTOMER = { customerId: "0190aaaa-0000-7000-8000-0000000000c1" };

  it("has none without a function name (the tab says 'not available', R16)", async () => {
    const { assembleRuntime } = await load();
    expect((await assembleRuntime({ ...STAGING, ...SECRETS })).runtime.reader).toBeNull();
  });

  it("has the invoke port when the function name is set, and builds no client until it is used", async () => {
    const { assembleRuntime } = await load();
    const { runtime } = await assembleRuntime({
      ...STAGING,
      ...SECRETS,
      READER_FUNCTION_NAME: "tc-staging-reader",
    });
    expect(runtime.reader).not.toBeNull();
    expect(typeof runtime.reader?.metrics).toBe("function");
  });

  it("a name that is an ARN gives none", async () => {
    const { assembleRuntime } = await load();
    const { runtime } = await assembleRuntime({
      ...STAGING,
      ...SECRETS,
      READER_FUNCTION_NAME: "arn:aws:lambda:ap-south-1:123456789012:function:x",
    });
    expect(runtime.reader).toBeNull();
  });

  it("in fake mode the dev reader answers the four series, and production has none", async () => {
    const { assembleRuntime } = await load();
    const { runtime } = await assembleRuntime(FAKE);
    const out = await runtime.reader?.metrics(ID, CUSTOMER, "1h");
    expect(out?.ok).toBe(true);
    if (out?.ok) {
      expect(out.series.map((s) => s.metric)).toEqual([
        "cpu",
        "networkIn",
        "networkOut",
        "statusCheckFailed",
      ]);
      expect(out.series[0]?.points).toHaveLength(12);
    }
    const prod = await assembleRuntime({ ...STAGING, TC_STAGE: "production", ...SECRETS });
    expect(prod.runtime.reader).toBeNull();
  });
});

describe("assembleRuntime: the KYC arrival check (WPU-Y3)", () => {
  it("has none without a function name, so a KYC submit refuses (R16)", async () => {
    const { assembleRuntime } = await load();
    expect((await assembleRuntime({ ...STAGING, ...SECRETS })).runtime.kycCheck).toBeNull();
  });

  it("has the kyc-check invoke port when the function name is set, and none for an ARN", async () => {
    const { assembleRuntime } = await load();
    const named = await assembleRuntime({
      ...STAGING,
      ...SECRETS,
      KYC_CHECK_FUNCTION_NAME: "tc-staging-kyc-check",
    });
    expect(typeof named.runtime.kycCheck?.check).toBe("function");
    // the store and crypto adapters are not there outside the fakes: the KYC screens stay "not open"
    expect(named.runtime.kyc).toBeNull();
    const arn = await assembleRuntime({
      ...STAGING,
      ...SECRETS,
      KYC_CHECK_FUNCTION_NAME: "arn:aws:lambda:ap-southeast-1:123456789012:function:x",
    });
    expect(arn.runtime.kycCheck).toBeNull();
  });

  it("in fake mode the stand-in answers from the fake store", async () => {
    const { assembleRuntime } = await load();
    const { runtime } = await assembleRuntime(FAKE);
    expect(runtime.kyc).not.toBeNull();
    const key =
      "kyc/0190aaaa-0000-7000-8000-0000000000c1/0190aaaa-0000-7000-8000-000000000001/0.png";
    expect(await runtime.kycCheck?.check("0190aaaa-0000-7000-8000-0000000000c1", key)).toEqual({
      present: false,
    });
  });
});
