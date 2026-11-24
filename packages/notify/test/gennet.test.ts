import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SmsTransportResult } from "../sms/gateway";
import { GENNET_SEND_URL, GennetSmsTransport, csmsIdFor } from "../sms/gennet";
import { SMS_FAILURE_DETAILS, type SmsFailureDetail } from "../sms/provider";

// WPU-Z3: the Gennet transport (ISMS API v3) over an injected fetch. No network call is made. The
// token and the sender id are obviously fake (R3); the answers follow the public ISMS Plus v3 format of
// SSL Wireless, which the Gennet API is believed to share (VERIFY, docs/runbooks/sms-gateway.md).
// WPU-Z17: the answer is read by its status code, and every failure carries a fixed reason word. The
// second answer shape (status_meaning, description) is the one of the test fixtures of a third-party
// Gennet SDK (docs/analysis/gennet-isms-api-2026-11-13.md).
const TOKEN = "fake-gennet-token-for-unit-tests";
const SENDER = "FAKESENDERID";
const TO = "+8801712345678";
const MSISDN = "8801712345678";
const CODE = "123456";
const TEXT = `PanelPay Your OTP is: ${CODE}. Please do not share your OTP with anyone.`;
const URL_OF_THE_API = "https://isms.gennet.com.bd/api/v3/send-sms";

interface Answer {
  readonly status?: number;
  // JSON-encoded as the body, unless `raw` is given
  readonly body?: unknown;
  readonly raw?: string;
}

function fakeFetch(answer: Answer | Error) {
  const calls: { url: string; init: RequestInit }[] = [];
  const mock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    if (answer instanceof Error) throw answer;
    const raw = answer.raw ?? JSON.stringify(answer.body ?? {});
    return new Response(raw, { status: answer.status ?? 200 });
  });
  return { fetch: mock as unknown as typeof fetch, mock, calls };
}

const make = (answer: Answer | Error) => {
  const fake = fakeFetch(answer);
  return {
    transport: new GennetSmsTransport({ apiToken: TOKEN, senderId: SENDER, fetch: fake.fetch }),
    ...fake,
  };
};

// One item of `smsinfo`, as the provider answers it (it echoes the number and the text).
const item = (over: Record<string, unknown> = {}) => ({
  sms_status: "SUCCESS",
  status_message: "Success",
  msisdn: MSISDN,
  sms_type: "EN",
  sms_body: TEXT,
  csms_id: "ECHOEDBACKBYPROVIDER",
  reference_id: "5ff2be7f64f61",
  ...over,
});
const success = (over: Record<string, unknown> = {}) => ({
  status: "SUCCESS",
  status_code: 200,
  error_message: "",
  smsinfo: [item(over)],
});
const failure = (code: number | string | null, message: string) => ({
  status: "FAILED",
  ...(code === null ? {} : { status_code: code }),
  error_message: message,
});
// The second answer shape: status_meaning and description instead of error_message, and no smsinfo.
const failureByMeaning = (code: number | string | null, meaning: string, description = "") => ({
  status: "FAILED",
  ...(code === null ? {} : { status_code: code }),
  status_meaning: meaning,
  description,
});
// A FAILED answer whose one smsinfo item has this sms_status.
const failureWithItem = (code: number | string | null, smsStatus: string, message = "") => ({
  status: "FAILED",
  ...(code === null ? {} : { status_code: code }),
  error_message: "",
  smsinfo: [item({ sms_status: smsStatus, status_message: message, sms_body: undefined })],
});

// The two outcomes of an answer that is not a success (WPU-Z17).
const failed = (detail: SmsFailureDetail) => ({ status: "failed", detail });
const REFUSED = { status: "refused", detail: "invalid_number" };

const sendWith = async (answer: Answer | Error, reference?: string) => {
  const { transport } = make(answer);
  return transport.send(
    reference === undefined ? { to: TO, text: TEXT } : { to: TO, text: TEXT, reference },
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GennetSmsTransport: the request", () => {
  it("posts JSON to the constant URL with the five fields of the API and the two JSON headers", async () => {
    const { transport, calls } = make({ body: success() });
    await transport.send({ to: TO, text: TEXT, reference: "ref-1" });
    expect(GENNET_SEND_URL).toBe(URL_OF_THE_API);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.url).toBe(URL_OF_THE_API);
    expect(call!.init.method).toBe("POST");
    // a redirect would carry the token to another address: it is an error, never followed
    expect(call!.init.redirect).toBe("error");
    const headers = new Headers(call!.init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("accept")).toBe("application/json");
    const body = JSON.parse(String(call!.init.body)) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["api_token", "sid", "msisdn", "sms", "csms_id"]);
    expect(body).toEqual({
      api_token: TOKEN,
      sid: SENDER,
      msisdn: MSISDN,
      sms: TEXT,
      csms_id: csmsIdFor("ref-1"),
    });
  });

  it.each(["3", "4", "5", "6", "7", "8", "9"])(
    "sends a mobile number of the operator digit %s as 8801... without the plus",
    async (digit) => {
      const { transport, calls } = make({ body: success() });
      await transport.send({ to: `+8801${digit}12345678`, text: TEXT });
      const body = JSON.parse(String(calls[0]!.init.body)) as { msisdn: string };
      expect(body.msisdn).toBe(`8801${digit}12345678`);
    },
  );

  it("refuses any other number, and an empty text, without a network call", async () => {
    const { transport, mock } = make({ body: success() });
    for (const to of [
      "+447911123456",
      "01712345678",
      MSISDN,
      "+8801212345678",
      "+8801012345678",
      "+880171234567",
      "+88017123456789",
      " +8801712345678",
      "+8801712345678\n",
      "+88 01712345678",
      "+8801712 345678",
      "",
    ]) {
      expect(await transport.send({ to, text: TEXT }), JSON.stringify(to)).toEqual(REFUSED);
    }
    // an empty text has no reason word (GatewaySmsProvider refuses it before the transport)
    expect(await transport.send({ to: TO, text: "" })).toStrictEqual({ status: "refused" });
    expect(mock).not.toHaveBeenCalled();
  });

  it("uses globalThis.fetch when no fetch is injected, looked up at the time of the send", async () => {
    const fake = fakeFetch({ body: success() });
    const transport = new GennetSmsTransport({ apiToken: TOKEN, senderId: SENDER });
    vi.stubGlobal("fetch", fake.fetch);
    expect(await transport.send({ to: TO, text: TEXT })).toMatchObject({ status: "accepted" });
    expect(fake.calls.map((c) => c.url)).toEqual([URL_OF_THE_API]);
  });
});

describe("csms_id: our id of each message", () => {
  it("is 20 characters of A-Z and 0-9, the same for the same reference and different for different ones", () => {
    const id = "0193f7c2-5b8a-7c3e-9a1b-1234567890ab";
    const a = csmsIdFor(id);
    expect(a).toMatch(/^[A-Z0-9]{20}$/);
    expect(csmsIdFor(id)).toBe(a);
    expect(csmsIdFor("0193f7c2-5b8a-7c3e-9a1b-1234567890ac")).not.toBe(a);
    const many = Array.from({ length: 1000 }, (_, i) => csmsIdFor(`row-${i}`));
    for (const value of many) expect(value).toMatch(/^[A-Z0-9]{20}$/);
    expect(new Set(many).size).toBe(1000);
  });

  it("is random when no reference, or an empty one, is given", () => {
    const many = Array.from({ length: 200 }, () => csmsIdFor());
    for (const value of many) expect(value).toMatch(/^[A-Z0-9]{20}$/);
    expect(new Set(many).size).toBe(200);
    expect(csmsIdFor("")).toMatch(/^[A-Z0-9]{20}$/);
    expect(csmsIdFor("")).not.toBe(csmsIdFor(""));
  });

  it("a repeat of the same message carries the same csms_id; a message without a reference a fresh one", async () => {
    const { transport, calls } = make({ body: success() });
    await transport.send({ to: TO, text: TEXT, reference: "row-7" });
    await transport.send({ to: TO, text: TEXT, reference: "row-7" });
    await transport.send({ to: TO, text: TEXT });
    const ids = calls.map((c) => (JSON.parse(String(c.init.body)) as { csms_id: string }).csms_id);
    expect(ids[0]).toBe(csmsIdFor("row-7"));
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).toMatch(/^[A-Z0-9]{20}$/);
    expect(ids[2]).not.toBe(ids[0]);
  });
});

describe("GennetSmsTransport: the answer, fail closed", () => {
  it("accepted: status SUCCESS and an smsinfo item of SUCCESS; the message id is the provider's reference_id", async () => {
    expect(await sendWith({ body: success() }, "ref-2")).toEqual({
      status: "accepted",
      messageId: "5ff2be7f64f61",
    });
  });

  it("accepted: the status is read without regard to case, and without smsinfo the message id is our csms_id", async () => {
    expect(await sendWith({ body: { status: "success", status_code: 200 } }, "ref-3")).toEqual({
      status: "accepted",
      messageId: csmsIdFor("ref-3"),
    });
    expect(
      await sendWith({ status: 201, body: success({ sms_status: "Success" }) }, "ref-3"),
    ).toEqual({ status: "accepted", messageId: "5ff2be7f64f61" });
  });

  it("a reference_id that is empty, not a string, not a plain id, or that holds the number, the token or the sender id gives our csms_id", async () => {
    for (const reference_id of [
      "",
      42,
      null,
      "has space",
      "x".repeat(65),
      MSISDN + "\n",
      MSISDN,
      `ref-${MSISDN.slice(-10)}`,
      TOKEN,
      SENDER,
      `id-${SENDER.toLowerCase()}`,
    ]) {
      expect(
        await sendWith({ body: success({ reference_id }) }, "ref-4"),
        String(reference_id),
      ).toEqual({ status: "accepted", messageId: csmsIdFor("ref-4") });
    }
  });

  it("refused also when the smsinfo item is INVALID, with no status code", async () => {
    const body = {
      status: "FAILED",
      error_message: "",
      smsinfo: [
        item({ sms_status: "INVALID", status_message: "Invalid MSISDN", sms_body: undefined }),
      ],
    };
    expect(await sendWith({ body })).toEqual(REFUSED);
  });

  it("with status SUCCESS the smsinfo item decides: INVALID and BLOCKED are refused, DUPLICATE and anything else failed", async () => {
    expect(
      await sendWith({
        body: success({ sms_status: "INVALID", status_message: "Invalid MSISDN" }),
      }),
    ).toEqual(REFUSED);
    expect(
      await sendWith({
        body: success({ sms_status: "DUPLICATE", status_message: "Duplicated CSMS ID" }),
      }),
    ).toEqual(failed("duplicate"));
    // WPU-Z17: BLOCKED is refused (it was failed in WPU-Z3)
    expect(
      await sendWith({
        body: success({ sms_status: "BLOCKED", status_message: "Blocked MSISDN" }),
      }),
    ).toEqual(REFUSED);
    expect(await sendWith({ body: success({ sms_status: "QUEUED", status_message: "" }) })).toEqual(
      failed("unknown"),
    );
    expect(await sendWith({ body: success({ sms_status: undefined }) })).toEqual(failed("unknown"));
  });

  it("status SUCCESS with an empty, malformed or non-array smsinfo is failed", async () => {
    for (const smsinfo of [[], [null], ["SUCCESS"], { sms_status: "SUCCESS" }, "SUCCESS"]) {
      expect(
        await sendWith({ body: { status: "SUCCESS", smsinfo } }),
        JSON.stringify(smsinfo),
      ).toEqual(failed("unknown"));
    }
    expect(await sendWith({ body: { status_code: 200, smsinfo: [item()] } })).toEqual(
      failed("unknown"),
    );
  });

  it("HTTP 5xx and 3xx are failed whatever the body says", async () => {
    for (const status of [500, 502, 503, 504, 300]) {
      expect(await sendWith({ status, body: success() }), String(status)).toEqual(
        failed("unknown"),
      );
      expect(
        await sendWith({ status, body: failure(4025, "Invalid MSISDN") }),
        String(status),
      ).toEqual(failed("unknown"));
    }
  });

  it("HTTP 401, 402, 403, 404, 408, 409 and 429 are failed whatever the body says (auth, payment, limits)", async () => {
    for (const status of [401, 402, 403, 404, 408, 409, 429]) {
      expect(
        await sendWith({ status, body: failure(4025, "Invalid MSISDN") }),
        String(status),
      ).toEqual(failed("unknown"));
    }
  });

  it("HTTP 400, 413 and 422 are read like HTTP 200: refused only by the status code or the item (WPU-Z17)", async () => {
    for (const status of [400, 413, 422]) {
      // WPU-Z17: the HTTP status alone no longer refuses (these three were refused in WPU-Z3)
      expect(
        await sendWith({ status, body: failure(null, "Bad request") }),
        String(status),
      ).toEqual(failed("unknown"));
      expect(await sendWith({ status, body: {} }), String(status)).toEqual(failed("unknown"));
      // a 4xx with an answer of success is not a success
      expect(await sendWith({ status, body: success() }), String(status)).toEqual(
        failed("unknown"),
      );
      expect(
        await sendWith({ status, body: failure(4001, "Unauthorized") }),
        String(status),
      ).toEqual(failed("token"));
      expect(
        await sendWith({ status, body: failure(null, "Invalid api_token") }),
        String(status),
      ).toEqual(failed("token"));
      expect(
        await sendWith({ status, body: failure(4025, "Invalid MSISDN") }),
        String(status),
      ).toEqual(REFUSED);
    }
  });

  it("a body that is not JSON, or JSON that is not an object, is failed, also with HTTP 400", async () => {
    for (const raw of ["<html>Bad Gateway</html>", "", "null", "[]", '"SUCCESS"', "{", "42"]) {
      expect(await sendWith({ raw }), JSON.stringify(raw)).toEqual(failed("unknown"));
      expect(await sendWith({ status: 400, raw }), JSON.stringify(raw)).toEqual(failed("unknown"));
    }
  });

  it("a network error is failed, and nothing is thrown", async () => {
    const result = await sendWith(
      new TypeError(`fetch failed for ${TOKEN} ${SENDER} ${TO} ${TEXT}`),
    );
    expect(result).toEqual(failed("unknown"));
  });

  it("a body that cannot be read is failed", async () => {
    const broken = {
      status: 200,
      ok: true,
      text: () => Promise.reject(new Error(`stream broke ${TEXT}`)),
      json: () => Promise.reject(new Error(`stream broke ${TEXT}`)),
    } as unknown as Response;
    const transport = new GennetSmsTransport({
      apiToken: TOKEN,
      senderId: SENDER,
      fetch: (() => Promise.resolve(broken)) as unknown as typeof fetch,
    });
    expect(await transport.send({ to: TO, text: TEXT })).toEqual(failed("unknown"));
  });
});

describe("GennetSmsTransport: the answer is read by its status code (WPU-Z17)", () => {
  // Every status code of the ISMS v3 table, with its outcome and reason word. The rows of WPU-Z3 are all
  // here; 4028 is now refused, and 4027 and 4032 failed.
  it.each([
    [4001, "Unauthorized", failed("token")],
    [4002, "SID Not Permitted", failed("sender")],
    [4003, "IP Blacklisted", failed("ip_not_whitelisted")],
    [4004, "Invalid Request Format", failed("unknown")],
    [4005, "End Point Not Found", failed("unknown")],
    [4020, "Invalid CSMS ID", failed("unknown")],
    [4022, "Required Parameter Missing", failed("unknown")],
    [4023, "Duplicate CMS ID", failed("duplicate")],
    [4024, "Duplicate MSISDN", failed("unknown")],
    [4025, "Invalid MSISDN", REFUSED],
    [4026, "Blocked MSISDN", failed("unknown")],
    [4027, "Message Length Exceeded", failed("unknown")],
    [4028, "Invalid Message Data", REFUSED],
    [4029, "Too Many Requests", failed("rate_limited")],
    [4030, "Limit Exceed", failed("unknown")],
    [4031, "TPS Exceeded", failed("rate_limited")],
    [4032, "Invalid SMS", failed("unknown")],
    [4033, "Too Many OTP Requests", failed("rate_limited")],
    [4034, "Unable to Decrypt SMS", failed("unknown")],
    [4035, "Client Signature Mismatch", failed("unknown")],
    [5000, "Internal Error", failed("unknown")],
    ["4001", "Unauthorized", failed("token")],
    ["4025", "Invalid MSISDN", REFUSED],
  ] as const)("status_code %j %j gives %j, in both answer shapes", async (code, name, expected) => {
    expect(await sendWith({ body: failure(code, name) })).toEqual(expected);
    expect(await sendWith({ body: failureByMeaning(code, name, `${name}.`) })).toEqual(expected);
  });

  it.each([
    ["Unauthorized", "token"],
    ["Authentication failed", "token"],
    ["Authorization failed", "token"],
    ["Invalid API token", "token"],
    ["Invalid api_token", "token"],
    ["SID Not Permitted", "sender"],
    ["Invalid sender ID", "sender"],
    ["Stakeholder not permitted to send SMS", "sender"],
    ["IP Blacklisted", "ip_not_whitelisted"],
    ["Your IP is not whitelisted", "ip_not_whitelisted"],
    ["Duplicated CSMS ID for this message", "duplicate"],
    ["Too many requests", "rate_limited"],
    ["TPS Exceeded", "rate_limited"],
    // words never refuse: these were refused in WPU-Z3
    ["Invalid MSISDN", "unknown"],
    ["Invalid mobile number", "unknown"],
    ["The phone number is not a valid one", "unknown"],
    ["Wrong number", "unknown"],
    ["Message length exceeded", "unknown"],
    ["SMS text too long", "unknown"],
    ["Insufficient balance", "unknown"],
    ["SMS limit exceeded", "unknown"],
    ["Invalid SMS signature", "unknown"],
    ["Something new happened", "unknown"],
    ["", "unknown"],
  ] as const)(
    "with no status code or one outside the table, %j gives failed %s, in each of the four fields",
    async (message, detail) => {
      for (const code of [null, 4999]) {
        const where = `code ${String(code)}`;
        // error_message, the status_message of the item, status_meaning, description
        expect(await sendWith({ body: failure(code, message) }), where).toEqual(failed(detail));
        expect(await sendWith({ body: failureWithItem(code, "FAILED", message) }), where).toEqual(
          failed(detail),
        );
        expect(await sendWith({ body: failureByMeaning(code, message) }), where).toEqual(
          failed(detail),
        );
        expect(await sendWith({ body: failureByMeaning(code, "", message) }), where).toEqual(
          failed(detail),
        );
      }
    },
  );

  it("a status code of the table decides, whatever the words of the answer say", async () => {
    // 4028 also covers an invalid sender id in the ISMS table: refused by its code all the same (VERIFY)
    expect(await sendWith({ body: failure(4028, "Invalid SID") })).toEqual(REFUSED);
    expect(await sendWith({ body: failureByMeaning(4025, "Unauthorized") })).toEqual(REFUSED);
    expect(await sendWith({ body: failure(4001, "Invalid MSISDN") })).toEqual(failed("token"));
    expect(await sendWith({ body: failure(5000, "Invalid API token") })).toEqual(failed("unknown"));
    expect(await sendWith({ body: failureByMeaning(4024, "Duplicate MSISDN") })).toEqual(
      failed("unknown"),
    );
  });

  it("the item: DUPLICATE is duplicate whatever the code; INVALID and BLOCKED are refused unless the code names a fault of ours or the provider's", async () => {
    for (const code of [null, 4025, 4028, 4026, 5000, 4999]) {
      expect(await sendWith({ body: failureWithItem(code, "DUPLICATE") }), String(code)).toEqual(
        failed("duplicate"),
      );
    }
    for (const status of ["INVALID", "BLOCKED", "invalid", "Blocked"]) {
      for (const code of [null, 4025, 4026, 4027, 4028, 5000, 4999]) {
        expect(
          await sendWith({ body: failureWithItem(code, status) }),
          `${status} ${String(code)}`,
        ).toEqual(REFUSED);
      }
      for (const [code, detail] of [
        [4001, "token"],
        [4002, "sender"],
        [4003, "ip_not_whitelisted"],
        [4023, "duplicate"],
        [4029, "rate_limited"],
        [4031, "rate_limited"],
        [4033, "rate_limited"],
      ] as const) {
        expect(
          await sendWith({ body: failureWithItem(code, status) }),
          `${status} ${code}`,
        ).toEqual(failed(detail));
      }
    }
  });

  it("the failure examples of the ISMS v3 documentation and of the Gennet SDK fixtures, as published", async () => {
    // single: 4025 with an item INVALID
    expect(
      await sendWith({
        body: {
          status: "FAILED",
          status_code: 4025,
          error_message: "Invalid MSISDN",
          smsinfo: [
            item({ sms_status: "INVALID", status_message: "Invalid MSISDN", sms_body: undefined }),
          ],
        },
      }),
    ).toEqual(REFUSED);
    // bulk or dynamic: 4028 with an item DUPLICATE is a repeated csms_id, never a refusal
    expect(
      await sendWith({
        body: {
          status: "FAILED",
          status_code: 4028,
          error_message: "Invalid message data",
          smsinfo: [
            item({
              sms_status: "DUPLICATE",
              status_message: "Duplicated CSMS ID",
              sms_body: undefined,
            }),
          ],
        },
      }),
    ).toEqual(failed("duplicate"));
    // the OTP endpoint's signature failure
    expect(
      await sendWith({
        body: {
          status: "FAILED",
          error_message: "Client signature mismatch",
          status_code: 4035,
          smsinfo: [],
        },
      }),
    ).toEqual(failed("unknown"));
    // the second shape, from the Gennet SDK fixtures
    expect(
      await sendWith({
        body: {
          status: "FAILED",
          status_code: 4029,
          status_meaning: "Too many requests",
          description: "Same recipient already accepted within 1000 milliseconds.",
        },
      }),
    ).toEqual(failed("rate_limited"));
  });

  it("the reason is read whatever the HTTP status; a refusal counts only with HTTP 2xx, 400, 413 or 422", async () => {
    for (const status of [200, 201, 400, 413, 422, 300, 401, 403, 429, 500, 503]) {
      const at = String(status);
      expect(await sendWith({ status, body: failure(4001, "Unauthorized") }), at).toEqual(
        failed("token"),
      );
      expect(await sendWith({ status, body: failure(4002, "SID Not Permitted") }), at).toEqual(
        failed("sender"),
      );
      expect(await sendWith({ status, body: failure(4003, "IP Blacklisted") }), at).toEqual(
        failed("ip_not_whitelisted"),
      );
      expect(await sendWith({ status, body: failureWithItem(null, "DUPLICATE") }), at).toEqual(
        failed("duplicate"),
      );
      expect(
        await sendWith({ status, body: failureByMeaning(4029, "Too many requests") }),
        at,
      ).toEqual(failed("rate_limited"));
    }
    for (const status of [200, 201, 400, 413, 422]) {
      const at = String(status);
      expect(await sendWith({ status, body: failure(4028, "Invalid Message Data") }), at).toEqual(
        REFUSED,
      );
      expect(await sendWith({ status, body: failureWithItem(null, "BLOCKED") }), at).toEqual(
        REFUSED,
      );
    }
    for (const status of [300, 401, 402, 403, 404, 408, 409, 429, 500, 502, 503, 504]) {
      const at = String(status);
      expect(await sendWith({ status, body: failure(4028, "Invalid Message Data") }), at).toEqual(
        failed("unknown"),
      );
      expect(await sendWith({ status, body: failureWithItem(null, "INVALID") }), at).toEqual(
        failed("unknown"),
      );
    }
  });
});

describe("GennetSmsTransport: secrets and personal data (R3, R14)", () => {
  it("no result carries the token, the sender id, the number or the text, and send never throws", async () => {
    const leaky = `${TOKEN} ${SENDER} ${MSISDN} ${TO} ${TEXT}`;
    const answers: (Answer | Error)[] = [
      { body: success() },
      { body: success({ reference_id: TOKEN }) },
      { body: success({ reference_id: MSISDN }) },
      { body: failure(4025, `Invalid MSISDN ${MSISDN}`) },
      { body: failure(4001, `Unauthorized ${TOKEN}`) },
      { body: failure(null, leaky) },
      // WPU-Z17: the second answer shape and the item's message are read, never passed on
      { body: failureByMeaning(null, leaky, leaky) },
      { body: failureByMeaning(4003, `IP Blacklisted ${leaky}`, leaky) },
      { body: failureWithItem(4999, "FAILED", leaky) },
      { status: 500, raw: leaky },
      { status: 400, raw: leaky },
      { raw: leaky },
      new Error(leaky),
    ];
    const results: SmsTransportResult[] = [];
    for (const answer of answers) results.push(await sendWith(answer, "ref-5"));
    const shown = JSON.stringify(results);
    for (const value of [TOKEN, SENDER, MSISDN, CODE, "PanelPay"]) {
      expect(shown).not.toContain(value);
    }
    // a failure carries one of the fixed reason words of the port and nothing else
    for (const result of results) {
      if (result.status === "accepted") continue;
      expect(Object.keys(result).sort(), JSON.stringify(result)).toEqual(["detail", "status"]);
      expect(SMS_FAILURE_DETAILS, JSON.stringify(result)).toContain(result.detail);
    }
  });

  it("the transport shows neither the token nor the sender id in JSON or in inspect", () => {
    const transport = new GennetSmsTransport({ apiToken: TOKEN, senderId: SENDER });
    const shown = [
      JSON.stringify(transport),
      JSON.stringify({ transport }),
      inspect(transport, { depth: 10, showHidden: true }),
      String(transport),
      Object.keys(transport).join(","),
    ].join("\n");
    expect(shown).not.toContain(TOKEN);
    expect(shown).not.toContain(SENDER);
  });

  it("refuses to be built without a token or a sender id, with a fixed message that holds no value", () => {
    for (const options of [
      { apiToken: "", senderId: SENDER },
      { apiToken: TOKEN, senderId: "" },
      { apiToken: undefined, senderId: SENDER },
      { apiToken: TOKEN, senderId: undefined },
      { apiToken: 42, senderId: SENDER },
    ]) {
      let message = "";
      try {
        new GennetSmsTransport(options as never);
      } catch (error) {
        message = error instanceof Error ? error.message : "";
      }
      expect(message, JSON.stringify(options)).toBe(
        "gennet: the api token and the sender id are required",
      );
    }
  });
});
