// The port to an email service, the SES adapter over an injected transport, and an in-memory fake.
//
// The adapter never imports the AWS SDK (R1: apps import this package, and no app may bundle an AWS
// client). The one SDK call (SESv2 `SendEmail`) is written in `functions/notifier`, which injects it
// as a SesTransport. VERIFY at that task: the SESv2 error names below, and that the function role
// has `ses:SendEmail` on the verified identity only.
//
// Contract, as for SmsProvider: `rejected` means the service refused the address or the message and
// nothing was sent (do not retry); `unavailable` is anything else (retry later). No answer and no
// error carries an address or a body (R14).

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  // A short label for the SES message tag, for example the template id. Never personal data.
  readonly tag?: string;
}

export type EmailSendResult =
  | { readonly ok: true; readonly messageId: string }
  | { readonly ok: false; readonly reason: "rejected" | "unavailable" };

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export interface SesRequest {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly charset: "UTF-8";
  readonly tag: string | undefined;
}
// Resolves with the message id, or throws an error whose `name` is the SES error name.
export interface SesTransport {
  send(request: SesRequest): Promise<{ readonly messageId: string }>;
}

export interface SesEmailOptions {
  readonly transport: SesTransport;
  // "PanelPay <no-reply@...>": the verified identity of the SES account.
  readonly from: string;
  readonly timeoutMs?: number | undefined;
}

// SESv2 SendEmail errors that mean "this message will never be accepted as it is".
const REJECTED = new Set(["MessageRejected", "BadRequestException"]);
const ADDRESS = /^[^\s@<>,;"\\]+@[^\s@<>,;"\\]+\.[^\s@<>,;"\\]+$/;
const DEFAULT_TIMEOUT_MS = 10_000;

export class SesEmailProvider implements EmailProvider {
  constructor(private readonly options: SesEmailOptions) {}

  async send(m: EmailMessage): Promise<EmailSendResult> {
    // The checks a service would make, so that a bad message is `rejected` and costs no call.
    // A line break in the address or the subject is header injection.
    if (
      !ADDRESS.test(m.to) ||
      m.subject.length === 0 ||
      /[\r\n]/.test(m.subject) ||
      m.html.length === 0 ||
      m.text.length === 0
    ) {
      return { ok: false, reason: "rejected" };
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(Object.assign(new Error("timeout"), { name: "Timeout" })),
        this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
    });
    try {
      const sent = await Promise.race([
        this.options.transport.send({
          from: this.options.from,
          to: m.to,
          subject: m.subject,
          html: m.html,
          text: m.text,
          charset: "UTF-8",
          tag: m.tag,
        }),
        timeout,
      ]);
      return { ok: true, messageId: sent.messageId };
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      return { ok: false, reason: REJECTED.has(name) ? "rejected" : "unavailable" };
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface SentEmail extends EmailMessage {
  readonly messageId: string;
}

// For tests and local runs only; it keeps every message in memory and sends nothing. Like
// InMemorySmsProvider it refuses to be built outside "test" and "development" (R16).
export class InMemoryEmailProvider implements EmailProvider {
  readonly sent: SentEmail[] = [];
  private failures: Array<"rejected" | "unavailable" | "throw"> = [];
  private counter = 0;

  constructor() {
    const env = process.env.NODE_ENV;
    if (env !== "test" && env !== "development") {
      throw new Error("InMemoryEmailProvider is for tests and local runs only");
    }
  }

  failNext(mode: "rejected" | "unavailable" | "throw", times = 1): void {
    for (let i = 0; i < times; i++) this.failures.push(mode);
  }

  reset(): void {
    this.sent.length = 0;
    this.failures = [];
    this.counter = 0;
  }

  send(m: EmailMessage): Promise<EmailSendResult> {
    const mode = this.failures.shift();
    if (mode === "rejected" || mode === "unavailable") {
      return Promise.resolve({ ok: false, reason: mode });
    }
    // Like a careless client, it echoes the address: the notifier must not pass it on.
    if (mode === "throw") return Promise.reject(new Error(`ses failed for ${m.to}`));
    this.counter += 1;
    const messageId = `fake-email-${this.counter}`;
    this.sent.push({ ...m, messageId });
    return Promise.resolve({ ok: true, messageId });
  }
}
