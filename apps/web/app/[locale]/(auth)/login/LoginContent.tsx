import { useTranslations } from "next-intl";
import type { Locale } from "@tc/ui/runtime";
import { safeNext } from "../../../../server/next-path.ts";
import { AuthAlert } from "../_components/AuthAlert.tsx";
import { AuthBody, AuthCard } from "../_components/AuthCard.tsx";
import { AuthUnavailableCard } from "../_components/AuthPageFrame.tsx";
import { LoginForm } from "./form.tsx";

// PRO-6: a value from the query, so plain text only: one address of the usual shape, at most 254
// characters, no spaces or control characters. It only fills the field; it signs in nothing.
const PREFILL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,185}\.[A-Za-z]{2,63}$/;
export function prefillEmail(value: unknown): string {
  return typeof value === "string" && value.length <= 254 && PREFILL.test(value) ? value : "";
}

/** /login (16.9): the "Already registered?" tab of login.html. */
export function LoginContent({
  locale,
  next,
  banner,
  available,
  reauth = false,
  email,
}: {
  locale: Locale;
  /** The raw `next` of the query; it is checked here again before it reaches the form (U12). */
  next: unknown;
  banner: "verified" | "reset" | null;
  available: boolean;
  /** WPU-X23: `?reauth=1` for a signed-in customer; the form posts it. */
  reauth?: boolean;
  /** PRO-6: the raw `email` of the query; only a plain address is filled in, anything else is dropped. */
  email?: unknown;
}) {
  const t = useTranslations("Auth");
  if (!available) return <AuthUnavailableCard locale={locale} title={t("meta.login")} />;
  return (
    <AuthCard
      title={t("card.title")}
      intro={t("card.intro")}
      tabs={{ active: "login", locale, next }}
    >
      <AuthBody heading={t("login.heading")}>
        {banner !== null ? (
          <AuthAlert kind="success">
            {t(banner === "verified" ? "login.verified" : "login.reset")}
          </AuthAlert>
        ) : null}
        <LoginForm
          locale={locale}
          next={safeNext(next) ?? ""}
          reauth={reauth}
          initialEmail={prefillEmail(email)}
        />
      </AuthBody>
    </AuthCard>
  );
}
