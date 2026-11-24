import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryEmailProvider, SesEmailProvider, type SesTransport } from "../email/provider";
import { GatewaySmsProvider, type SmsTransport } from "../sms/gateway";
import { SMS_FAILURE_DETAILS, isSmsFailureDetail } from "../sms/provider";

const MSG = {
  to: "rahim.uddin@example.test",
  subject: "Subject",
  html: "<p>Hi</p>",
  text: "Hi",
  tag: "welcome",
};
afterEach(() => vi.useRealTimers());

describe("SesEmailProvider", () => {
  const make = (send: SesTransport["send"], timeoutMs?: number) =>
    new SesEmailProvider({
      transport: { send },
      from: "PanelPay <no-reply@ticoncloud.test>",
      timeoutMs,
    });

  it("sends UTF-8 with both parts, the sender and a tag, and returns the message id", async () => {
    const send = vi.fn().mockResolvedValue({ messageId: "ses-1" });
    const r = await make(send).send(MSG);
    expect(r).toEqual({ ok: true, messageId: "ses-1" });
    expect(send).toHaveBeenCalledWith({
      from: "PanelPay <no-reply@ticoncloud.test>",
      to: MSG.to,
      subject: MSG.subject,
      html: MSG.html,
      text: MSG.text,
      charset: "UTF-8",
      tag: "welcome",
    });
  });

  it.each([
    ["MessageRejected", "rejected"],
    ["BadRequestException", "rejected"],
    ["AccountSuspendedException", "unavailable"],
    ["SendingPausedException", "unavailable"],
    ["MailFromDomainNotVerifiedException", "unavailable"],
    ["LimitExceededException", "unavailable"],
    ["TooManyRequestsException", "unavailable"],
    ["NotFoundException", "unavailable"],
    ["SomethingNew", "unavailable"],
  ] as const)("maps the SES error %s to %s", async (name, reason) => {
    const err = Object.assign(new Error(`failed for ${MSG.to}: ${MSG.text}`), { name });
    const r = await make(vi.fn().mockRejectedValue(err)).send(MSG);
    expect(r).toEqual({ ok: false, reason });
    // the answer carries no text of the error, no address and no body (R14)
    expect(JSON.stringify(r)).not.toContain("example.test");
  });

  it("answers unavailable when the transport hangs past the time limit", async () => {
    vi.useFakeTimers();
    const p = make(() => new Promise(() => {}), 50).send(MSG);
    await vi.advanceTimersByTimeAsync(60);
    await expect(p).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("refuses an address that is not one, or a message with an empty part, before the transport", async () => {
    const send = vi.fn();
    const p = make(send);
    for (const bad of [
      { ...MSG, to: "not-an-address" },
      { ...MSG, to: "a@b.test\r\nBcc: x@y.test" },
      { ...MSG, subject: "" },
      { ...MSG, html: "" },
      { ...MSG, subject: "line\nbreak" },
    ]) {
      expect(await p.send(bad)).toEqual({ ok: false, reason: "rejected" });
    }
    expect(send).not.toHaveBeenCalled();
  });
});

describe("InMemoryEmailProvider", () => {
  it("records messages, fails on demand and numbers its ids", async () => {
    const p = new InMemoryEmailProvider();
    p.failNext("unavailable");
    expect(await p.send(MSG)).toEqual({ ok: false, reason: "unavailable" });
    expect(await p.send(MSG)).toEqual({ ok: true, messageId: "fake-email-1" });
    expect(p.sent).toHaveLength(1);
    p.reset();
    expect(p.sent).toHaveLength(0);
  });
});

describe("GatewaySmsProvider", () => {
  const make = (send: SmsTransport["send"], timeoutMs?: number) =>
    new GatewaySmsProvider({ transport: { send }, timeoutMs });

  it("passes a valid number and text to the transport and returns the id", async () => {
    const send = vi.fn().mockResolvedValue({ status: "accepted", messageId: "g-1" });
    expect(await make(send).send("+8801712345678", "hello")).toEqual({
      ok: true,
      messageId: "g-1",
    });
    expect(send).toHaveBeenCalledWith({ to: "+8801712345678", text: "hello" });
  });

  it("passes the caller's reference to the transport, and no reference field without one (WPU-Z3)", async () => {
    const send = vi.fn().mockResolvedValue({ status: "accepted", messageId: "g-1" });
    const p = make(send);
    await p.send("+8801712345678", "hello", "row-1");
    await p.send("+8801712345678", "hello");
    expect(send.mock.calls[0]?.[0]).toStrictEqual({
      to: "+8801712345678",
      text: "hello",
      reference: "row-1",
    });
    expect(send.mock.calls[1]?.[0]).toStrictEqual({ to: "+8801712345678", text: "hello" });
  });

  it("rejects a number that is not E.164 and a text that is empty or too long, without the transport", async () => {
    const send = vi.fn();
    const p = make(send);
    for (const [to, text] of [
      ["01712345678", "x"],
      ["+8801712345678", ""],
      ["+8801712345678", "x".repeat(161)],
    ] as const) {
      expect(await p.send(to, text)).toEqual({ ok: false, reason: "rejected" });
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("maps refused to rejected, failed and a throw to unavailable, and leaks nothing", async () => {
    const refused = make(vi.fn().mockResolvedValue({ status: "refused" }));
    expect(await refused.send("+8801712345678", "x")).toEqual({ ok: false, reason: "rejected" });
    const failed = make(vi.fn().mockResolvedValue({ status: "failed" }));
    expect(await failed.send("+8801712345678", "x")).toEqual({ ok: false, reason: "unavailable" });
    const thrown = make(vi.fn().mockRejectedValue(new Error("boom +8801712345678 secret text")));
    expect(await thrown.send("+8801712345678", "secret text")).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("answers unavailable when the gateway hangs", async () => {
    vi.useFakeTimers();
    const p = make(() => new Promise(() => {}), 50).send("+8801712345678", "x");
    await vi.advanceTimersByTimeAsync(60);
    await expect(p).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("passes the transport's reason word on as `detail`, and leaves out anything that is not one of the fixed words (WPU-Z17, R14)", async () => {
    const answer = (result: unknown) =>
      make(vi.fn().mockResolvedValue(result)).send("+8801712345678", "x");
    expect(await answer({ status: "refused", detail: "invalid_number" })).toStrictEqual({
      ok: false,
      reason: "rejected",
      detail: "invalid_number",
    });
    for (const detail of SMS_FAILURE_DETAILS) {
      expect(await answer({ status: "failed", detail }), detail).toStrictEqual({
        ok: false,
        reason: "unavailable",
        detail,
      });
    }
    // anything else may hold the number or the text: the field is left out
    for (const detail of [
      "+8801712345678",
      "Invalid MSISDN 8801712345678",
      "TOKEN",
      "",
      42,
      null,
    ]) {
      expect(await answer({ status: "failed", detail }), String(detail)).toStrictEqual({
        ok: false,
        reason: "unavailable",
      });
      expect(await answer({ status: "refused", detail }), String(detail)).toStrictEqual({
        ok: false,
        reason: "rejected",
      });
    }
  });
});

describe("the reason words of the SMS port (WPU-Z17)", () => {
  it("are exactly seven fixed words, and nothing else is one of them", () => {
    expect(SMS_FAILURE_DETAILS).toEqual([
      "token",
      "sender",
      "ip_not_whitelisted",
      "duplicate",
      "rate_limited",
      "invalid_number",
      "unknown",
    ]);
    for (const word of SMS_FAILURE_DETAILS) expect(isSmsFailureDetail(word), word).toBe(true);
    for (const value of [
      "",
      "TOKEN",
      "token ",
      "invalid number",
      "+8801712345678",
      "rejected",
      "unavailable",
      "toString",
      42,
      null,
      undefined,
      {},
      ["token"],
    ]) {
      expect(isSmsFailureDetail(value), JSON.stringify(value)).toBe(false);
    }
  });
});
