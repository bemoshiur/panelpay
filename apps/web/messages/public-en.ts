import { legalDocsEn } from "./legal-en.ts";
import type { publicBn } from "./public-bn.ts";

type Same<T> = { [K in keyof T]: T[K] extends string ? string : Same<T[K]> };

// The legal documents are in `legal-en.ts` (WPU-Z7), approved by the owner on 2026-11-14 (WPU-Y6).
export const publicEn: Same<typeof publicBn> = {
  Public: {
    crumb: { home: "Home" },
    entity: {
      statement:
        "PanelPay is a prepaid cloud panel for people and businesses in Bangladesh. You buy Cloud Servers, built on Amazon Lightsail, that run in the AWS Region Singapore or Mumbai. Prices are in taka (BDT) and include VAT and fees; you pay from a taka wallet that you top up with EPS. PanelPay sells, bills and supports the service.",
    },
    updated: { label: "Last updated: <time>{date}</time>" },
    // WPU-X21: the alt text of the official "Pay with EPS" badge (footer, home page, top-up page).
    epsBadge: {
      alt: "Pay with EPS: Visa, Mastercard, American Express, DBBL Nexus, UnionPay and Bangladeshi mobile wallets and banks. Verified by EPS.",
    },
    meta: {
      home: {
        title: "PanelPay: Cloud Server, built on Amazon Lightsail",
        description:
          "Prepaid cloud panel for Bangladesh. Cloud Server, built on Amazon Lightsail. Prices in taka, paid from a taka wallet, top up with EPS.",
      },
      pricing: {
        title: "Pricing: Cloud Server, built on Amazon Lightsail",
        description:
          "Cloud Server plans with prices in taka (BDT) for 30 days. Prices include VAT and fees. Built on Amazon Lightsail.",
      },
      cloudServers: {
        title: "Cloud Server, built on Amazon Lightsail",
        description:
          "Cloud servers that run in the AWS Region Singapore or Mumbai. Plans, specifications and prices in taka. Built on Amazon Lightsail.",
      },
      help: {
        title: "Help and frequently asked questions",
        description:
          "Answers about PanelPay and Amazon Lightsail: AWS, billing, support and where your data is.",
      },
      support: {
        title: "Support and contact",
        description:
          "How to get support from PanelPay: support requests in the panel, or the form on the support page without an account.",
      },
      legal: {
        title: "Legal documents",
        description: "PanelPay terms, privacy, acceptable use and refund policy.",
        descriptionOf: "{title} of PanelPay, the prepaid cloud panel for Bangladesh.",
      },
      soon: {
        description:
          "This product is not open yet. Leave your email address to hear when it opens.",
      },
      maintenance: { title: "Under maintenance" },
    },
    common: {
      orderNow: "Order now",
      seePricing: "See pricing",
      seePlans: "See plans",
      login: "Go to the panel",
      // WPU-X16 (owner decision of 2026-11-15): prices in taka (BDT) only, taka wallet, Amazon Lightsail.
      priceNote:
        "Prices are in taka (BDT), for 30 days, and include VAT and fees. You pay from your taka wallet, and you see the amount before you confirm. 100% AWS infrastructure. Built on Amazon Lightsail.",
      unavailableTitle: "Prices cannot be shown now",
      unavailableText: "The price list cannot be read at the moment. Try again in a little while.",
      noPlansTitle: "No plan is open yet",
      noPlansText: "Plans will show here when Cloud Server opens.",
      locationHeading: "Location",
      comingSoon: "Coming soon",
    },
    location: {
      "ap-southeast-1": "Singapore",
      "ap-south-1": "Mumbai",
    },
    product: {
      linux_instance: "Cloud Server",
      windows_instance: "Cloud Server (Windows)",
      database: "Managed Database",
    },
    spec: {
      cpu: "vCPU",
      ram: "Memory",
      disk: "Disk",
      transfer: "Data transfer",
      cpuValue: "{count} vCPU",
      gb: "{count} GB",
      planOf: "{product} {ram} GB",
      nameAt: "{name} · {location}",
      none: "–",
      perLocation: "{location}: {value}",
    },
    home: {
      heroTitle: "Cloud Server for Bangladesh. Pay in taka, no AWS account needed.",
      heroLogin: "Log in",
      heroSignup: "Create account",
      servicesTitle: "Services",
      servicesLabel: "List of services",
      productOpen: "Open",
      services: {
        instances: "Instances (Cloud Servers)",
        containers: "Containers",
        databases: "Databases",
        networking: "Networking",
        storage: "Storage",
        domains: "Domains & DNS",
        snapshots: "Snapshots",
      },
      chooserTitle: "Choose an instance",
      chooserLead: "The same steps you see in the panel after you log in.",
      locationTitle: "Select your instance location",
      locationRegion: "AWS Region: {name}",
      regionNames: {
        "ap-southeast-1": "Asia Pacific (Singapore)",
        "ap-south-1": "Asia Pacific (Mumbai)",
      },
      platformTitle: "Select a platform",
      platforms: {
        apps: "Linux apps",
        os: "Linux operating system",
        linux: "Linux",
        windows: "Microsoft Windows",
      },
      imageTitle: "Select an image",
      imageKindApp: "App image",
      imageKindOs: "Operating system image",
      imageSelect: "Select",
      imageSelected: "Selected",
      imageNote:
        "You pick the image again when you create the instance in the panel, after you log in.",
      typeTitle: "Select a plan type",
      types: {
        general_purpose: "General purpose",
        memory_optimized: "Memory-optimized",
        compute_optimized: "Compute-optimized",
      },
      typeDescriptions: {
        general_purpose: "Balanced CPU and memory for most workloads.",
        memory_optimized: "More memory for each vCPU, for in-memory workloads and databases.",
        compute_optimized: "More vCPU power for each GB, for batch and CPU-bound work.",
      },
      planTitle: "Choose your instance plan",
      createInstance: "Create instance",
      cardTitle: "{ram} GB · {cpu} vCPU",
      cardLine: "{disk} GB SSD · {transfer} GB transfer",
      perPeriod: "/ 30 days",
      plansAll: "See all plans and prices",
      createNote:
        "You create and manage instances in the panel, after you log in. Nothing is created on this page.",
    },
    pricing: {
      vatNote: "VAT and fees are included in every price.",
      regionNavLabel: "Filter by location",
      regionAll: "All locations",
      regionCurrent: "(selected)",
      heading: "Pricing",
      lead: "Cloud Server, built on Amazon Lightsail. Every price is for 30 days, in taka (BDT).",
      answer:
        "Every Cloud Server price on PanelPay is in taka (BDT) for 30 days and already includes VAT and fees. At checkout you see the exact amount before you confirm, and exactly that amount is taken from your taka wallet, which you top up with EPS.",
      tabsLabel: "Product type",
      tabCloudServers: "Cloud Server",
      tableTitle: "Compare plans",
      colPlan: "Plan",
      colMemory: "Memory",
      colDisk: "Disk",
      colTransfer: "Data transfer",
      colMonthly: "30 days",
      colOrder: "Order",
      tableCaption: "Cloud Server plans and prices by location",
      otherFamilies: "Other products",
      otherFamiliesText: "These products open step by step. Their prices show here when they open.",
    },
    cloudServers: {
      heading: "Cloud Server, built on Amazon Lightsail",
      lead: "Every Cloud Server is an Amazon Lightsail instance that runs in the AWS Region Singapore or Mumbai.",
      answer:
        "A Cloud Server on PanelPay is an Amazon Lightsail instance that runs in the AWS Region Singapore or Mumbai. You pick a plan and a location, see the price in taka for 30 days with VAT and fees included, pay from your taka wallet, and manage the server from the PanelPay panel.",
      plansTitle: "Plans",
      featuresTitle: "What you get",
      features: {
        panel: {
          title: "A simple panel",
          text: "Create servers, reboot them and manage firewall rules and SSH keys in one place.",
        },
        backup: {
          title: "Backups",
          text: "Take and restore backups from the panel.",
        },
        bdt: { title: "Prepaid in taka", text: "Top up your wallet, then buy a server." },
        locations: {
          title: "Two locations",
          text: "Singapore or Mumbai, whichever is closer to your users.",
        },
      },
      pickerTitle: "Choose your plan",
      pickerLegend: "Plan",
      specsTitle: "Specifications",
      colLocation: "Location",
      faqTitle: "Questions about this product",
    },
    soon: {
      title: "{name} is coming soon",
      text: "This product is not open yet. We will email you when it opens.",
      formLabel: "Tell me when {name} opens",
      email: "Email",
      emailPlaceholder: "name@example.com",
      submit: "Notify me",
      sending: "Sending",
      doneTitle: "Thank you",
      done: "We will email you when the product opens.",
      back: "Back to pricing",
      error: {
        invalid: "Enter a valid email address.",
        rate_limited: "Too many tries. Try again in a little while.",
        unavailable: "We cannot save this now. Try again in a little while.",
      },
    },
    family: {
      databases: "Managed Database",
      objectStorage: "Object Storage",
      loadBalancers: "Load Balancer",
      containers: "Container Service",
      cdn: "CDN",
      dns: "DNS",
      domains: "Domains",
    },
    familyOpen: {
      text: "This product is open. Go to the panel to see plans and prices and to buy.",
    },
    help: {
      heading: "Frequently asked questions",
      lead: "The questions we hear most about PanelPay and Amazon Lightsail.",
      answer:
        "PanelPay sells Cloud Servers, built on Amazon Lightsail, in the AWS Region Singapore or Mumbai. You top up a wallet in taka with EPS and buy from it; prices are in taka (BDT), include VAT and fees, and are taken from the wallet at checkout. To buy, you verify your email and mobile and use an authenticator app.",
      listTitle: "Questions and answers",
      stillTitle: "Did not find an answer?",
      stillText: "Tell us on the support page.",
      items: {
        realAws: {
          q: "Is this real AWS?",
          a: "Yes, 100%. Every server, database, disk and bucket you buy here is an Amazon Lightsail resource that runs in the AWS Region you choose.",
        },
        noAccount: {
          q: "Do I get an AWS account or the AWS console?",
          a: "No. You run everything from the PanelPay panel. You do not need a separate AWS account or the AWS console.",
        },
        billing: {
          q: "Who bills me and who supports me?",
          a: "PanelPay. We sell and bill the service, and we support you through support requests in the panel. There is no support phone line.",
        },
        dataLocation: {
          q: "Where is my data?",
          a: "Servers, databases, disks and buckets are in the AWS Region you choose. CDN copies are at AWS edge locations worldwide. DNS is a global service. Your account, and any identity documents you sent before, are kept in AWS Singapore.",
        },
        payment: {
          q: "How do I pay?",
          a: "Top up your wallet with EPS first, then buy servers from the wallet. The wallet and all payments are in taka; the taka amount of an order is shown at checkout.",
        },
        priceIncludes: {
          q: "What does the price include?",
          a: "A displayed price is in taka (BDT), for 30 days, and includes VAT and fees. At checkout you see the amount before you confirm, and you are charged exactly that amount.",
        },
        locations: {
          q: "Which locations are there?",
          a: "Two AWS Regions at the start: Singapore and Mumbai. The data transfer of a plan can differ by location, so the price list shows the value for each location.",
        },
        identity: {
          q: "What do I need to do before I buy?",
          a: "Three steps: verify your e-mail, verify your mobile number and switch on an authenticator app. No documents are needed, because everything is paid in advance from your wallet.",
        },
        products: {
          q: "When do databases, storage and other products come?",
          a: "Products open step by step. If one is not open yet, leave your email on its page and we will tell you when it opens.",
        },
        port25: {
          q: "Is outbound port 25 open for sending email?",
          a: "No. Outbound port 25 is closed. To send email, use the API of an email service or another port.",
        },
        support: {
          q: "Where do I get help?",
          a: "Open a support request in the panel and read our answers there. Without an account, use the form on the support page and we answer by email. There is no support phone line or support email address.",
        },
        bdt: {
          q: "Are prices in taka?",
          a: "Prices are shown in Bangladeshi taka (BDT), and so are your wallet, top-ups and invoices. The amount you see at checkout is exactly the amount taken from your wallet.",
        },
        vatInvoice: {
          q: "Do I get a VAT invoice?",
          a: "Yes. For each purchase and renewal PanelPay gives you a tax invoice (Mushak-6.3) in taka. Every price includes VAT and the other taxes and fees that apply, and the invoice shows the VAT and the fees. A VAT-registered business can have its BIN printed on the invoice.",
        },
        refunds: {
          q: "Can I get a refund?",
          a: "If a resource cannot be created after you paid, the full amount goes back to your wallet automatically. When we cancel a purchase or a renewal, the whole amount goes back to your wallet and you get a credit note in taka. For anything else, open a billing support request; the refund policy has the details.",
        },
      },
    },
    support: {
      heading: "Support and contact",
      lead: "PanelPay gives support through support requests only, and our support team answers every request in writing. With an account, open a request in the panel and follow the answers there. Without an account, use the form on the support page and we answer by email. There is no support phone line and no support email address.",
      customerTitle: "If you have an account",
      customerText:
        "Open a support request in the panel and follow it there: read our answers and reply in the same place. If you are not signed in, you sign in first.",
      newCta: "Open a support request",
      requestsCta: "My support requests",
      visitorTitle: "If you have no account",
      visitorText:
        "Write to us with the form below. We send our answer to the email address you give.",
      faqTitle: "Look at the questions first",
      faqText: "Most answers are there.",
      faqCta: "Questions",
      form: {
        title: "Write to us",
        lead: "No account needed. We answer by email. Do not write passwords, card numbers or ID document numbers here.",
        email: "Your email",
        emailPlaceholder: "name@example.com",
        name: "Your name (optional)",
        category: "What is it about",
        subject: "Subject",
        message: "Your message",
        honeypot: "Leave this field empty",
        submit: "Send",
        doneTitle: "Thank you",
        done: "We received your message and will answer by email.",
        categories: {
          billing: "Billing and payments",
          technical: "Technical help",
          kyc: "Identity check",
          domain: "Domains",
          abuse: "Report abuse",
          other: "Something else",
        },
        error: {
          invalid: "Check the marked fields and try again.",
          rate_limited: "Too many tries. Try again in a little while.",
          unavailable: "We cannot save this now. Try again in a little while.",
        },
        fieldInvalid: "Check this field.",
        reference: "Quote this code if you write to us again: {ref}",
      },
    },
    legal: {
      heading: "Legal documents",
      sidebarTitle: "Documents",
      sidebarLabel: "List of legal documents",
      // WPU-Y6: the texts are approved by the owner (2026-11-14); no draft notice. The version line and
      // LEGAL_VERSIONS (server/auth/legal.ts) move together.
      version: "Version 5, 15 November 2026",
      docs: legalDocsEn,
    },
    system: {
      maintenanceTitle: "Under maintenance",
      maintenanceText: "We are improving the service and will be back soon.",
      errorTitle: "Something went wrong",
      errorText: "The page could not be shown. Try again.",
      retry: "Try again",
      home: "Go home",
      contactUs: "Contact us",
    },
  },
};
