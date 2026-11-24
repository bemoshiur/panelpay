import type { supportBn } from "./support-bn.ts";

type Same<T> = { [K in keyof T]: T[K] extends string ? string : Same<T[K]> };

export const supportEn: Same<typeof supportBn> = {
  SupportForm: {
    meta: { title: "Contact support" },
    heading: "Contact support",
    intro:
      "Write down your problem or question. The PanelPay support team answers in your support requests.",
    form: {
      title: "New request",
      category: {
        legend: "Type of request",
        billing: "Billing and wallet",
        technical: "Technical problem",
        kyc: "Identity check",
        domain: "Domains and DNS",
        abuse: "Abuse report",
        other: "Something else",
      },
      related: {
        label: "Related to (optional)",
        none: "Nothing in particular",
        hint: "Pick the server or service this is about.",
      },
      subject: { label: "Subject", hint: "One line, up to 120 characters." },
      message: {
        label: "Message",
        hint: "Say what happened. Do not write passwords or secret codes.",
      },
      submit: "Send request",
      working: "Sending…",
    },
    done: {
      title: "Request sent",
      body: "We have your request. The answer appears in your support requests.",
      reference: "Request reference",
      again: "Write another request",
      replayed: "This request was already sent earlier. It was not added again.",
      open: "View the request",
    },
    list: {
      title: "Your earlier requests",
      caption: "The list of your support requests",
      subject: "Subject",
      category: "Type",
      status: "Status",
      sentOn: "Sent on",
      empty: { title: "No requests yet", body: "Your requests show here once you send one." },
    },
    status: { open: "Open", answered: "Answered", closed: "Closed", unknown: "Status unknown" },
    error: {
      unauthenticated: "Your session has ended. Sign in again.",
      validation: "Some details are wrong. Correct the marked fields and try again.",
      rate_limited: "Too many requests in a short time. Wait a little and try again.",
      forbidden: "This action could not be done.",
      unavailable: "We could not finish this now. Try again in a little while.",
    },
    field: { invalid: "The details in this field are not correct." },
  },
  SupportRequests: {
    meta: { title: "Support requests", threadTitle: "Support request details" },
    heading: "Support requests",
    intro: "Your requests and their answers. The most recent activity is shown first.",
    newRequest: "New request",
    list: {
      caption: "The list of your support requests",
      subject: "Subject",
      category: "Type",
      status: "Status",
      lastActivity: "Last activity",
      empty: {
        title: "No requests yet",
        body: "Send a new request when you have a problem or a question. The answers show here.",
      },
    },
    thread: {
      back: "All requests",
      category: "Type",
      status: "Status",
      openedOn: "Sent on",
      lastActivity: "Last activity",
      reference: "Reference",
      author: {
        customer: "You",
        visitor: "Sent from the public support form",
        admin: "PanelPay support",
      },
      earlier: "Some earlier replies are not shown here. Tell support if you need them.",
      closed: "This request is closed. Writing a reply below opens it again.",
    },
    reply: {
      title: "Write a reply",
      label: "Your reply",
      hint: "Up to 5000 characters. Do not write passwords or secret codes.",
      rule: "Sending a reply opens a closed or answered request again.",
      submit: "Send reply",
      working: "Sending…",
      done: "Your reply was added.",
      replayed: "This reply was already sent earlier. It was not added again.",
    },
    close: {
      button: "Close request",
      working: "Closing…",
      hint: "Close the request when your problem is solved. A later reply opens it again.",
      done: "The request was closed.",
    },
    notFound: {
      title: "Request not found",
      body: "You have no support request at this address.",
      back: "All requests",
    },
    error: {
      unauthenticated: "Your session has ended. Sign in again.",
      validation: "Some details are wrong. Correct the marked field and try again.",
      not_found: "The request was not found.",
      conflict:
        "This form was already sent with another text. Open the page again and write your reply anew.",
      rate_limited: "Too many attempts in a short time. Wait a little and try again.",
      forbidden: "This action could not be done.",
      unavailable: "We could not finish this now. Try again in a little while.",
    },
    field: { invalid: "Write 1 to 5000 characters, without special control characters." },
  },
};
