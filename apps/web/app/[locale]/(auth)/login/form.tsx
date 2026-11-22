"use client";

import { useTranslations } from "next-intl";
import { Field } from "@tc/ui";
import { localePath } from "@tc/ui/runtime";
import type { Locale } from "@tc/ui/runtime";
import { AuthForm } from "../_components/AuthForm.tsx";
import { signInAction } from "./actions.ts";

/** The sign-in form of login.html: email, password, the yellow button and the forgot link. No "remember me" (16.9). */
export function LoginForm({
  locale,
  next,
  reauth = false,
  initialEmail = "",
}: {
  locale: Locale;
  next: string;
  /** PRO-6: the address the "Open panel" link of the WHMCS module fills in; already checked by the page. */
  initialEmail?: string;
  /** WPU-X23: the sign-in again of a signed-in customer; posted so the action runs the full flow. */
  reauth?: boolean;
}) {
  const t = useTranslations("Auth");
  return (
    <AuthForm
      action={signInAction}
      hidden={{ locale, ...(next !== "" ? { next } : {}), ...(reauth ? { reauth: "1" } : {}) }}
      submitLabel={t("login.submit")}
      submitIcon="fas fa-lock"
      failureExtra={
        <a className="golink" href={localePath(locale, "/verify")}>
          {t("login.verifyLink")}
        </a>
      }
      afterSubmit={
        <a className="golink me-3 position-relative" href={localePath(locale, "/forgot-password")}>
          {t("login.forgot")}
        </a>
      }
    >
      {({ error, values }) => (
        <div className="row">
          <div className="col-md-6 position-relative">
            <Field
              name="email"
              type="email"
              label={t("field.email")}
              icon="fas fa-envelope"
              autoComplete="username"
              inputMode="email"
              maxLength={320}
              required
              spellCheck={false}
              autoCapitalize="off"
              defaultValue={values["email"] ?? (initialEmail === "" ? undefined : initialEmail)}
              {...(error("email") !== undefined ? { error: error("email") as string } : {})}
            />
          </div>
          <div className="col-md-6 position-relative">
            <Field
              name="password"
              type="password"
              label={t("field.password")}
              icon="fas fa-lock"
              autoComplete="current-password"
              maxLength={512}
              required
              spellCheck={false}
              autoCapitalize="off"
              {...(error("password") !== undefined ? { error: error("password") as string } : {})}
            />
          </div>
          {values["totpStep"] === "1" ? (
            // WPU-X11: the authenticator step, shown after the provider asked for the code. The flag is
            // posted again so a wrong code keeps the field; the code itself is never given back.
            <div className="col-md-6 position-relative">
              <input type="hidden" name="totpStep" value="1" />
              <Field
                name="totpCode"
                label={t("field.totpCode")}
                hint={t("hint.totpCode")}
                icon="fas fa-shield-alt"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={12}
                required
                spellCheck={false}
                autoCapitalize="off"
                {...(error("totpCode") !== undefined ? { error: error("totpCode") as string } : {})}
              />
            </div>
          ) : null}
        </div>
      )}
    </AuthForm>
  );
}
