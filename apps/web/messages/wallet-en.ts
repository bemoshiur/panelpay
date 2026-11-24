import type { walletBn } from "./wallet-bn.ts";

type Same<T> = { [K in keyof T]: T[K] extends string ? string : Same<T[K]> };

export const walletEn: Same<typeof walletBn> = {
  Wallet: {
    meta: { title: "Wallet" },
    heading: "Wallet",
    balance: {
      label: "Current balance",
      hint: "You can use this balance to buy servers and other services.",
    },
    open: {
      label: "Payments waiting",
      hint: "They are added to your balance once confirmed.",
    },
    topUp: "Top up",
    ledger: {
      title: "Transactions",
      caption: "List of wallet transactions",
      date: "Date",
      description: "Description",
      in: "Money in",
      out: "Money out",
      balance: "Balance",
      kind: {
        topup: "Top-up",
        purchase: "Purchase",
        renewal: "Renewal",
        metered_charge: "Usage charge",
        reversal: "Automatic reversal",
        adjustment: "Adjustment",
        refund: "Refund",
        other: "Other",
      },
      empty: {
        title: "No transactions yet",
        body: "Your top-ups and purchases will appear here.",
      },
    },
    payments: {
      title: "Payments",
      caption: "List of top-up payments",
      amount: "Amount",
      state: "State",
      view: "View",
      empty: "No payments yet.",
    },
    state: {
      credited: "Paid",
      pending: "Pending",
      failed: "Failed",
      cancelled: "Cancelled",
      expired: "Expired",
    },
    banner: {
      checking: "We are checking your payment. Your balance changes once it is confirmed.",
      credited: "Your top-up is complete.",
      failed: "The payment did not go through. You were not charged.",
      cancelled: "You cancelled the payment.",
      expired: "The payment timed out.",
      unknown: "We could not find this payment.",
    },
    topup: {
      heading: "Top up your wallet",
      amount: {
        label: "Amount (BDT)",
        hint: "Minimum {min}, maximum {max}. Enter whole taka only.",
      },
      quick: { legend: "Quick amounts" },
      total: { label: "You pay", badge: "Total", none: "—" },
      submit: "Pay with EPS",
      how: {
        badge: "online payment",
        title: "How the payment works",
        p1: "You are taken to the secure EPS page to pay.",
        p2: "Card and mobile-wallet details never reach PanelPay.",
        p3: "Your balance grows only after EPS confirms the payment.",
      },
      badgeCaption:
        "Payments are processed by EPS in taka; PanelPay never sees your card or wallet details.",
      open: { title: "Payments waiting", view: "View" },
      help: {
        support: "Write to support",
        supportBody: "Tell us if something is wrong with a payment.",
        faq: "Payment questions",
        faqBody: "Answers to the usual questions.",
      },
      error: {
        required: "Enter an amount.",
        format: "Use digits only, with no decimal point or symbol.",
        too_low: "The amount must be at least {min}.",
        too_high: "The amount cannot be more than {max}.",
        rate_limited: "Too many attempts. Try again in {seconds} seconds.",
        unavailable:
          "The payment service is not available right now. You were not charged. Try again in a few minutes.",
        conflict: "This form is out of date. Enter the amount again and retry.",
        internal: "Something went wrong. Try again.",
        reference: "Reference",
      },
      closed: {
        title: "Top-up is not open yet",
        body: "We will tell you here when it opens. Your balance is unchanged.",
      },
      error_page: {
        title: "The top-up page could not be shown",
        body: "Try again in a moment. You were not charged.",
        retry: "Try again",
      },
    },
    status: {
      credited: {
        title: "Top-up complete",
        body: "{amount} was added. Your new balance is {balance}.",
      },
      pending: {
        title: "Checking your payment",
        body: "We are waiting for EPS to confirm. This page updates by itself.",
        checking: "Checking…",
        stopped: "We keep checking in the background for up to 24 hours.",
      },
      review: "Your payment needs a check by our team. Contact support.",
      failed: { title: "The payment did not go through", body: "You were not charged." },
      cancelled: { title: "The payment was cancelled", body: "You were not charged." },
      expired: {
        title: "The payment timed out",
        body: "If money left your account, tell support and quote this reference.",
      },
      amount: "Amount",
      date: "Date",
      reference: "Reference",
      checkAgain: "Check again",
      retryWait: "Check again in {seconds} seconds.",
      tryAgain: "Try again",
      backToWallet: "Back to wallet",
      createServer: "Create a server",
      notFound: {
        title: "Payment not found",
        body: "No payment with this link belongs to your account.",
      },
    },
    paging: { newer: "Newer", older: "Older" },
    error: {
      title: "The wallet could not be shown",
      body: "Try again in a moment. Your balance is unchanged.",
      retry: "Try again",
    },
  },
};
