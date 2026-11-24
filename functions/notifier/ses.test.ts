import { describe, expect, it } from "vitest";
import {
  SES_SEND_ERROR,
  createSesTransport,
  parseSesIdentityArn,
  sesTransportFromEnv,
  type SesClientLike,
} from "./ses";

// WPU-D4: the SES transport (SESv2 SendEmail) against a fake client. No AWS call is made.

const ARN = "arn:aws:ses:ap-southeast-1:123456789012:identity/ticoncloud.test";
const REQUEST = {
  from: "PanelPay <no-reply@ticoncloud.test>",
  to: "rahim.uddin@example.test",
  subject: "স্বাগতম",
  html: "<p>Hello</p>",
  text: "Hello",
  charset: "UTF-8" as const,
  tag: "welcome",
};

function fake(result: unknown = { MessageId: "0100-abc" }) {
  const inputs: Record<string, unknown>[] = [];
  const client: SesClientLike = {
    send: async (command) => {
      inputs.push(command.input as unknown as Record<string, unknown>);
      if (result instanceof Error) throw result;
      return result as { MessageId?: string };
    },
  };
  return { client, inputs };
}

describe("createSesTransport", () => {
  it("sends one SESv2 SendEmail with text and html, the from address and the identity ARN", async () => {
    const { client, inputs } = fake();
    const out = await createSesTransport({ client, identityArn: ARN }).send(REQUEST);
    expect(out).toEqual({ messageId: "0100-abc" });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toEqual({
      FromEmailAddress: REQUEST.from,
      FromEmailAddressIdentityArn: ARN,
      Destination: { ToAddresses: [REQUEST.to] },
      Content: {
        Simple: {
          Subject: { Data: REQUEST.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: "Hello", Charset: "UTF-8" },
            Html: { Data: "<p>Hello</p>", Charset: "UTF-8" },
          },
        },
      },
      EmailTags: [{ Name: "template", Value: "welcome" }],
    });
  });

  it("adds the configuration set only when one is configured", async () => {
    const a = fake();
    await createSesTransport({
      client: a.client,
      identityArn: ARN,
      configurationSet: "tc-mail",
    }).send(REQUEST);
    expect(a.inputs[0]?.ConfigurationSetName).toBe("tc-mail");
    const b = fake();
    await createSesTransport({ client: b.client, identityArn: ARN }).send(REQUEST);
    expect("ConfigurationSetName" in (b.inputs[0] ?? {})).toBe(false);
  });

  it("drops a tag that SES would refuse instead of failing the message", async () => {
    const { client, inputs } = fake();
    const t = createSesTransport({ client, identityArn: ARN });
    await t.send({ ...REQUEST, tag: "a b" });
    await t.send({ ...REQUEST, tag: undefined });
    expect(inputs.map((i) => i.EmailTags)).toEqual([[], []]);
  });

  it("keeps the SES error name and nothing else: fixed text, no address, no body", async () => {
    const boom = Object.assign(new Error(`rejected ${REQUEST.to} ${REQUEST.text}`), {
      name: "MessageRejected",
    });
    const { client } = fake(boom);
    const error: unknown = await createSesTransport({ client, identityArn: ARN })
      .send(REQUEST)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("MessageRejected");
    expect((error as Error).message).toBe(SES_SEND_ERROR);
    expect(JSON.stringify(error)).not.toContain("example.test");
  });

  it("maps an unknown error name to a generic one (a retry later)", async () => {
    const { client } = fake(Object.assign(new Error("x"), { name: "SomethingNew" }));
    const error: unknown = await createSesTransport({ client, identityArn: ARN })
      .send(REQUEST)
      .catch((e: unknown) => e);
    expect((error as Error).name).toBe("SesError");
    expect((error as Error).message).toBe(SES_SEND_ERROR);
  });

  it("fails when SES answers without a message id", async () => {
    const { client } = fake({});
    await expect(
      createSesTransport({ client, identityArn: ARN }).send(REQUEST),
    ).rejects.toMatchObject({ name: "SesError", message: SES_SEND_ERROR });
  });
});

describe("parseSesIdentityArn", () => {
  it("accepts an SES identity ARN and returns its region", () => {
    expect(parseSesIdentityArn(ARN)).toEqual({ arn: ARN, region: "ap-southeast-1" });
  });
  it.each([
    undefined,
    "",
    "arn:aws:s3:::bucket",
    "arn:aws:ses:ap-southeast-1:123:identity/x",
    "arn:aws:ses:ap-southeast-1:123456789012:configuration-set/x",
    `${ARN}\n`,
  ])("refuses %j", (value) => {
    expect(parseSesIdentityArn(value)).toBeNull();
  });
});

describe("sesTransportFromEnv", () => {
  it("builds nothing (null, fail closed) without a valid identity ARN", () => {
    expect(sesTransportFromEnv({})).toBeNull();
    expect(sesTransportFromEnv({ SES_IDENTITY_ARN: "nope" })).toBeNull();
  });
  it("builds a transport from the identity ARN, with no network call at build time", () => {
    const t = sesTransportFromEnv({ SES_IDENTITY_ARN: ARN });
    expect(typeof t?.send).toBe("function");
  });
  it("refuses a configuration set name that is not plain", () => {
    expect(
      sesTransportFromEnv({ SES_IDENTITY_ARN: ARN, SES_CONFIGURATION_SET: "a b;" }),
    ).toBeNull();
  });
});
