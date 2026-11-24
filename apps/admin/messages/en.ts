import type { bn } from "./bn.ts";

type Same<T> = { [K in keyof T]: T[K] extends string ? string : Same<T[K]> };

export const en: Same<typeof bn> = {
  Admin: {
    meta: {
      title: "PanelPay Admin",
    },
    home: {
      title: "The admin panel is being built",
      body: "This page holds the frame only for now.",
    },
    login: {
      title: "Admin sign-in",
      intro: "You need your password and the 6-digit code of your authenticator app.",
      email: "Email",
      password: "Password",
      code: "Authenticator code",
      codeHint: "6 digits, from your authenticator app",
      submit: "Sign in",
      errors: {
        invalid: "The form is not complete. Enter email, password and the 6-digit code.",
        denied: "Sign-in failed. Check your details and the code.",
        unavailable: "The service is not available now. Try again in a moment.",
        rate_limited: "Too many attempts. Try again in a few minutes.",
      },
    },
    signOut: "Sign out",
    noAccess: {
      title: "This page cannot be opened",
      body: "You have no access to this page, or the sign-in is not complete. Ask a superadmin if you need it.",
      login: "Go to sign-in",
    },
    section: {
      title: "Coming in the next step",
      body: "The page of this area is built in the next step. Your role may open it.",
    },
  },
};
