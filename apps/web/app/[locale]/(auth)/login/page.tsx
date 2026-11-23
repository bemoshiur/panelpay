import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { routing } from "../../../../i18n/routing.ts";
import { isFlag, loadAuthPage, queryText } from "../../../../server/auth-page.ts";
import { AuthPageFrame } from "../_components/AuthPageFrame.tsx";
import { LoginContent } from "./LoginContent.tsx";

// Reads the session and the runtime: never prerendered, never cached.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale });
  return { title: t("Auth.meta.login"), robots: { index: false, follow: false } };
}

/** /login: a signed-in customer goes to the panel; `?verified=1` and `?reset=1` only choose a banner. */
export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const query = await searchParams;
  const next = queryText(query["next"]);
  // WPU-X20: `?reauth=1` (the link of "sign in again" for a fresh sign-in) opens the form for a signed-in customer.
  // It changes nothing else: `next` still passes the U12 allow-list and the new sign-in makes the fresh session.
  const reauth = isFlag(query["reauth"]);
  const page = await loadAuthPage(locale, next, { guest: !reauth });
  const banner = isFlag(query["verified"]) ? "verified" : isFlag(query["reset"]) ? "reset" : null;
  return (
    <AuthPageFrame locale={locale} path="/login">
      <LoginContent
        locale={locale}
        next={next}
        banner={banner}
        available={page.available}
        reauth={reauth}
        email={query["email"]}
      />
    </AuthPageFrame>
  );
}
