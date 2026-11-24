import { randomUUID } from "node:crypto";
import { normalizeBdMobile } from "@tc/core";
import { limitKey } from "@tc/db";
import { useTempDatabase } from "@tc/db/testing";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hashCode } from "../otp/codes";
import { phoneSubject } from "../otp/keys";
import { OTP_SEND_RULES } from "../otp/policy";
import { sendPhoneOtp } from "../otp/send";
import { PEPPER, freshIp, freshPhone, lastCode } from "./harness";
import { otpTestKit } from "./kit";
import { makeSend } from "./send-helper";

const t = useTempDatabase();
const kit = otpTestKit(t);
const { clock, sms, deps, customer } = kit;
const send = makeSend(kit);
const rowsOf = async (customerId: string) =>
  (
    await t.pool.query("select * from otp_challenges where customer_id = $1 order by created_at", [
      customerId,
    ])
  ).rows;
const sendCount = async (e164: string) =>
  (
    await t.pool.query("select count from rate_limits where scope_key = $1", [
      limitKey("phone", phoneSubject(PEPPER, e164), "otp.send", 3600),
    ])
  ).rows;
beforeEach(kit.reset);
afterEach(() => vi.restoreAllMocks());

// WPU-Z3: the text is the gateway's own format, the same for both locales, and the challenge id is the
// reference of the message.
it.each(["bn", "en"] as const)(
  "sends the code by SMS (%s: the gateway's format), with the challenge id as reference, answers without the code, and stores only its hash",
  async (locale) => {
    const s = await customer(locale);
    const phone = freshPhone();
    const to = normalizeBdMobile(phone)!;
    const r = await send(s, { phone });
    expect(r).toEqual({
      ok: true,
      value: {
        challengeId: expect.any(String),
        phoneMasked: "+880*******" + to.slice(-3),
        replayed: false,
        expiresAt: new Date("2026-11-11T10:05:00.000Z"),
        resendAt: new Date("2026-11-11T10:01:00.000Z"),
      },
    });
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]!.to).toBe(to);
    expect(sms.sent[0]!.text).toBe(
      `PanelPay Your OTP is: ${lastCode(sms, to)}. Please do not share your OTP with anyone.`,
    );
    expect(sms.sent[0]!.reference).toBe(r.ok ? r.value.challengeId : "no challenge");
    const rows = await rowsOf(s.customerId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: r.ok ? r.value.challengeId : "",
      phone: to,
      attempts: 0,
      consumed_at: null,
      code_hash: hashCode(PEPPER, rows[0].id, to, lastCode(sms, to)),
    });
    expect(new Date(rows[0].expires_at)).toEqual(new Date("2026-11-11T10:05:00.000Z"));
    expect(JSON.stringify(r)).not.toContain(lastCode(sms, to));
  },
);

it("a code with leading zeros is sent whole", async () => {
  const s = await customer();
  const phone = freshPhone();
  await send(s, { phone }, deps({ randomInt: () => 42 }));
  expect(sms.sent[0]!.text).toContain("000042");
  const [row] = await rowsOf(s.customerId);
  expect(row.code_hash).toBe(hashCode(PEPPER, row.id, normalizeBdMobile(phone)!, "000042"));
});

it("the same key twice is one SMS, one challenge and one count: the second answer is a replay of the first", async () => {
  const s = await customer();
  const input = { phone: freshPhone(), ip: freshIp(), idempotencyKey: randomUUID() };
  const first = await sendPhoneOtp(deps(), s, input);
  clock.advanceSeconds(5);
  expect(await sendPhoneOtp(deps(), s, input)).toEqual({
    ok: true,
    value: { ...(first.ok ? first.value : {}), replayed: true },
  });
  expect(sms.sent).toHaveLength(1);
  expect(await rowsOf(s.customerId)).toHaveLength(1);
  expect(await sendCount(normalizeBdMobile(input.phone)!)).toEqual([{ count: 1 }]);
});

it("two identical requests at the same moment (a double click) send one SMS", async () => {
  const s = await customer();
  const input = { phone: freshPhone(), ip: freshIp(), idempotencyKey: randomUUID() };
  const results = await Promise.all([
    sendPhoneOtp(deps(), s, input),
    sendPhoneOtp(deps(), s, input),
  ]);
  expect(results.map((r) => (r.ok ? r.value.replayed : r.error)).sort()).toEqual([false, true]);
  expect(sms.sent).toHaveLength(1);
  expect(await rowsOf(s.customerId)).toHaveLength(1);
});

it("the same key for another number, or after its challenge was closed by a newer one, is a conflict and sends nothing", async () => {
  const s = await customer();
  const key = randomUUID();
  await send(s, { idempotencyKey: key });
  sms.reset();
  expect(await send(s, { idempotencyKey: key })).toEqual({ ok: false, error: "conflict" }); // another number
  const phone = freshPhone();
  const key2 = randomUUID();
  await send(s, { phone, idempotencyKey: key2 });
  clock.advanceSeconds(61);
  await send(s); // a newer challenge closes the one of key2
  sms.reset();
  expect(await send(s, { phone, idempotencyKey: key2 })).toEqual({ ok: false, error: "conflict" });
  expect(sms.sent).toEqual([]);
});

it.each([
  [{ phone: "01712345" }, { phone: "invalid" }],
  [{ phone: "+919876543210" }, { phone: "invalid" }],
  [{ idempotencyKey: "" }, { idempotencyKey: "invalid" }],
  [{ idempotencyKey: "a b" }, { idempotencyKey: "invalid" }],
  [{ idempotencyKey: "k".repeat(129) }, { idempotencyKey: "invalid" }],
  [{ ip: "not an ip" }, { ip: "invalid" }],
  [
    { ip: "", phone: "x" },
    { ip: "invalid", phone: "invalid" },
  ],
])(
  "input %j is a validation failure %j that sends nothing and stores nothing",
  async (over, fields) => {
    const s = await customer();
    expect(await send(s, over)).toEqual({ ok: false, error: "validation", fields });
    expect(sms.sent).toEqual([]);
    expect(await rowsOf(s.customerId)).toEqual([]);
  },
);

it("the fourth send to one number in an hour is refused with the seconds left, and the refusal leaves nothing behind", async () => {
  const s = await customer();
  const phone = freshPhone();
  for (let i = 0; i < 3; i++) {
    expect((await send(s, { phone })).ok).toBe(true);
    clock.advanceSeconds(60);
  }
  const before = await rowsOf(s.customerId); // 10:03:00 now
  expect(await send(s, { phone })).toEqual({
    ok: false,
    error: "rate_limited",
    data: { retryAfterSeconds: 3420 },
  });
  expect(sms.sent).toHaveLength(3);
  expect(await rowsOf(s.customerId)).toEqual(before); // no new challenge, and the open one was not closed
  expect(await sendCount(normalizeBdMobile(phone)!)).toEqual([{ count: 3 }]);
});

it("a new send closes the earlier open challenge of the customer", async () => {
  const s = await customer();
  await send(s);
  clock.advanceSeconds(60);
  await send(s);
  const rows = await rowsOf(s.customerId);
  expect(rows.map((r) => r.consumed_at !== null)).toEqual([true, false]);
  expect(rows[0].consumed_at).toEqual(new Date("2026-11-11T10:01:00.000Z"));
});

it.each([
  ["rejected", "validation", { phone: "rejected" }],
  ["unavailable", "upstream_unavailable", undefined],
  ["throw", "upstream_unavailable", undefined],
  ["hang", "upstream_unavailable", undefined],
] as const)(
  "when the gateway answers %s: %s, the challenge is closed, the send still counts, and nothing leaks",
  async (mode, error, fields) => {
    const s = await customer();
    const phone = freshPhone();
    const to = normalizeBdMobile(phone)!;
    sms.failNext(mode);
    const r = await send(s, { phone }, deps({ sendTimeoutMs: 30 }));
    expect(r).toEqual({ ok: false, error, ...(fields ? { fields } : {}) });
    const rows = await rowsOf(s.customerId);
    expect(rows).toHaveLength(1);
    expect(rows[0].consumed_at).toEqual(new Date("2026-11-11T10:00:00.000Z"));
    expect(await sendCount(to)).toEqual([{ count: 1 }]);
    expect(JSON.stringify(r)).not.toMatch(/\+880|0171|gateway failed|[0-9]{6}/);
    // a guard against a later change: the code must never be queued (grant matrix, section 5); the all-tables scan of Task 9 is the check that would find the code itself
    expect((await t.pool.query("select count(*)::int as n from notifications")).rows[0].n).toBe(0);
  },
);

it("a database error inside the send leaves as fixed text: no number, no hash, no cause (R14)", async () => {
  const s = await customer();
  const phone = freshPhone();
  const to = normalizeBdMobile(phone)!;
  const failing = deps({
    run: () =>
      Promise.reject(
        Object.assign(new Error(`insert into otp_challenges params: ${to}, v1.${"a".repeat(64)}`), {
          cause: new Error(to),
        }),
      ),
  });
  const error = await send(s, { phone }, failing).then(
    () => null,
    (e: unknown) => e as Error,
  );
  expect(error).toBeInstanceOf(Error);
  expect(error!.message).toBe("otp: send failed");
  expect(error!.message).not.toContain(to);
  expect((error as { cause?: unknown }).cause).toBeUndefined();
  expect(sms.sent).toHaveLength(0);
});

it("the timeout timer of the gateway call is cleared once the gateway has answered", async () => {
  const s = await customer();
  const set = vi.spyOn(globalThis, "setTimeout");
  const clear = vi.spyOn(globalThis, "clearTimeout");
  expect((await send(s, {}, deps({ sendTimeoutMs: 12_345 }))).ok).toBe(true);
  const i = set.mock.calls.findIndex((call) => call[1] === 12_345);
  expect(i).toBeGreaterThanOrEqual(0);
  expect(clear).toHaveBeenCalledWith(set.mock.results[i]!.value);
});

it("a key shorter than 32 characters, an empty or partial rule list, a locale without a text and a customer id that is not a UUID are TypeErrors, and nothing is sent or stored", async () => {
  const s = await customer();
  await expect(send(s, {}, deps({ pepper: "short" }))).rejects.toThrow(TypeError);
  await expect(send(s, {}, deps({ limits: [] }))).rejects.toThrow(
    new TypeError("otp: no send limit is configured"),
  );
  for (const limits of [
    OTP_SEND_RULES.filter((r) => r.kind !== "ip"),
    OTP_SEND_RULES.filter((r) => r.kind !== "phone"),
  ]) {
    await expect(send(s, {}, deps({ limits }))).rejects.toThrow(
      new TypeError("otp: the send limits need a phone rule and an ip rule"),
    );
  }
  await expect(send({ customerId: "42", locale: "bn" })).rejects.toThrow(TypeError);
  const phone = freshPhone();
  await expect(send({ ...s, locale: "fr" as never }, { phone })).rejects.toThrow(TypeError); // the text is built before any row or counter
  expect(await sendCount(normalizeBdMobile(phone)!)).toEqual([]);
  expect(await rowsOf(s.customerId)).toEqual([]);
  expect(sms.sent).toEqual([]);
});
