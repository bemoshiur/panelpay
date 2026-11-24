import type { LogEvent } from "@tc/core";
import {
  GatewaySmsProvider,
  GennetSmsTransport,
  InMemoryNotifierStore,
  planRows,
  type SesRequest,
  type SesTransport,
  type SmsProvider,
} from "@tc/notify";
import { expect, it } from "vitest";
import { buildNotifierHandler } from "./build";

const CUSTOMER = "0193f7c2-5b8a-7c3e-9a1b-1234567890ab";
const ADDRESS = "rahim.uddin@example.test";
const config = {
  panelOrigin: "https://my.ticoncloud.test",
  sesFrom: "PanelPay <no-reply@ticoncloud.test>",
};

const DATA: Record<string, Record<string, string>> = {
  welcome: {},
  kyc_approved: { submissionId: "0193f7c2-5b8a-7c3e-9a1b-1234567890cd" },
};

function seeded(templates: string[] = ["welcome"]) {
  const store = new InMemoryNotifierStore();
  store.setRecipient(CUSTOMER, {
    email: ADDRESS,
    phone: "+8801712345678",
    phoneVerified: true,
    locale: "bn",
    numerals: "beng",
  });
  for (const template of templates) {
    for (const r of planRows({
      customerId: CUSTOMER,
      template: template as "welcome",
      data: DATA[template] ?? {},
      dedupeKey: template,
    })) {
      store.add(r, new Date("2026-11-11T09:00:00.000Z"));
    }
  }
  return store;
}

const fakeTransport = () => {
  const requests: SesRequest[] = [];
  const transport: SesTransport = {
    send: (request) => {
      requests.push(request);
      return Promise.resolve({ messageId: `ses-${requests.length}` });
    },
  };
  return { transport, requests };
};

const build = (
  store: InMemoryNotifierStore,
  transport: SesTransport | null,
  sms: SmsProvider | null = null,
) => {
  const logs: LogEvent[] = [];
  const handler = buildNotifierHandler({
    config,
    store,
    sesTransport: transport,
    sms,
    clock: { now: () => new Date("2026-11-11T10:00:00.000Z") },
    log: (e) => logs.push(e),
  });
  return { handler, logs };
};

// A gateway that records what it is given and accepts everything.
const recordingSms = () => {
  const sent: { to: string; text: string; reference: string | undefined }[] = [];
  const sms: SmsProvider = {
    send: (to, text, reference) => {
      sent.push({ to, text, reference });
      return Promise.resolve({ ok: true, messageId: `sms-${sent.length}` });
    },
  };
  return { sms, sent };
};

it("sends the pending e-mail through the SES transport port with the configured sender", async () => {
  const { transport, requests } = fakeTransport();
  const store = seeded();
  const { handler } = build(store, transport);
  const report = await handler({});
  expect(report.sent).toBeGreaterThanOrEqual(1);
  expect(requests).toHaveLength(1);
  expect(requests[0]!.from).toBe(config.sesFrom);
  expect(requests[0]!.to).toBe(ADDRESS);
  expect(requests[0]!.charset).toBe("UTF-8");
  expect(store.rows().find((r) => r.channel === "email")!.status).toBe("sent");
});

it("a second run sends nothing again", async () => {
  const { transport, requests } = fakeTransport();
  const store = seeded();
  const { handler } = build(store, transport);
  await handler({});
  await handler({});
  expect(requests).toHaveLength(1);
});

it("fails closed without an SES transport: the run throws and no row is touched", async () => {
  const store = seeded();
  const before = JSON.stringify(store.rows());
  const { handler, logs } = build(store, null);
  await expect(handler({})).rejects.toThrow("notifier: email is not configured");
  expect(JSON.stringify(store.rows())).toBe(before);
  expect(logs).toContainEqual({ event: "notifier_not_configured", channel: "email" });
});

it("leaves SMS rows pending while no gateway is configured, and still sends the e-mail", async () => {
  // kyc_approved is queued for e-mail, SMS and the bell
  const { transport, requests } = fakeTransport();
  const store = seeded(["kyc_approved"]);
  expect(store.rows().filter((r) => r.channel === "sms").length).toBeGreaterThan(0);
  const { handler } = build(store, transport);
  await handler({});
  for (const row of store.rows().filter((r) => r.channel === "sms")) {
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(0);
  }
  expect(requests).toHaveLength(1);
});

it("logs no address and no text", async () => {
  const { transport } = fakeTransport();
  const { handler, logs } = build(seeded(), transport);
  await handler({});
  const text = JSON.stringify(logs);
  expect(text).not.toContain(ADDRESS);
  expect(text).not.toContain("example.test");
});

it("a transport that throws is retried later and its error text is dropped", async () => {
  const store = seeded();
  const transport: SesTransport = {
    send: () => Promise.reject(Object.assign(new Error(`failed for ${ADDRESS}`), { name: "X" })),
  };
  const { handler, logs } = build(store, transport);
  const report = await handler({});
  // the bell item needs no provider; the e-mail is retried later
  expect(report.retry).toBe(1);
  expect(store.rows().find((r) => r.channel === "email")!.status).toBe("pending");
  expect(JSON.stringify(logs)).not.toContain(ADDRESS);
});

it("with an SMS gateway the SMS rows are no longer hidden: they are sent with the row id as the reference (WPU-Z3)", async () => {
  const { transport } = fakeTransport();
  const store = seeded(["kyc_approved"]);
  const { sms, sent } = recordingSms();
  const { handler, logs } = build(store, transport, sms);
  await handler({});
  const row = store.rows().find((r) => r.channel === "sms");
  expect(row?.status).toBe("sent");
  expect(sent).toEqual([{ to: "+8801712345678", text: expect.any(String), reference: row?.id }]);
  expect(JSON.stringify(logs)).not.toContain("+8801712345678");
});

it("without an SMS gateway nothing reaches an SMS provider and the rows keep their attempts", async () => {
  const { transport } = fakeTransport();
  const store = seeded(["kyc_approved"]);
  const { handler } = build(store, transport, null);
  const report = await handler({});
  expect(report.failed).toBe(0);
  expect(store.rows().find((r) => r.channel === "sms")).toMatchObject({
    status: "pending",
    attempts: 0,
  });
});

it("end to end over the Gennet transport (fake fetch): a failed send is retried with the same csms_id, and nothing secret is logged", async () => {
  const TOKEN = "fake-token-for-the-notifier-test";
  const SENDER = "FAKESENDERID";
  const bodies: Record<string, unknown>[] = [];
  const answers = [
    { status: "FAILED", status_code: 5000, error_message: "Internal Error" },
    {
      status: "SUCCESS",
      status_code: 200,
      error_message: "",
      smsinfo: [{ sms_status: "SUCCESS", status_message: "Success", reference_id: "gw-1" }],
    },
  ];
  const fetch = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify(answers[bodies.length - 1]), { status: 200 });
  }) as unknown as typeof globalThis.fetch;
  const sms = new GatewaySmsProvider({
    transport: new GennetSmsTransport({ apiToken: TOKEN, senderId: SENDER, fetch }),
  });
  const store = seeded(["kyc_approved"]);
  const logs: LogEvent[] = [];
  let now = new Date("2026-11-11T10:00:00.000Z");
  const handler = buildNotifierHandler({
    config,
    store,
    sesTransport: fakeTransport().transport,
    sms,
    clock: { now: () => now },
    log: (e) => logs.push(e),
  });
  await handler({});
  expect(store.rows().find((r) => r.channel === "sms")).toMatchObject({
    status: "pending",
    attempts: 1,
  });
  now = new Date("2026-11-11T11:00:00.000Z");
  await handler({});
  expect(store.rows().find((r) => r.channel === "sms")?.status).toBe("sent");
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toMatchObject({ api_token: TOKEN, sid: SENDER, msisdn: "8801712345678" });
  expect(bodies[0]?.csms_id).toMatch(/^[A-Z0-9]{20}$/);
  expect(bodies[1]?.csms_id).toBe(bodies[0]?.csms_id);
  const logged = JSON.stringify(logs);
  for (const value of [TOKEN, SENDER, "8801712345678", String(bodies[0]?.sms)]) {
    expect(logged).not.toContain(value);
  }
});

// WPU-Y5 (a): production must not run with SMS off unnoticed. A run without the SMS gateway starts with one
// structured line (the alarm of infra/stacks/alarms.ts counts it); a run with the gateway does not.
it("logs notifier_sms_off once at the start of a run without the SMS gateway, never with it", async () => {
  const { transport } = fakeTransport();
  const off = build(seeded(), transport);
  await off.handler({});
  expect(off.logs[0]).toEqual({ event: "notifier_sms_off", channel: "sms", severity: "alert" });
  expect(off.logs.filter((e) => e.event === "notifier_sms_off")).toHaveLength(1);
  const on = build(seeded(), fakeTransport().transport, recordingSms().sms);
  await on.handler({});
  expect(on.logs.some((e) => e.event === "notifier_sms_off")).toBe(false);
});
