import type { Locale } from "@tc/core";
import { layoutEmail } from "./layout";
import { notifyLocale } from "./locale";

// The three emails that Cognito sends through the `cognito-messages` trigger (16.14): the email
// verification code, the password reset code and an admin's one-time temporary password. They are
// never queued (DIRECT_ONLY_IDS): a code in `notifications.payload` would be readable by web_rw and
// worker_rw (R14). The text is fixed here; the only variable parts are Cognito's own placeholders,
// which Cognito replaces itself after our function has answered. Nothing from a request reaches the
// HTML, and no link is added (the code is typed in the panel).

export const COGNITO_MESSAGE_KINDS = ["verify_code", "reset_code", "admin_temp_password"] as const;
export type CognitoMessageKind = (typeof COGNITO_MESSAGE_KINDS)[number];

export interface CognitoPlaceholders {
  // event.request.codeParameter, always "{####}".
  readonly code: string;
  // event.request.usernameParameter, always "{username}"; needed by the admin message only.
  readonly username?: string;
}

export interface RenderedCognitoMessage {
  readonly subject: string;
  readonly html: string;
}

interface Text {
  readonly subject: string;
  readonly headline: string;
  // "{code}" and "{username}" are replaced by Cognito's placeholders.
  readonly body: readonly string[];
}

// Exported for the wording test only (it is not part of the package entry).
export const COGNITO_TEXTS: Readonly<Record<CognitoMessageKind, Readonly<Record<Locale, Text>>>> = {
  verify_code: {
    bn: {
      subject: "PanelPay: আপনার ইমেইল যাচাইয়ের কোড",
      headline: "ইমেইল যাচাই করুন",
      body: [
        "আপনার ইমেইল যাচাই করতে নিচের কোডটি প্যানেলে লিখুন।",
        "{code}",
        "কোডটি অল্প সময় কার্যকর থাকে। কোডটি কাউকে দেবেন না। আপনি অনুরোধ না করে থাকলে এই ইমেইল উপেক্ষা করুন।",
      ],
    },
    en: {
      subject: "PanelPay: your email verification code",
      headline: "Verify your email",
      body: [
        "Enter this code in the panel to verify your email.",
        "{code}",
        "The code works for a short time only. Do not share it with anyone. If you did not ask for it, ignore this email.",
      ],
    },
  },
  reset_code: {
    bn: {
      subject: "PanelPay: পাসওয়ার্ড রিসেটের কোড",
      headline: "পাসওয়ার্ড রিসেট",
      body: [
        "পাসওয়ার্ড রিসেট করতে নিচের কোডটি প্যানেলে লিখুন।",
        "{code}",
        "কোডটি অল্প সময় কার্যকর থাকে। কোডটি কাউকে দেবেন না। আপনি অনুরোধ না করে থাকলে এই ইমেইল উপেক্ষা করুন, আপনার পাসওয়ার্ড বদলাবে না।",
      ],
    },
    en: {
      subject: "PanelPay: your password reset code",
      headline: "Reset your password",
      body: [
        "Enter this code in the panel to reset your password.",
        "{code}",
        "The code works for a short time only. Do not share it with anyone. If you did not ask for it, ignore this email and your password stays the same.",
      ],
    },
  },
  admin_temp_password: {
    bn: {
      subject: "PanelPay অ্যাডমিন: আপনার সাময়িক পাসওয়ার্ড",
      headline: "অ্যাডমিন অ্যাকাউন্ট তৈরি হয়েছে",
      body: [
        "আপনার অ্যাডমিন অ্যাকাউন্ট তৈরি হয়েছে।",
        "ব্যবহারকারীর নাম: {username}",
        "সাময়িক পাসওয়ার্ড: {code}",
        "প্রথম সাইন-ইনে নতুন পাসওয়ার্ড দিতে হবে। এই পাসওয়ার্ড কাউকে দেবেন না।",
      ],
    },
    en: {
      subject: "PanelPay admin: your temporary password",
      headline: "Your admin account is ready",
      body: [
        "Your admin account has been created.",
        "Username: {username}",
        "Temporary password: {code}",
        "You must set a new password at your first sign-in. Do not share this password with anyone.",
      ],
    },
  },
};

const isKind = (v: unknown): v is CognitoMessageKind =>
  typeof v === "string" && (COGNITO_MESSAGE_KINDS as readonly string[]).includes(v);

export function renderCognitoMessage(
  kind: CognitoMessageKind,
  locale: Locale,
  placeholders: CognitoPlaceholders,
): RenderedCognitoMessage {
  if (!isKind(kind) || (locale !== "bn" && locale !== "en")) {
    throw new TypeError("cognito message: unknown message");
  }
  // Only Cognito's literal placeholders: anything else could be input.
  if (placeholders.code !== "{####}") throw new TypeError("cognito message: bad placeholder");
  const { username } = placeholders;
  if (username !== undefined && username !== "{username}") {
    throw new TypeError("cognito message: bad placeholder");
  }
  if (kind === "admin_temp_password" && username === undefined) {
    throw new TypeError("cognito message: bad placeholder");
  }
  const text = COGNITO_TEXTS[kind][notifyLocale(locale)];
  // "{username}" stays as it is: Cognito replaces it.
  const fill = (s: string) => s.replace("{code}", placeholders.code);
  const { html } = layoutEmail({
    locale: notifyLocale(locale),
    subject: text.subject,
    headline: text.headline,
    paragraphs: text.body.map(fill),
  });
  return { subject: text.subject, html };
}
