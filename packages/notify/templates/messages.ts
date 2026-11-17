import type { TemplateId } from "../queue/types";

// The texts of the 22 messages, Bengali first. Two typed catalogs: a missing key is a type error,
// and test/templates.test.ts checks every placeholder, the SMS length and the forbidden forms
// (16.16: "AWS Lightsail"). Placeholders are plain `{name}`. Wording: TryAWS.now sells, bills and
// supports; AWS is named only in the footer statements of 16.13, which are used unchanged.

export interface TemplateText {
  readonly subject: string;
  readonly headline: string;
  readonly body: readonly string[];
  // Present for every template that can send an SMS. No link: operators filter an unregistered
  // A2P SMS with a link. English is ASCII (BDT, not the taka sign) so that it stays GSM-7.
  readonly sms?: string;
  // Small named sentences the template picks from, for example the failure kind.
  readonly extra?: Readonly<Record<string, string>>;
}
export type Catalog = Readonly<Record<TemplateId, TemplateText>>;

export interface SharedText {
  readonly wordmark: string;
  readonly awsShort: string;
  readonly trademark: string;
  readonly address: string;
  readonly footerNote: string;
  readonly cta: Readonly<Record<string, string>>;
  readonly products: Readonly<Record<string, string>>;
  readonly regions: Readonly<Record<string, string>>;
}

// 16.13 "used unchanged": the trademark line is English in both locales.
const TRADEMARK =
  "Amazon Web Services, AWS, Amazon Lightsail and Amazon Route 53 are trademarks of Amazon.com, Inc. or its affiliates.";
// WPU-Y6 (owner, 2026-11-14): the company is TryAWS.now, with its BIN and trade licence written exactly
// as the owner gave them (the same as the footer of the site, Shell.footer).
const ADDRESS =
  "TryAWS.now, Level 1, Example House, 1 Example Avenue, Sector-1, Example Area, Dhaka-1000. BIN: 000000000-0000. Trade License: TRAD/DNCC/000000/2000";

export const SHARED: Readonly<Record<"bn" | "en", SharedText>> = {
  bn: {
    wordmark: "TryAWS.now",
    awsShort: "১০০% AWS অবকাঠামো। Amazon Lightsail দিয়ে তৈরি।",
    trademark: TRADEMARK,
    address: ADDRESS,
    footerNote: "এই বার্তাটি আপনার TryAWS.now অ্যাকাউন্টের জন্য পাঠানো হয়েছে।",
    cta: {
      open_panel: "প্যানেল খুলুন",
      kyc: "KYC দেখুন",
      create_server: "সার্ভার তৈরি করুন",
      view_wallet: "ওয়ালেট দেখুন",
      view_invoice: "ইনভয়েস দেখুন",
      view_order: "অর্ডার দেখুন",
      view_resource: "রিসোর্স দেখুন",
      renew: "রিনিউ করুন",
      restore: "রিস্টোর করুন",
      top_up: "টপ আপ করুন",
      security: "নিরাপত্তা সেটিং",
      open_domain: "ডোমেইন দেখুন",
      open_support: "সাপোর্ট পেজ খুলুন",
      open_dns: "ডিএনএস পেজ খুলুন",
      order_now: "এখনই অর্ডার করুন",
      open_request: "অনুরোধটি খুলুন",
    },
    products: {
      instance: "ক্লাউড সার্ভার",
      database: "ম্যানেজড ডেটাবেস",
      disk: "ব্লক স্টোরেজ",
      bucket: "অবজেক্ট স্টোরেজ",
      load_balancer: "লোড ব্যালান্সার",
      container_service: "কন্টেইনার সার্ভিস",
      cdn: "সিডিএন",
      static_ip: "স্ট্যাটিক আইপি",
      snapshot: "ব্যাকআপ",
      dns_zone: "ডিএনএস",
      domain: "ডোমেইন",
    },
    regions: {
      "ap-southeast-1": "এশিয়া প্যাসিফিক (সিঙ্গাপুর)",
      "ap-south-1": "এশিয়া প্যাসিফিক (মুম্বাই)",
      "us-east-1": "ইউএস ইস্ট (ভার্জিনিয়া)",
    },
  },
  en: {
    wordmark: "TryAWS.now",
    awsShort: "100% AWS infrastructure. Built on Amazon Lightsail.",
    trademark: TRADEMARK,
    address: ADDRESS,
    footerNote: "This message was sent for your TryAWS.now account.",
    cta: {
      open_panel: "Open the panel",
      kyc: "View KYC",
      create_server: "Create a server",
      view_wallet: "View wallet",
      view_invoice: "View invoice",
      view_order: "View order",
      view_resource: "View resource",
      renew: "Renew now",
      restore: "Restore",
      top_up: "Top up",
      security: "Security settings",
      open_domain: "View domain",
      open_support: "Open the support page",
      open_dns: "Open the DNS page",
      order_now: "Order now",
      open_request: "Open the request",
    },
    products: {
      instance: "Cloud Server",
      database: "Managed Database",
      disk: "Block Storage",
      bucket: "Object Storage",
      load_balancer: "Load Balancer",
      container_service: "Container Service",
      cdn: "CDN",
      static_ip: "Static IP",
      snapshot: "Backup",
      dns_zone: "DNS",
      domain: "Domain",
    },
    regions: {
      "ap-southeast-1": "Asia Pacific (Singapore)",
      "ap-south-1": "Asia Pacific (Mumbai)",
      "us-east-1": "US East (N. Virginia)",
    },
  },
};

const SECURITY_BN = (what: string, sms: string): TemplateText => ({
  subject: `নিরাপত্তা সতর্কতা: ${what}`,
  headline: what,
  body: [
    `{time}-এ আপনার অ্যাকাউন্টে ${what} হয়েছে{where}।`,
    "এটি আপনি না করে থাকলে এখনই পাসওয়ার্ড বদলান এবং আমাদের সাপোর্টে জানান।",
  ],
  sms,
  extra: { from_ip: " (আইপি {ip} থেকে)" },
});

export const BN: Catalog = {
  welcome: {
    subject: "TryAWS.now-এ স্বাগতম",
    headline: "স্বাগতম",
    body: [
      "আপনার অ্যাকাউন্ট প্রস্তুত।",
      "প্যানেলে ঢুকে ফোন যাচাই ও KYC সম্পন্ন করুন, তারপর প্রথম সার্ভার তৈরি করুন।",
    ],
  },
  kyc_received: {
    subject: "আপনার KYC জমা পেয়েছি",
    headline: "KYC জমা হয়েছে",
    body: ["আপনার KYC তথ্য আমরা পেয়েছি। যাচাই শেষ হলে আপনাকে জানানো হবে।"],
  },
  kyc_approved: {
    subject: "আপনার KYC অনুমোদিত হয়েছে",
    headline: "KYC অনুমোদিত",
    body: ["আপনার KYC যাচাই সম্পন্ন হয়েছে। এখন আপনি রিসোর্স কিনতে পারবেন।"],
    sms: "TryAWS.now: আপনার KYC অনুমোদিত হয়েছে। এখন রিসোর্স কিনতে পারবেন।",
  },
  kyc_rejected: {
    subject: "আপনার KYC গ্রহণ করা যায়নি",
    headline: "KYC গ্রহণ করা যায়নি",
    body: ["কারণ: {reason}", "তথ্য ঠিক করে আবার জমা দিন।"],
  },
  topup_receipt: {
    subject: "টপ আপ রসিদ",
    headline: "টপ আপ সফল",
    body: ["{date} তারিখে আপনার ওয়ালেটে {amount} যোগ হয়েছে।", "বর্তমান ব্যালেন্স: {balance}।"],
  },
  order_paid: {
    subject: "ইনভয়েস {invoice}",
    headline: "পেমেন্ট সম্পন্ন",
    body: [
      "আপনার {product} অর্ডারের মূল্য {total} ওয়ালেট থেকে পরিশোধ হয়েছে।",
      "ইনভয়েস নম্বর: {invoice}। বর্তমান ব্যালেন্স: {balance}।",
    ],
  },
  order_failed_refunded: {
    subject: "অর্ডার সম্পন্ন করা যায়নি, টাকা ফেরত দেওয়া হয়েছে",
    headline: "অর্ডার ব্যর্থ, টাকা ফেরত",
    body: [
      "আপনার {product} অর্ডারটি সম্পন্ন করা যায়নি: {failure}",
      "{refund} আপনার ওয়ালেটে ফেরত দেওয়া হয়েছে। বর্তমান ব্যালেন্স: {balance}।",
    ],
    extra: {
      create_failed: "রিসোর্স তৈরি করা যায়নি।",
      capacity_full: "এই লোকেশনে এখন ক্ষমতা নেই।",
    },
  },
  wallet_credited_plan_change: {
    subject: "আপনার ওয়ালেটে {credit} জমা হয়েছে",
    headline: "ওয়ালেটে টাকা জমা",
    body: [
      "প্ল্যান পরিবর্তন সম্পন্ন করা যায়নি, তাই আমরা আপনার ওয়ালেটে {credit} জমা করেছি।",
      "বর্তমান ব্যালেন্স: {balance}।",
    ],
  },
  resource_ready: {
    subject: "আপনার {product} প্রস্তুত",
    headline: "রিসোর্স প্রস্তুত",
    body: ["{name} ({product}) প্রস্তুত।", "লোকেশন: {region}", "ঠিকানা: {address}"],
    sms: "TryAWS.now: আপনার {product} প্রস্তুত। ঠিকানা: {address}",
  },
  renewal_reminder: {
    subject: "{days} দিন পর রিনিউ",
    headline: "রিনিউয়ের অনুস্মারক",
    body: [
      "{name} এর মেয়াদ {date} তারিখে শেষ হবে ({days} দিন বাকি)।",
      "রিনিউয়ের পরিমাণ: {amount}। ওয়ালেট ব্যালেন্স: {balance}।",
      "{note}",
    ],
    sms: "TryAWS.now: {name} কাল ({date}) শেষ হচ্ছে। রিনিউ {amount}, ব্যালেন্স {balance}।",
    extra: {
      auto_on: "স্বয়ংক্রিয় রিনিউ চালু আছে। ওয়ালেটে যথেষ্ট টাকা রাখুন।",
      auto_off: "স্বয়ংক্রিয় রিনিউ বন্ধ আছে। মেয়াদের মধ্যে নিজে রিনিউ করুন।",
    },
  },
  renewed: {
    subject: "রিনিউ সম্পন্ন, ইনভয়েস {invoice}",
    headline: "রিনিউ সম্পন্ন",
    body: [
      "{total} ওয়ালেট থেকে কেটে আপনার রিসোর্স রিনিউ হয়েছে। নতুন মেয়াদ: {date}।",
      "ইনভয়েস নম্বর: {invoice}। বর্তমান ব্যালেন্স: {balance}।",
    ],
  },
  grace_started: {
    subject: "রিনিউ বাকি: রিসোর্স স্থগিত",
    headline: "রিনিউ বাকি, রিসোর্স স্থগিত",
    body: [
      "{name} রিনিউ হয়নি, তাই স্থগিত করা হয়েছে।",
      "{until} পর্যন্ত রিনিউ করলে সব আগের মতো চলবে। এরপর রিসোর্স মুছে যাবে।",
      "রিনিউয়ের পরিমাণ: {amount}। ওয়ালেট ব্যালেন্স: {balance}।",
    ],
    sms: "TryAWS.now: {name} স্থগিত। {until} এর মধ্যে রিনিউ ({amount}) না করলে মুছে যাবে।",
  },
  resource_destroyed: {
    subject: "রিসোর্স মুছে গেছে, {kept} রাখা আছে",
    headline: "রিসোর্স মুছে গেছে",
    body: [
      "{name} মুছে ফেলা হয়েছে। আপনার {kept} {until} পর্যন্ত রাখা হবে।",
      "এর মধ্যে রিস্টোর করতে পারবেন।",
    ],
    sms: "TryAWS.now: {name} মুছে গেছে। {kept} {until} পর্যন্ত রিস্টোর করতে পারবেন।",
    extra: { backup: "ব্যাকআপ", settings: "সেটিং" },
  },
  backups_purged: {
    subject: "ব্যাকআপ মুছে ফেলা হয়েছে",
    headline: "ব্যাকআপ মুছে ফেলা হয়েছে",
    body: ["{name} এর রাখা {kept} {date} তারিখে মুছে ফেলা হয়েছে। এটি আর ফেরানো যাবে না।"],
    extra: { backup: "ব্যাকআপ", settings: "সেটিং" },
  },
  low_balance: {
    subject: "ওয়ালেট ব্যালেন্স কম",
    headline: "ব্যালেন্স কম",
    body: [
      "আগামী {windowDays} দিনে রিনিউয়ে {due} লাগবে, কিন্তু ওয়ালেটে আছে {balance}।",
      "রিসোর্স চালু রাখতে টপ আপ করুন।",
    ],
  },
  payment_expired: {
    subject: "পেমেন্টের সময় শেষ",
    headline: "পেমেন্টের সময় শেষ",
    body: [
      "{amount} এর পেমেন্টটি সম্পন্ন হয়নি এবং মেয়াদ শেষ হয়েছে। আপনার কোনো টাকা কাটা হয়নি।",
      "আবার চেষ্টা করুন।",
    ],
  },
  security_new_sign_in: SECURITY_BN(
    "নতুন সাইন-ইন",
    "TryAWS.now: আপনার অ্যাকাউন্টে নতুন সাইন-ইন হয়েছে। আপনি না হলে এখনই পাসওয়ার্ড বদলান।",
  ),
  security_password_changed: SECURITY_BN(
    "পাসওয়ার্ড পরিবর্তন",
    "TryAWS.now: আপনার পাসওয়ার্ড বদলানো হয়েছে। আপনি না হলে এখনই সাপোর্টে জানান।",
  ),
  security_totp_changed: SECURITY_BN(
    "TOTP সেটিং পরিবর্তন",
    "TryAWS.now: আপনার TOTP সেটিং বদলানো হয়েছে। আপনি না হলে এখনই সাপোর্টে জানান।",
  ),
  security_email_changed: SECURITY_BN(
    "ইমেইল ঠিকানা পরিবর্তন",
    "TryAWS.now: আপনার ইমেইল ঠিকানা বদলানো হয়েছে। আপনি না হলে এখনই সাপোর্টে জানান।",
  ),
  security_totp_blocked: {
    subject: "নিরাপত্তা সতর্কতা: ভুল অথেনটিকেটর কোড",
    headline: "ভুল অথেনটিকেটর কোড",
    body: [
      "{time}-এ কেউ আপনার সঠিক পাসওয়ার্ড দিয়ে সাইন ইনের চেষ্টা করেছে{where}, কিন্তু অথেনটিকেটরের কোড বারবার ভুল দিয়েছে। নিরাপত্তার জন্য কিছুক্ষণ সাইন ইন বন্ধ রাখা হয়েছে।",
      "এটি আপনি না হলে আপনার পাসওয়ার্ড কারও হাতে গেছে। এখনই পাসওয়ার্ড বদলান এবং আমাদের সাপোর্টে জানান।",
    ],
    extra: { from_ip: " (আইপি {ip} থেকে)" },
  },
  security_phone_changed: SECURITY_BN(
    "ফোন নম্বর পরিবর্তন",
    "TryAWS.now: আপনার ফোন নম্বর বদলানো হয়েছে। আপনি না হলে এখনই সাপোর্টে জানান।",
  ),
  domain_contact_pending: {
    subject: "ডোমেইন {domain}: যোগাযোগ যাচাই বাকি",
    headline: "ডোমেইনের যোগাযোগ যাচাই বাকি",
    body: [
      "{domain} নিবন্ধনের জন্য আপনার ইমেইলে একটি যাচাই বার্তা পাঠানো হয়েছে।",
      "বার্তাটি নিশ্চিত না করলে ডোমেইনটি রেজিস্ট্রি স্থগিত করবে।",
    ],
  },
  domain_renewal_reminder: {
    subject: "ডোমেইন {domain}: {days} দিন পর মেয়াদ শেষ",
    headline: "ডোমেইন রিনিউয়ের অনুস্মারক",
    body: [
      "{domain} এর মেয়াদ {date} তারিখে শেষ হবে ({days} দিন বাকি)।",
      "অটো-রিনিউ চালু থাকলে মেয়াদ শেষের ৩০ দিন আগে ডোমেইনটি রিনিউ হয় এবং তখনই ওয়ালেট থেকে চার্জ কাটা হয়।",
      "রিনিউ না করলে ডোমেইনটি হারাতে পারেন।",
    ],
    sms: "TryAWS.now: {domain} এর মেয়াদ {days} দিন পর ({date}) শেষ। মেয়াদ শেষের ৩০ দিন আগে রিনিউ হয়।",
  },
  domain_renewal_refunded: {
    subject: "ডোমেইন {domain}: রিনিউ হয়নি, টাকা ফেরত",
    headline: "ডোমেইন রিনিউ হয়নি",
    body: [
      "আমরা রেজিস্ট্রিতে {domain} রিনিউ করতে পারিনি। আপনার পেমেন্ট আপনার ওয়ালেটে ফেরত দেওয়া হয়েছে।",
      "{expiry} এর আগে ডোমেইনের পাতা থেকে আবার রিনিউ করতে পারেন।",
    ],
  },
  // WPU-Z5: a customer reads the reply in the panel ({message} is empty); a visitor gets the text.
  support_reply: {
    subject: "আপনার সাপোর্ট অনুরোধের উত্তর",
    headline: "সাপোর্টের উত্তর",
    body: ["{lead}", "{message}", "{next}"],
    extra: {
      customer_lead:
        "আমাদের সাপোর্ট টিম আপনার সাপোর্ট অনুরোধের উত্তর দিয়েছে। উত্তরটি প্যানেলে আপনার জন্য অপেক্ষা করছে।",
      customer_next: "সাইন ইন করে অনুরোধটি খুলুন এবং উত্তরটি পড়ুন। সেখান থেকেই জবাব দিতে পারবেন।",
      visitor_lead: "আমাদের সাপোর্ট টিম আপনার সাপোর্ট অনুরোধের উত্তর দিয়েছে:",
      visitor_next:
        "এই ইমেইলের জবাব পড়া হয় না। উত্তর দিতে বা আরও কিছু জানাতে সাপোর্ট পেজ থেকে নতুন অনুরোধ পাঠান।",
    },
  },
  dns_delegation_notice: {
    subject: "ডিএনএস জোন {domain}: নেমসার্ভার এখনো বদলানো হয়নি",
    headline: "ডিএনএস জোন কাজ করছে না",
    body: [
      "{domain} এর ডিএনএস জোন তৈরি হয়েছে {days} দিন হলো, কিন্তু ডোমেইনের নেমসার্ভার এখনো এই জোনে পয়েন্ট করা নেই।",
      "ডোমেইনের রেজিস্ট্রারের প্যানেলে গিয়ে {domain} এর নেমসার্ভার বদলে ডিএনএস পেজে দেখানো নেমসার্ভারগুলো দিন।",
      "{date} তারিখের মধ্যে বদলানো না হলে জোনটি মুছে ফেলা হবে।",
    ],
  },
  // WPU-Y3 wording, approved by the owner on 2026-11-13 (including every sentence that says data is deleted).
  unpaid_warning: {
    subject: "{name}: একটি চার্জ পরিশোধ হয়নি",
    headline: "একটি চার্জ পরিশোধ হয়নি",
    body: [
      "আপনার ওয়ালেট থেকে {name} এর একটি ব্যবহারের চার্জ নেওয়া যায়নি।",
      "এখনই ওয়ালেটে টাকা যোগ করুন। চার্জ বাকি থাকলে ১ দিন পরে {name} স্থগিত হবে এবং ৭ দিন পরে মুছে ফেলা হবে।",
    ],
  },
  // WPU-Y3 wording, approved by the owner on 2026-11-13.
  unpaid_suspended: {
    subject: "{name} স্থগিত আছে: মুছে ফেলার আগে {days} দিন বাকি",
    headline: "বকেয়া চার্জের কারণে স্থগিত",
    body: [
      "একটি ব্যবহারের চার্জ বাকি থাকায় {name} স্থগিত আছে। আপনার ডেটা এখনো রাখা আছে।",
      "{date} তারিখে চার্জ বাকি থাকলে {name} মুছে ফেলা হবে। আর {days} দিন বাকি।",
      "ওয়ালেটে টাকা যোগ করলে চার্জ নিজে থেকে নেওয়া হবে এবং রিসোর্স আবার চালু হবে।",
    ],
  },
  // WPU-Y3 wording, approved by the owner on 2026-11-13.
  unpaid_deletion: {
    subject: "{name} মুছে ফেলার অনুরোধ হয়েছে",
    headline: "বকেয়া চার্জ: মুছে ফেলার ধাপ",
    body: [
      "একটি চার্জ ৭ দিন ধরে বাকি আছে, তাই {name} স্থগিত আছে।",
      "{note}",
      "মুছে ফেলার আগে ওয়ালেটে টাকা যোগ করলে এটি বন্ধ করা যাবে।",
    ],
    extra: {
      approval:
        "মুছে ফেলার অনুরোধ করা হয়েছে। আমাদের টিম যাচাই না করা পর্যন্ত কিছু মোছা হবে না। যে প্রোডাক্টে ব্যাকআপ আছে, মোছার আগে শেষ ব্যাকআপ নেওয়া হবে।",
      direct: "এটি মুছে ফেলা হবে। যে প্রোডাক্টে ব্যাকআপ আছে, মোছার আগে শেষ ব্যাকআপ নেওয়া হবে।",
    },
  },
  // WPU-Y10 wording, approved by the owner on 2026-11-13.
  unpaid_snapshot_released: {
    subject: "{name}: শেষ ব্যাকআপ এখন সাধারণ ব্যাকআপ",
    headline: "শেষ ব্যাকআপ এখন সাধারণ ব্যাকআপ",
    body: [
      "বকেয়া চার্জ পরিশোধ হওয়ায় {name} আবার চালু হচ্ছে। মুছে ফেলার আগে নেওয়া শেষ ব্যাকআপটি এখন একটি সাধারণ ব্যাকআপ হিসেবে রাখা আছে।",
      "আপনি মুছে না ফেলা পর্যন্ত এই ব্যাকআপের জন্য প্রতিদিন চার্জ কাটা হবে।",
      "দরকার না থাকলে রিসোর্সের পাতার ব্যাকআপ অংশ থেকে এটি মুছে ফেলতে পারেন।",
    ],
  },
  // WPU-Y3 wording, approved by the owner on 2026-11-13.
  wallet_low_before_charge: {
    subject: "{date} তারিখের চার্জের জন্য ওয়ালেটে টাকা কম",
    headline: "ওয়ালেটে টাকা কম",
    body: [
      "{name} এর {amount} চার্জ {date} তারিখে কাটা হবে, কিন্তু ওয়ালেটে আছে {balance}।",
      "চার্জ নেওয়ার জন্য ওই তারিখের আগে টাকা যোগ করুন।",
    ],
  },
  waitlist_capacity_available: {
    subject: "{product}: এখন জায়গা আছে",
    headline: "অপেক্ষার তালিকা: জায়গা খালি হয়েছে",
    body: [
      "আপনি {product} এর জন্য অপেক্ষায় ছিলেন। {region} লোকেশনে এখন জায়গা খালি হয়েছে।",
      "এই জায়গা আপনার জন্য আলাদা করে রাখা হয়নি। অন্য কেউ আগে অর্ডার করলে ভরে যেতে পারে, তাই দেরি না করে অর্ডার করুন।",
    ],
  },
};

const SECURITY_EN = (what: string, subject: string, sms: string): TemplateText => ({
  subject: `Security alert: ${subject}`,
  headline: subject,
  body: [
    `${what} on {time}{where}.`,
    "If this was not you, change your password now and tell our support.",
  ],
  sms,
  extra: { from_ip: " from IP {ip}" },
});

export const EN: Catalog = {
  welcome: {
    subject: "Welcome to TryAWS.now",
    headline: "Welcome",
    body: [
      "Your account is ready.",
      "Open the panel, verify your phone and finish KYC, then create your first server.",
    ],
  },
  kyc_received: {
    subject: "We received your KYC",
    headline: "KYC received",
    body: ["We received your KYC details. We will tell you when the check is done."],
  },
  kyc_approved: {
    subject: "Your KYC is approved",
    headline: "KYC approved",
    body: ["Your KYC check is complete. You can now buy resources."],
    sms: "TryAWS.now: your KYC is approved. You can now buy resources.",
  },
  kyc_rejected: {
    subject: "Your KYC could not be accepted",
    headline: "KYC not accepted",
    body: ["Reason: {reason}", "Correct the details and submit again."],
  },
  topup_receipt: {
    subject: "Top-up receipt",
    headline: "Top-up received",
    body: ["{amount} was added to your wallet on {date}.", "Current balance: {balance}."],
  },
  order_paid: {
    subject: "Invoice {invoice}",
    headline: "Payment complete",
    body: [
      "{total} was paid from your wallet for your {product} order.",
      "Invoice number: {invoice}. Current balance: {balance}.",
    ],
  },
  order_failed_refunded: {
    subject: "Order failed, refund issued",
    headline: "Order failed, refunded",
    body: [
      "Your {product} order could not be completed: {failure}",
      "{refund} was returned to your wallet. Current balance: {balance}.",
    ],
    extra: {
      create_failed: "the resource could not be created.",
      capacity_full: "there is no capacity in this location right now.",
    },
  },
  wallet_credited_plan_change: {
    subject: "{credit} credited to your wallet",
    headline: "Wallet credited",
    body: [
      "We credited {credit} to your wallet because the plan change could not be completed.",
      "Current balance: {balance}.",
    ],
  },
  resource_ready: {
    subject: "Your {product} is ready",
    headline: "Resource ready",
    body: ["{name} ({product}) is ready.", "Location: {region}", "Address: {address}"],
    sms: "TryAWS.now: your {product} is ready. Address: {address}",
  },
  renewal_reminder: {
    subject: "Renews in {days} days",
    headline: "Renewal reminder",
    body: [
      "{name} ends on {date} ({days} days left).",
      "Renewal amount: {amount}. Wallet balance: {balance}.",
      "{note}",
    ],
    sms: "TryAWS.now: {name} ends tomorrow ({date}). Renewal {amount}, balance {balance}.",
    extra: {
      auto_on: "Automatic renewal is on. Keep enough money in your wallet.",
      auto_off: "Automatic renewal is off. Renew yourself before it ends.",
    },
  },
  renewed: {
    subject: "Renewed, invoice {invoice}",
    headline: "Renewal complete",
    body: [
      "{total} was taken from your wallet to renew your resource. New end date: {date}.",
      "Invoice number: {invoice}. Current balance: {balance}.",
    ],
  },
  grace_started: {
    subject: "Renewal due: resource suspended",
    headline: "Renewal due, resource suspended",
    body: [
      "{name} was not renewed, so it is suspended.",
      "Renew by {until} and everything runs as before. After that the resource is deleted.",
      "Renewal amount: {amount}. Wallet balance: {balance}.",
    ],
    sms: "TryAWS.now: {name} is suspended. Renew ({amount}) by {until} or it is deleted.",
  },
  resource_destroyed: {
    subject: "Resource deleted, {kept} kept",
    headline: "Resource deleted",
    body: [
      "{name} was deleted. Your {kept} is kept until {until}.",
      "You can restore it until then.",
    ],
    sms: "TryAWS.now: {name} was deleted. You can restore the {kept} until {until}.",
    extra: { backup: "backup", settings: "settings" },
  },
  backups_purged: {
    subject: "Backups deleted",
    headline: "Backups deleted",
    body: ["The {kept} kept for {name} was deleted on {date}. It cannot be restored."],
    extra: { backup: "backup", settings: "settings" },
  },
  low_balance: {
    subject: "Low wallet balance",
    headline: "Low balance",
    body: [
      "Renewals in the next {windowDays} days need {due}, but your wallet holds {balance}.",
      "Top up to keep your resources running.",
    ],
  },
  payment_expired: {
    subject: "Payment expired",
    headline: "Payment expired",
    body: [
      "The payment of {amount} was not completed and has expired. You were not charged.",
      "Try again.",
    ],
  },
  security_new_sign_in: SECURITY_EN(
    "A new sign-in to your account was seen",
    "new sign-in",
    "TryAWS.now: a new sign-in to your account. If it was not you, change your password now.",
  ),
  security_password_changed: SECURITY_EN(
    "Your password was changed",
    "password changed",
    "TryAWS.now: your password was changed. If it was not you, tell support now.",
  ),
  security_totp_changed: SECURITY_EN(
    "Your TOTP setting was changed",
    "TOTP changed",
    "TryAWS.now: your TOTP setting was changed. If it was not you, tell support now.",
  ),
  security_email_changed: SECURITY_EN(
    "Your email address was changed",
    "email changed",
    "TryAWS.now: your email address was changed. If it was not you, tell support now.",
  ),
  security_totp_blocked: {
    subject: "Security alert: wrong authenticator codes",
    headline: "Wrong authenticator codes",
    body: [
      "On {time}, someone signed in with your correct password{where} but gave the authenticator code wrong several times. Sign-in is paused for a while for your safety.",
      "If this was not you, someone else may know your password. Change it now and tell our support.",
    ],
    extra: { from_ip: " from IP {ip}" },
  },
  security_phone_changed: SECURITY_EN(
    "Your phone number was changed",
    "phone changed",
    "TryAWS.now: your phone number was changed. If it was not you, tell support now.",
  ),
  domain_contact_pending: {
    subject: "Domain {domain}: contact verification pending",
    headline: "Domain contact verification pending",
    body: [
      "A verification message was sent to your email for the registration of {domain}.",
      "If you do not confirm it, the registry suspends the domain.",
    ],
  },
  domain_renewal_reminder: {
    subject: "Domain {domain}: ends in {days} days",
    headline: "Domain renewal reminder",
    body: [
      "{domain} ends on {date} ({days} days left).",
      "With auto-renew on, a domain is renewed 30 days before its expiry date, and the wallet is charged then.",
      "If you do not renew, you can lose the domain.",
    ],
    sms: "TryAWS.now: {domain} ends in {days} days ({date}). Domains renew 30 days before expiry.",
  },
  domain_renewal_refunded: {
    subject: "Domain {domain}: not renewed, payment refunded",
    headline: "Domain not renewed",
    body: [
      "We could not renew {domain} at the registry. Your payment has been refunded to your wallet.",
      "You can renew it again from the domain page before {expiry}.",
    ],
  },
  // WPU-Z5: a customer reads the reply in the panel ({message} is empty); a visitor gets the text.
  support_reply: {
    subject: "Reply to your support request",
    headline: "Reply from support",
    body: ["{lead}", "{message}", "{next}"],
    extra: {
      customer_lead:
        "Our support team has answered your support request. The reply is waiting for you in the panel.",
      customer_next: "Sign in and open the request to read the reply. You can answer there too.",
      visitor_lead: "Our support team has answered your support request:",
      visitor_next:
        "Replies to this email are not read. To answer or to ask more, send a new request from the support page.",
    },
  },
  dns_delegation_notice: {
    subject: "DNS zone {domain}: name servers not changed yet",
    headline: "Your DNS zone is not in use",
    body: [
      "The DNS zone for {domain} was created {days} days ago, but the name servers of the domain still do not point to it.",
      "At the registrar of the domain, change the name servers of {domain} to the name servers shown on the DNS page.",
      "If this is not done by {date}, the zone will be removed.",
    ],
  },
  // WPU-Y3 wording, approved by the owner on 2026-11-13 (including every sentence that says data is deleted).
  unpaid_warning: {
    subject: "{name}: a charge is unpaid",
    headline: "A charge is unpaid",
    body: [
      "We could not take a usage charge for {name} from your wallet.",
      "Top up your wallet now. If the charge stays unpaid, {name} is suspended after 1 day and deleted after 7 days.",
    ],
  },
  // WPU-Y3 wording, approved by the owner on 2026-11-13.
  unpaid_suspended: {
    subject: "{name} is suspended: {days} days until deletion",
    headline: "Suspended for an unpaid charge",
    body: [
      "{name} is suspended because a usage charge is unpaid. Your data is still kept.",
      "If the charge is still unpaid on {date}, {name} will be deleted. That is {days} days from now.",
      "Top up your wallet and the charge is taken automatically and the resource starts again.",
    ],
  },
  // WPU-Y3 wording, approved by the owner on 2026-11-13.
  unpaid_deletion: {
    subject: "Deletion of {name} has been requested",
    headline: "Unpaid charge: deletion step",
    body: [
      "A charge has been unpaid for 7 days, so {name} is suspended.",
      "{note}",
      "You can still stop this by topping up your wallet before it is deleted.",
    ],
    extra: {
      approval:
        "Deletion has been requested. Our team checks it first, and nothing is deleted before that. Where the product has backups, a final backup is made before anything is deleted.",
      direct:
        "It will be deleted. Where the product has backups, a final backup is made before anything is deleted.",
    },
  },
  // WPU-Y10 wording, approved by the owner on 2026-11-13.
  unpaid_snapshot_released: {
    subject: "{name}: the final backup is now an ordinary backup",
    headline: "The final backup is now an ordinary backup",
    body: [
      "Your unpaid charge is paid, so {name} starts again. The final backup made before a deletion is now kept as an ordinary backup.",
      "A daily charge is taken for this backup until you delete it.",
      "If you do not need it, delete it from the backups section of the resource page.",
    ],
  },
  // WPU-Y3 wording, approved by the owner on 2026-11-13.
  wallet_low_before_charge: {
    subject: "Your wallet is low for the charge on {date}",
    headline: "Low wallet balance",
    body: [
      "The charge of {amount} for {name} is due on {date}, but your wallet holds {balance}.",
      "Top up before that date so the charge can be taken.",
    ],
  },
  waitlist_capacity_available: {
    subject: "{product}: space is available now",
    headline: "Waitlist: space is available",
    body: [
      "You were waiting for a {product}. There is space in {region} now.",
      "This space is not held for you. It can fill up if someone else orders first, so order soon.",
    ],
  },
};
