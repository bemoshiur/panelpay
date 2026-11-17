import type { bn } from "./bn.ts";

type Same<T> = { [K in keyof T]: T[K] extends string ? string : Same<T[K]> };

// The `Aws` strings are the statements of docs/spec/16/16.13 (rule U6), used unchanged.
export const en: Same<typeof bn> = {
  Shell: {
    skip: "Skip to main content",
    brand: "TryAWS.now",
    logoAlt: "TryAWS.now",
    homeLabel: "TryAWS.now home",
    menu: "Menu",
    close: "Close",
    public: {
      supportPhone: "Support phone",
      menuLabel: "Main menu",
      pricing: "Pricing",
      products: "Products",
      domains: "Domains",
      help: "Help",
      login: "Log in",
      console: "Console",
    },
    footer: {
      products: "Products",
      company: "Company",
      support: "Support",
      legal: "Legal",
      pricing: "Pricing",
      payments: "Payments",
      help: "Help centre",
      contact: "Support request",
      terms: "Terms of service",
      privacy: "Privacy policy",
      // WPU-Y6 (owner, 2026-11-14): the company is TryAWS.now everywhere a customer or crawler reads it,
      // with its two identifiers written exactly as the owner gave them, in both locales.
      companyName: "TryAWS.now",
      bin: "BIN: 000000000-0000",
      tradeLicense: "Trade License: TRAD/DNCC/000000/2000",
      address: "Level 1, Example House, 1 Example Avenue, Sector-1, Example Area, Dhaka-1000",
    },
    // WPU-X30: the open-source credit (Apache-2.0 NOTICE). One link, to the author.
    credit: {
      text: "Open source software, created by",
      link: "S M Moshiur Rahman on LinkedIn",
    },
    auth: {
      backHome: "Back to home",
    },
    nav: {
      dashboard: "Dashboard",
      cloudServers: "Cloud Servers",
      databases: "Databases",
      objectStorage: "Object Storage",
      loadBalancers: "Load Balancers",
      containers: "Containers",
      cdn: "CDN",
      domains: "Domains and DNS",
      wallet: "Wallet",
      invoices: "Invoices",
      support: "Support",
      settings: "Settings",
    },
    app: {
      navLabel: "Panel menu",
      openNav: "Open navigation",
      soon: "Soon",
      notifications: "Notifications",
      account: "Account",
      profile: "Profile",
      security: "Security",
    },
    admin: {
      ops: "OPS",
      navLabel: "Admin menu",
      signedInAs: "Signed in as",
      roles: {
        superadmin: "Superadmin",
        ops: "Ops",
        finance: "Finance",
        support: "Support",
      },
      nav: {
        today: "Today",
        customers: "Customers",
        payments: "Payments",
        pricing: "Pricing",
        catalog: "Catalog",
        capacity: "Capacity",
        operations: "Operations",
        support: "Support",
        abuse: "Abuse",
        reconciliation: "Reconciliation",
        audit: "Audit",
        admins: "Admins",
      },
    },
    notFound: {
      title: "Page not found",
      body: "Check the link, or go back to the home page.",
    },
  },
  Aws: {
    short: "100% AWS infrastructure. Built on Amazon Lightsail.",
    long: "Every server, database and storage resource you buy here is an Amazon Lightsail resource running in an AWS Region (Singapore or Mumbai). TryAWS.now sells, bills and supports the service. You manage everything from this panel and do not need an AWS account.",
    trademark:
      "Amazon Web Services, AWS, Amazon Lightsail and Amazon Route 53 are trademarks of Amazon.com, Inc. or its affiliates.",
  },
};
