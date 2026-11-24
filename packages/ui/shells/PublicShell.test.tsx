// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Locale } from "../runtime/index.ts";
import { localeHrefs } from "../runtime/index.ts";
import { shellMessages } from "./messages/index.ts";
import { CREDIT_URL } from "./parts/CreditLine.tsx";
import { PublicShell, type PublicShellProps } from "./PublicShell.tsx";
import { withIntl } from "./test-utils.tsx";

const LOCALES: readonly Locale[] = ["bn", "en"];

function shell(locale: Locale, over: Partial<PublicShellProps> = {}) {
  const props: PublicShellProps = {
    locale,
    localeHrefs: localeHrefs("/"),
    signedIn: false,
    openFamilies: ["cloudServers", "databases"],
    domainsOpen: true,
    announcement: "Coming soon",
    supportPhone: "+880 1700-000000",
    children: <p id="page-body">body</p>,
    ...over,
  };
  return render(withIntl(<PublicShell {...props} />, locale));
}

const menu = (c: HTMLElement): HTMLElement => c.querySelector("nav#menu") as HTMLElement;
const hrefs = (root: ParentNode): string[] =>
  [...root.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") as string);

interface ShellText {
  public: Record<string, string>;
  footer: Record<string, string>;
}

describe.each(LOCALES)("PublicShell (%s)", (locale) => {
  const t = shellMessages[locale]["Shell"] as unknown as ShellText;
  const aws = shellMessages[locale]["Aws"] as unknown as Record<string, string>;
  const prefix = "/en"; // WPU-X19: every page but the home page is English

  it("has a skip link to #main and a main landmark", () => {
    const { container } = shell(locale);
    const first = container.firstElementChild as HTMLElement;
    expect(first.tagName).toBe("A");
    expect(first.classList.contains("tc-skip-link")).toBe(true);
    expect(first.getAttribute("href")).toBe("#main");
    expect(container.querySelector("main#main #page-body")).not.toBeNull();
  });

  it("renders Products only for open families that have a page", () => {
    const { container } = shell(locale, { openFamilies: ["cloudServers", "loadBalancers"] });
    const list = menu(container).querySelector("ul.sub-menu.dropdown.bg-colorstyle") as HTMLElement;
    expect(hrefs(list)).toEqual([`${prefix}/products/cloud-servers`]);
    expect(list.querySelectorAll("li.menu-item > a.mergecolor")).toHaveLength(1);
    expect(menu(container).querySelector(".menu-item.menu-item-has-children")).not.toBeNull();
  });

  it("omits the Products item when no family has a page", () => {
    const { container } = shell(locale, { openFamilies: ["loadBalancers", "domains"] });
    expect(menu(container).querySelector(".menu-item-has-children")).toBeNull();
    expect(menu(container).querySelector("ul.sub-menu")).toBeNull();
  });

  it("shows Domains only when domainsOpen", () => {
    const open = shell(locale, { domainsOpen: true });
    expect(hrefs(menu(open.container))).toContain(`${prefix}/products/domains`);
    open.unmount();
    const closed = shell(locale, { domainsOpen: false });
    expect(hrefs(closed.container)).not.toContain(`${prefix}/products/domains`);
  });

  it("puts the locale prefix on every internal href", () => {
    const { container } = shell(locale);
    const all = hrefs(menu(container));
    expect(all).toContain(`${prefix}/pricing`);
    expect(all).toContain(`${prefix}/help`);
    expect(all).toContain(`${prefix}/login`);
    // The two links of the language switch point to both locales on purpose.
    const own = [...container.querySelectorAll("a[href]:not([hreflang])")].map(
      (a) => a.getAttribute("href") as string,
    );
    for (const href of own.filter((h) => h.startsWith("/"))) {
      // WPU-X19: the home page is the only unprefixed link, and only the home page may be Bengali.
      expect(href === "/" || href === "/en" || href.startsWith("/en/")).toBe(true);
    }
  });

  it("signed-in visitor sees Console linking /dashboard, others Log in linking /login", () => {
    const out = shell(locale, { signedIn: false });
    const login = menu(out.container).querySelector("a.btn.btn-default-yellow-fill.question");
    expect(login?.getAttribute("href")).toBe(`${prefix}/login`);
    expect(login?.textContent).toContain(t.public["login"]);
    out.unmount();
    const inn = shell(locale, { signedIn: true });
    const button = menu(inn.container).querySelector("a.btn.btn-default-yellow-fill.question");
    expect(button?.getAttribute("href")).toBe(`${prefix}/dashboard`);
    expect(button?.textContent).toContain(t.public["console"]);
    expect(hrefs(menu(inn.container))).not.toContain(`${prefix}/login`);
  });

  it("has no top line when announcement and phone are null", () => {
    const { container } = shell(locale, { announcement: null, supportPhone: null });
    expect(container.querySelector(".infonews")).toBeNull();
    const only = shell(locale, { announcement: "Hello", supportPhone: null });
    expect(only.container.querySelector(".infonews span")?.textContent).toBe("Hello");
    expect(only.container.querySelector("a.tabphone")).toBeNull();
  });

  it("keeps only + and digits in the phone href", () => {
    const { container } = shell(locale);
    const phone = container.querySelector("header a.iconews.tabphone");
    expect(phone?.getAttribute("href")).toBe("tel:+8801700000000");
    expect(phone?.textContent).toBe("+880 1700-000000");
  });

  it("has four footer columns with the four headings of Shell.footer", () => {
    const { container } = shell(locale);
    const columns = [...container.querySelectorAll("footer.footer .footer-top .col-sm-6.col-md-3")];
    expect(columns).toHaveLength(4);
    expect(columns.map((c) => c.querySelector(".heading")?.textContent)).toEqual([
      t.footer["products"],
      t.footer["company"],
      t.footer["support"],
      t.footer["legal"],
    ]);
    for (const c of columns) expect(c.querySelector("ul.footer-menu")).not.toBeNull();
  });

  it("links the footer pages", () => {
    const { container } = shell(locale);
    const all = hrefs(container.querySelector("footer") as HTMLElement);
    for (const path of ["/pricing", "/help", "/support", "/legal/terms", "/legal/privacy"]) {
      expect(all).toContain(`${prefix}${path}`);
    }
    // WPU-N1: there is no public /payments page, so the footer does not link to one.
    expect(all).not.toContain(`${prefix}/payments`);
  });

  it("holds Aws.short and the trademark line unchanged in the footer", () => {
    const { container } = shell(locale);
    const footer = container.querySelector("footer") as HTMLElement;
    const paragraphs = [...footer.querySelectorAll("p")].map((p) => p.textContent);
    expect(paragraphs).toContain(aws["short"]);
    expect(paragraphs).toContain(aws["trademark"]);
    expect(footer.querySelector("p.small")?.textContent).toBe(aws["trademark"]);
  });

  it("renders the paymentBanner inside the footer", () => {
    const { container } = shell(locale, { paymentBanner: <span id="eps-banner">EPS</span> });
    expect(container.querySelector("footer #eps-banner")).not.toBeNull();
  });

  it("has no style attribute, no script element and no link to another origin", () => {
    const { container } = shell(locale, { paymentBanner: <span>EPS</span> });
    expect(container.querySelector("[style]")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    // WPU-X30: the one outbound link is the open-source credit to the author (NOTICE, Apache-2.0 4(d)).
    for (const href of hrefs(container).filter((h) => h !== CREDIT_URL)) {
      expect(href.startsWith("/") || href.startsWith("#") || href.startsWith("tel:")).toBe(true);
      expect(href.startsWith("//")).toBe(false);
    }
    expect(hrefs(container).filter((h) => h === CREDIT_URL)).toHaveLength(1);
  });

  it("puts the name of the company behind PanelPay before any AWS text", () => {
    const { container } = shell(locale);
    const body = container.textContent as string;
    const brand = body.indexOf(t.footer["companyName"] as string);
    expect(brand).toBeGreaterThanOrEqual(0);
    expect(brand).toBeLessThan(body.indexOf(aws["short"] as string));
  });

  // WPU-Y6: the footer legal line is the company PanelPay with its BIN and trade licence.
  it("prints the company PanelPay, its BIN and its trade licence in the footer", () => {
    const { container } = shell(locale);
    const bottom = container.querySelector("footer .footer-bottom")?.textContent ?? "";
    expect(bottom).toContain("PanelPay");
    expect(bottom).toContain("BIN: 000000000-0000");
    expect(bottom).toContain("Trade License: TRAD/DNCC/000000/2000");
    expect(bottom).not.toMatch(/TiCON System/i);
  });

  it("renders the mobile bar and the language switch", () => {
    const { container } = shell(locale);
    const mobile = container.querySelector("div.menu-wrap.mobile");
    expect(mobile?.querySelector("button.menu-toggle#nav-toggle")).not.toBeNull();
    expect(
      mobile?.querySelector("div.main-menu.bg-seccolorstyle a[href$='/pricing']"),
    ).not.toBeNull();
    expect(menu(container).querySelectorAll("a[hreflang]")).toHaveLength(2);
  });
});
