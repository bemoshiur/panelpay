import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { knownClasses } from "@tc/ui/class-inventory";
import { mockupPresent, vendoredThemePresent } from "@tc/ui/theme-present";
import { describe, expect, it, vi } from "vitest";
import { SUPPORT_REQUESTS_ANCHORS } from "./mockup-anchors.ts";
import {
  REPLY_KEY,
  REQUEST_ID,
  REQUESTS,
  STATE_RENDERERS,
  THREAD,
  thread,
} from "./mockup-states.tsx";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

// WPU-Z6: /support/requests and /support/requests/[id] follow the shared mockup (U1) and show their states
// (U11): the list, the empty list, the thread, the closed thread, a refused reply and a request that is not
// the customer's.

// Not `new URL(..., import.meta.url)`: under jsdom Vite rewrites that form to an http URL.
const here = dirname(fileURLToPath(import.meta.url));
const mockupRoot = resolve(here, "../../../../../../..", "design/mockup");
const tokens = (text: string): Set<string> => {
  const out = new Set<string>();
  for (const attribute of text.matchAll(/class\s*=\s*"([^"]*)"/g)) {
    for (const token of (attribute[1] ?? "").split(/\s+/)) if (token !== "") out.add(token);
  }
  return out;
};
const render = (id: string, locale: "bn" | "en" = "en"): string =>
  (STATE_RENDERERS[id] as (l: "bn" | "en") => string)(locale);
const textOf = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the support request screens follow the shared mockup", () => {
  for (const row of SUPPORT_REQUESTS_ANCHORS) {
    it.skipIf(!mockupPresent())(`${row.state} / ${row.mockupFile}: ${row.why}`, () => {
      const inMockup = tokens(readFileSync(resolve(mockupRoot, row.mockupFile), "utf8"));
      expect(
        row.classes.filter((t) => !inMockup.has(t)),
        `not in ${row.mockupFile}`,
      ).toEqual([]);
      for (const locale of ["bn", "en"] as const) {
        const rendered = tokens(render(row.state, locale));
        expect(
          row.classes.filter((t) => !rendered.has(t)),
          `${row.state} in ${locale}`,
        ).toEqual([]);
      }
    });
  }

  it.skipIf(!vendoredThemePresent())(
    "every class of every rendered state is defined by the theme, Bootstrap, Font Awesome or tc.css",
    () => {
      const known = knownClasses();
      for (const [id, renderer] of Object.entries(STATE_RENDERERS)) {
        for (const locale of ["bn", "en"] as const) {
          const unknown = [...tokens(renderer(locale))].filter((t) => !known.has(t));
          expect(unknown, `${id} in ${locale}`).toEqual([]);
        }
      }
    },
  );

  it("every state of a row has a renderer", () => {
    for (const row of SUPPORT_REQUESTS_ANCHORS) expect(STATE_RENDERERS[row.state]).toBeDefined();
  });
});

describe("/support/requests", () => {
  it("lists subject, type, status and last activity in the repository's order, each linked to its thread", () => {
    const out = render("requests.list");
    const text = textOf(out);
    // The repository orders by newest activity; the page keeps that order.
    const positions = REQUESTS.map((r) => out.indexOf(`/en/support/requests/${r.id}`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text).toContain("Top-up not shown");
    expect(text).toContain("Billing and wallet");
    expect(text).toContain("Last activity");
    for (const status of ["Answered", "Open", "Closed"]) expect(text).toContain(status);
    expect(out).toContain('dateTime="2026-11-12T09:30:00.000Z"');
  });

  it("the status is a word with an icon, never a color alone (U11)", () => {
    const out = render("requests.list");
    expect(out).toMatch(/<span class="badge[^"]*"><i class="fas [^"]*"[^>]*><\/i>Answered<\/span>/);
  });

  it("has a New request button to /support/new, also on the empty list", () => {
    for (const id of ["requests.list", "requests.empty"]) {
      const out = render(id);
      expect(out).toContain('href="/en/support/new"');
      expect(textOf(out)).toContain("New request");
    }
    expect(textOf(render("requests.empty"))).toContain("No requests yet");
  });

  it("escapes a subject (customer text)", () => {
    const out = render("requests.list");
    expect(out).not.toContain("<b>not bold</b>");
    expect(out).toContain("&lt;b&gt;not bold&lt;/b&gt;");
  });

  it("shows Bengali digits and texts in bn", () => {
    const out = render("requests.list", "bn");
    expect(out).toMatch(/[০-৯]/);
    expect(textOf(out)).toContain("নতুন অনুরোধ");
    expect(textOf(out)).toContain("উত্তর দেওয়া হয়েছে");
  });
});

describe("/support/requests/[id]", () => {
  it("shows the request first and the replies oldest first, signed You or PanelPay support", () => {
    const text = textOf(render("thread.ready"));
    const order = [
      "My payment went through",
      "We are checking it.",
      "Thank you.",
      "The top-up is credited now.",
    ].map((s) => text.indexOf(s));
    expect(order.every((p) => p >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text.match(/PanelPay support/g)).toHaveLength(2);
    expect(text.match(/\bYou\b/g)).toHaveLength(2);
  });

  it("keeps the line breaks of a message as <br>, and escapes its text", () => {
    expect(render("thread.ready")).toMatch(/My payment went through<br\/>/);
    const out = thread({ ...THREAD, message: "<script>x</script>" })("en");
    expect(out).not.toContain("<script>x</script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("formats the times in the customer's locale and digits", () => {
    expect(render("thread.ready")).toContain('dateTime="2026-11-11T05:00:00.000Z"');
    expect(render("thread.ready", "bn")).toMatch(/[০-৯]/);
    expect(textOf(render("thread.ready", "bn"))).toContain("PanelPay সাপোর্ট");
  });

  it("shows no admin name or id: the thread data has none and the page adds none", () => {
    const out = render("thread.ready");
    expect(out).not.toMatch(/admin_?id/i);
    expect(Object.keys(THREAD.messages[0] ?? {}).sort()).toEqual([
      "authorType",
      "body",
      "createdAt",
      "id",
    ]);
  });

  it("has a reply form of 1 to 5000 characters with the key of this render as a hidden field", () => {
    const out = render("thread.ready");
    expect(out).toContain(`<input type="hidden" name="idempotencyKey" value="${REPLY_KEY}"/>`);
    expect(out).toMatch(
      /<textarea[^>]*name="body"[^>]*maxLength="5000"|<textarea[^>]*maxLength="5000"[^>]*name="body"/,
    );
    expect(out).toMatch(/<textarea[^>]*required/);
    expect(textOf(out)).toContain("Send reply");
    expect(textOf(out)).toContain("Sending a reply opens a closed or answered request again.");
  });

  it("offers Close request while the request is not closed", () => {
    expect(textOf(render("thread.ready"))).toContain("Close request");
    expect(textOf(thread({ ...THREAD, status: "open" })("en"))).toContain("Close request");
  });

  it("closed: says so, keeps the reply form and states that a reply opens it again; no Close request", () => {
    const text = textOf(render("thread.closed"));
    expect(text).toContain("This request is closed. Writing a reply below opens it again.");
    expect(text).toContain("Send reply");
    expect(text).not.toContain("Close request");
    expect(render("thread.closed")).toContain("alert alert-warning");
  });

  it("a request that is not the customer's shows the not-found state and no form", () => {
    const out = render("thread.notFound");
    expect(textOf(out)).toContain("Request not found");
    expect(out).toContain('href="/en/support/requests"');
    expect(out).not.toContain("<form");
    expect(out).not.toContain(REQUEST_ID);
  });

  it("says when earlier replies are not shown", () => {
    expect(textOf(thread({ ...THREAD, hasEarlier: true })("en"))).toContain(
      "Some earlier replies are not shown here.",
    );
    expect(textOf(render("thread.ready"))).not.toContain("Some earlier replies");
  });

  it("a refused reply shows a platform message, never raw error text", () => {
    const text = textOf(render("thread.error"));
    expect(text).toContain("Too many attempts in a short time.");
    for (const id of Object.keys(STATE_RENDERERS)) {
      for (const locale of ["bn", "en"] as const) {
        const out = render(id, locale);
        expect(out).not.toMatch(/arn:aws|\b\d{12}\b|AccessDenied|Exception/);
      }
    }
  });
});

// Final review (Z6 minors).
describe("the support thread and status, neutral labels", () => {
  it("labels an entry sent from the public support form neutrally, with an envelope, in both locales", () => {
    const withVisitor = {
      ...THREAD,
      messages: [
        {
          id: "0190aaaa-0000-7000-8000-0000000000f1",
          authorType: "visitor" as const,
          body: "Sent before I signed in.",
          createdAt: new Date("2026-11-11T06:00:00.000Z"),
        },
      ],
    };
    const en = thread(withVisitor)("en");
    expect(textOf(en)).toContain("Sent from the public support form");
    expect(en).toContain('<i class="fas fa-envelope me-2" aria-hidden="true"></i>');
    expect(textOf(thread(withVisitor)("bn"))).toContain("সর্বজনীন সাপোর্ট ফর্ম থেকে পাঠানো");
  });

  it('names a status it does not know "Status unknown", never an empty badge', () => {
    const odd = { ...THREAD, status: "escalated" as unknown as typeof THREAD.status };
    expect(textOf(thread(odd)("en"))).toContain("Status unknown");
    expect(textOf(thread(odd)("bn"))).toContain("অবস্থা জানা নেই");
    expect(textOf(thread({ ...THREAD, status: "answered" })("en"))).toContain("Answered");
  });
});
