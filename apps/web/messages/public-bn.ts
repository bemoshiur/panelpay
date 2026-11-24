import { legalDocsBn } from "./legal-bn.ts";

// Namespace `Public` of the public site (WPP-T1 to WPP-T4). Bengali is written first (rule U5);
// `public-en.ts` is typed from this tree, so a missing key fails `tsc`. The AWS statements themselves
// live in the shell messages (`Aws`, 16.13) and are not repeated here. The legal documents are in
// `legal-bn.ts` (WPU-Z7), approved by the owner on 2026-11-14 (WPU-Y6).
export const publicBn = {
  Public: {
    crumb: { home: "হোম" },
    // WPU-Z16 (AEO and GEO): one statement of what PanelPay is, for whom, where and how it is billed.
    // The home page shows it as its answer block (40 to 60 words), and the same text is the
    // description of the Organization JSON-LD, of llms.txt and of facts.json.
    entity: {
      statement:
        "PanelPay বাংলাদেশের মানুষ ও প্রতিষ্ঠানের জন্য একটি প্রিপেইড ক্লাউড প্যানেল। এখানে Amazon Lightsail দিয়ে তৈরি ক্লাউড সার্ভার কেনা যায়, যা Singapore বা Mumbai AWS Region থেকে চলে। মূল্য টাকায় (BDT) এবং তাতে VAT ও ফি অন্তর্ভুক্ত; পরিশোধ হয় টাকার ওয়ালেট থেকে, যা EPS দিয়ে টপ আপ করা যায়। বিক্রি, বিল ও সাপোর্ট PanelPay দেয়।",
    },
    // WPU-Z16: the dated line at the foot of every public page (the same date is in facts.json).
    updated: { label: "সর্বশেষ হালনাগাদ: <time>{date}</time>" },
    // WPU-X21: the alt text of the official "Pay with EPS" badge (footer, home page, top-up page).
    epsBadge: {
      alt: "EPS দিয়ে পেমেন্ট করুন: ভিসা, মাস্টারকার্ড, আমেরিকান এক্সপ্রেস, ডিবিবিএল নেক্সাস, ইউনিয়নপে এবং বাংলাদেশের মোবাইল ওয়ালেট ও ব্যাংক। EPS দ্বারা যাচাইকৃত।",
    },
    meta: {
      home: {
        title: "PanelPay: ক্লাউড সার্ভার, Amazon Lightsail দিয়ে তৈরি",
        description:
          "বাংলাদেশের জন্য প্রিপেইড ক্লাউড প্যানেল। ক্লাউড সার্ভার, Amazon Lightsail দিয়ে তৈরি। মূল্য টাকায়, টাকার ওয়ালেট থেকে পরিশোধ, EPS দিয়ে টপ আপ।",
      },
      pricing: {
        title: "মূল্য তালিকা: ক্লাউড সার্ভার, Amazon Lightsail দিয়ে তৈরি",
        description:
          "ক্লাউড সার্ভারের সব প্ল্যানের মূল্য টাকায় (BDT), ৩০ দিনের জন্য। মূল্যে VAT ও ফি অন্তর্ভুক্ত। Amazon Lightsail দিয়ে তৈরি।",
      },
      cloudServers: {
        title: "ক্লাউড সার্ভার, Amazon Lightsail দিয়ে তৈরি",
        description:
          "Singapore বা Mumbai AWS Region-এ চলা ক্লাউড সার্ভার। প্ল্যান, স্পেসিফিকেশন ও মূল্য টাকায়। Amazon Lightsail দিয়ে তৈরি।",
      },
      help: {
        title: "সাহায্য ও সাধারণ প্রশ্ন",
        description:
          "PanelPay ও Amazon Lightsail নিয়ে সাধারণ প্রশ্নের উত্তর: AWS, বিল, সাপোর্ট, ডেটা কোথায় থাকে।",
      },
      support: {
        title: "সাপোর্ট ও যোগাযোগ",
        description:
          "PanelPay-এর সাপোর্ট পাওয়ার উপায়: প্যানেলে সাপোর্ট অনুরোধ, আর অ্যাকাউন্ট না থাকলে সাপোর্ট পাতার ফর্ম।",
      },
      legal: {
        title: "আইনি নথি",
        description: "PanelPay-এর শর্তাবলি, গোপনীয়তা, গ্রহণযোগ্য ব্যবহার ও ফেরতের নীতি।",
        // WPU-Z16: one description per document, so no two legal pages share one (OmniRank).
        descriptionOf: "{title}: বাংলাদেশের প্রিপেইড ক্লাউড প্যানেল PanelPay-এর নথি।",
      },
      soon: {
        description: "এই পণ্য এখনো খোলা হয়নি। খোলা হলে ইমেইলে জানাতে আপনার ঠিকানা দিন।",
      },
      maintenance: { title: "রক্ষণাবেক্ষণ চলছে" },
    },
    common: {
      orderNow: "অর্ডার করুন",
      seePricing: "মূল্য দেখুন",
      seePlans: "প্ল্যান দেখুন",
      login: "প্যানেলে যান",
      // WPU-X16 (owner decision of 2026-11-15): prices in taka (BDT) only, taka wallet, Amazon Lightsail.
      priceNote:
        "মূল্য টাকায় (BDT), ৩০ দিনের জন্য, VAT ও ফি অন্তর্ভুক্ত। পরিশোধ হয় আপনার টাকার ওয়ালেট থেকে, আর পরিমাণটি নিশ্চিত করার আগেই দেখানো হয়। ১০০% AWS অবকাঠামো। Amazon Lightsail দিয়ে তৈরি।",
      unavailableTitle: "মূল্য এখন দেখানো যাচ্ছে না",
      unavailableText: "মূল্য তালিকা এই মুহূর্তে পড়া যাচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।",
      noPlansTitle: "এখনো কোনো প্ল্যান খোলা নেই",
      noPlansText: "ক্লাউড সার্ভার খোলা হলে এখানে প্ল্যান দেখা যাবে।",
      locationHeading: "লোকেশন",
      comingSoon: "শিগগির আসছে",
    },
    location: {
      "ap-southeast-1": "Singapore",
      "ap-south-1": "Mumbai",
    },
    product: {
      linux_instance: "ক্লাউড সার্ভার",
      windows_instance: "ক্লাউড সার্ভার (Windows)",
      database: "ম্যানেজড ডেটাবেস",
    },
    spec: {
      cpu: "vCPU",
      ram: "মেমরি",
      disk: "ডিস্ক",
      transfer: "ডেটা ট্রান্সফার",
      cpuValue: "{count} vCPU",
      gb: "{count} GB",
      planOf: "{product} {ram} GB",
      nameAt: "{name} · {location}",
      none: "–",
      perLocation: "{location}: {value}",
    },
    home: {
      heroTitle: "বাংলাদেশের জন্য ক্লাউড সার্ভার। টাকায় কিনুন, AWS account লাগবে না।",
      heroLogin: "লগইন",
      heroSignup: "অ্যাকাউন্ট খুলুন",
      servicesTitle: "সেবা",
      servicesLabel: "সেবার তালিকা",
      productOpen: "খোলা আছে",
      services: {
        instances: "ইনস্ট্যান্স (ক্লাউড সার্ভার)",
        containers: "কন্টেইনার",
        databases: "ডেটাবেস",
        networking: "নেটওয়ার্কিং",
        storage: "স্টোরেজ",
        domains: "ডোমেইন ও ডিএনএস",
        snapshots: "স্ন্যাপশট",
      },
      chooserTitle: "ইনস্ট্যান্স বেছে নিন",
      chooserLead: "লগইনের পরে প্যানেলে ঠিক এই ধাপগুলোই দেখবেন।",
      locationTitle: "ইনস্ট্যান্সের লোকেশন বেছে নিন",
      locationRegion: "এই লোকেশনের AWS Region: {name}",
      regionNames: {
        "ap-southeast-1": "Asia Pacific (Singapore)",
        "ap-south-1": "Asia Pacific (Mumbai)",
      },
      platformTitle: "প্ল্যাটফর্ম বেছে নিন",
      platforms: {
        apps: "Linux অ্যাপ",
        os: "Linux অপারেটিং সিস্টেম",
        linux: "Linux",
        windows: "মাইক্রোসফট উইন্ডোজ (Windows)",
      },
      imageTitle: "ইমেজ বেছে নিন",
      imageKindApp: "অ্যাপ ইমেজ",
      imageKindOs: "অপারেটিং সিস্টেম ইমেজ",
      imageSelect: "বেছে নিন",
      imageSelected: "বেছে নেওয়া",
      imageNote: "ইনস্ট্যান্স তৈরির সময় লগইনের পরে প্যানেলে ইমেজ আবার বেছে নেবেন।",
      typeTitle: "প্ল্যানের ধরন বেছে নিন",
      types: {
        general_purpose: "জেনারেল পারপাস",
        memory_optimized: "মেমোরি-অপটিমাইজড",
        compute_optimized: "কম্পিউট-অপটিমাইজড",
      },
      typeDescriptions: {
        general_purpose: "বেশিরভাগ কাজের জন্য সিপিইউ ও মেমোরির ভারসাম্য।",
        memory_optimized: "প্রতি vCPU-তে বেশি মেমোরি, ইন-মেমোরি কাজ ও ডেটাবেসের জন্য।",
        compute_optimized: "প্রতি GB-তে বেশি vCPU ক্ষমতা, ব্যাচ ও সিপিইউ-নির্ভর কাজের জন্য।",
      },
      planTitle: "ইনস্ট্যান্সের প্ল্যান বেছে নিন",
      createInstance: "ইনস্ট্যান্স তৈরি করুন",
      cardTitle: "{ram} GB · {cpu} vCPU",
      cardLine: "{disk} GB SSD · {transfer} GB ট্রান্সফার",
      perPeriod: "/ ৩০ দিন",
      plansAll: "সব প্ল্যান ও মূল্য দেখুন",
      createNote:
        "ইনস্ট্যান্স তৈরি ও পরিচালনা হয় প্যানেলে, লগইনের পরে। এই পাতায় কিছু তৈরি হয় না।",
    },
    pricing: {
      vatNote: "VAT ও ফি প্রতিটি মূল্যে অন্তর্ভুক্ত।",
      regionNavLabel: "লোকেশন অনুযায়ী ছাঁকুন",
      regionAll: "সব লোকেশন",
      regionCurrent: "(বেছে নেওয়া)",
      heading: "মূল্য তালিকা",
      lead: "ক্লাউড সার্ভার, Amazon Lightsail দিয়ে তৈরি। প্রতিটি মূল্য ৩০ দিনের জন্য, টাকায় (BDT)।",
      answer:
        "PanelPay-এর প্রতিটি ক্লাউড সার্ভারের মূল্য টাকায় (BDT), ৩০ দিনের জন্য, এবং তাতে VAT ও ফি অন্তর্ভুক্ত। চেকআউটে নিশ্চিত করার আগেই ঠিক কত টাকা লাগবে তা দেখতে পাবেন, আর ঠিক সেই পরিমাণই আপনার টাকার ওয়ালেট থেকে কাটা হয়, যা EPS দিয়ে টপ আপ করা যায়।",
      tabsLabel: "পণ্যের ধরন",
      tabCloudServers: "ক্লাউড সার্ভার",
      tableTitle: "প্ল্যানের তুলনা",
      colPlan: "প্ল্যান",
      colMemory: "মেমরি",
      colDisk: "ডিস্ক",
      colTransfer: "ডেটা ট্রান্সফার",
      colMonthly: "৩০ দিন",
      colOrder: "অর্ডার",
      tableCaption: "ক্লাউড সার্ভারের প্ল্যান ও লোকেশন অনুযায়ী মূল্য",
      otherFamilies: "অন্যান্য পণ্য",
      otherFamiliesText: "এই পণ্যগুলো ধাপে ধাপে খোলা হচ্ছে। খোলা হলে মূল্য এখানে দেখা যাবে।",
    },
    cloudServers: {
      heading: "ক্লাউড সার্ভার, Amazon Lightsail দিয়ে তৈরি",
      lead: "প্রতিটি ক্লাউড সার্ভার একটি Amazon Lightsail instance, যা Singapore বা Mumbai AWS Region-এ চলে।",
      answer:
        "PanelPay-এর একটি ক্লাউড সার্ভার হলো একটি Amazon Lightsail instance, যা Singapore বা Mumbai AWS Region-এ চলে। আপনি প্ল্যান ও লোকেশন বেছে নেন, ৩০ দিনের মূল্য টাকায় VAT ও ফি সহ দেখেন, টাকার ওয়ালেট থেকে পরিশোধ করেন, আর PanelPay প্যানেল থেকে সার্ভার চালান।",
      plansTitle: "প্ল্যান",
      featuresTitle: "যা পাবেন",
      features: {
        panel: {
          title: "সহজ প্যানেল",
          text: "সার্ভার তৈরি, রিবুট, ফায়ারওয়াল ও SSH কী এক জায়গা থেকে।",
        },
        backup: { title: "ব্যাকআপ", text: "ব্যাকআপ নিন ও পুনরুদ্ধার করুন, প্যানেল থেকেই।" },
        bdt: { title: "টাকায় প্রিপেইড", text: "ওয়ালেটে টপ আপ করে সার্ভার কিনুন।" },
        locations: {
          title: "দুটি লোকেশন",
          text: "Singapore বা Mumbai, যেটি আপনার ব্যবহারকারীর কাছে।",
        },
      },
      pickerTitle: "আপনার প্ল্যান বেছে নিন",
      pickerLegend: "প্ল্যান",
      specsTitle: "স্পেসিফিকেশন",
      colLocation: "লোকেশন",
      faqTitle: "এই পণ্য নিয়ে প্রশ্ন",
    },
    soon: {
      title: "{name} শিগগির আসছে",
      text: "এই পণ্য এখনো খোলা হয়নি। খোলা হলে আপনাকে ইমেইলে জানানো হবে।",
      formLabel: "{name} খোলা হলে জানান",
      email: "ইমেইল",
      emailPlaceholder: "name@example.com",
      submit: "আমাকে জানান",
      sending: "পাঠানো হচ্ছে",
      doneTitle: "ধন্যবাদ",
      done: "পণ্য খোলা হলে আমরা আপনাকে ইমেইলে জানাব।",
      back: "মূল্য তালিকায় ফিরুন",
      error: {
        invalid: "সঠিক ইমেইল ঠিকানা দিন।",
        rate_limited: "অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।",
        unavailable: "এখন সংরক্ষণ করা যাচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।",
      },
    },
    family: {
      databases: "ম্যানেজড ডেটাবেস",
      objectStorage: "অবজেক্ট স্টোরেজ",
      loadBalancers: "লোড ব্যালান্সার",
      containers: "কন্টেইনার সার্ভিস",
      cdn: "সিডিএন",
      dns: "ডিএনএস",
      domains: "ডোমেইন",
    },
    familyOpen: {
      text: "এই পণ্য খোলা হয়েছে। প্ল্যান ও মূল্য দেখতে ও কিনতে প্যানেলে যান।",
    },
    help: {
      heading: "সাধারণ প্রশ্ন",
      lead: "PanelPay ও Amazon Lightsail নিয়ে সবচেয়ে বেশি জিজ্ঞাসিত প্রশ্ন।",
      answer:
        "PanelPay Amazon Lightsail দিয়ে তৈরি ক্লাউড সার্ভার বিক্রি করে, যা Singapore বা Mumbai AWS Region-এ চলে। EPS দিয়ে টাকায় ওয়ালেট টপ আপ করে সেখান থেকে কেনা যায়; মূল্য টাকায় (BDT), VAT ও ফি সহ, আর চেকআউটে ওয়ালেট থেকে কাটা হয়। কেনার জন্য ইমেইল ও মোবাইল নম্বর যাচাই করে একটি অথেনটিকেটর অ্যাপ চালু করতে হয়।",
      listTitle: "প্রশ্নোত্তর",
      stillTitle: "উত্তর পাননি?",
      stillText: "সাপোর্ট পাতায় আমাদের জানান।",
      items: {
        realAws: {
          q: "এটি কি সত্যিই AWS?",
          a: "হ্যাঁ, ১০০%। এখানে কেনা প্রতিটি সার্ভার, ডেটাবেস, ডিস্ক ও বাকেট একটি Amazon Lightsail resource, যা আপনার বেছে নেওয়া AWS Region-এ চলে।",
        },
        noAccount: {
          q: "আমি কি AWS account বা AWS console পাব?",
          a: "না। আপনি PanelPay প্যানেল থেকেই সবকিছু চালান। আলাদা AWS account বা AWS console লাগে না।",
        },
        billing: {
          q: "বিল ও সাপোর্ট কে দেয়?",
          a: "PanelPay। আমরা বিক্রি করি ও বিল করি, আর প্যানেলের সাপোর্ট অনুরোধের মাধ্যমে সাপোর্ট দিই। সাপোর্টের কোনো ফোন লাইন নেই।",
        },
        dataLocation: {
          q: "আমার ডেটা কোথায় থাকে?",
          a: "সার্ভার, ডেটাবেস, ডিস্ক ও বাকেট আপনার বেছে নেওয়া AWS Region-এ থাকে। CDN-এর কপি বিশ্বজুড়ে AWS-এর edge লোকেশনে থাকে। DNS বৈশ্বিক সেবা। আপনার অ্যাকাউন্ট, এবং আগে জমা দেওয়া পরিচয়পত্রের নথি থাকলে সেগুলো, AWS Singapore-এ রাখা হয়।",
        },
        payment: {
          q: "কীভাবে টাকা দেব?",
          a: "প্রথমে EPS দিয়ে ওয়ালেটে টপ আপ করুন। তারপর ওয়ালেট থেকে সার্ভার কিনুন। ওয়ালেট ও সব পেমেন্ট টাকায়; অর্ডারের টাকার পরিমাণ চেকআউটে দেখানো হয়।",
        },
        priceIncludes: {
          q: "মূল্যে কী কী অন্তর্ভুক্ত?",
          a: "প্রদর্শিত মূল্য টাকায় (BDT), ৩০ দিনের জন্য এবং তাতে VAT ও ফি অন্তর্ভুক্ত। চেকআউটে পরিমাণ নিশ্চিত করার আগেই দেখানো হয়, এবং ঠিক সেই পরিমাণই কাটা হয়।",
        },
        locations: {
          q: "কোন কোন লোকেশন আছে?",
          a: "শুরুতে দুটি AWS Region: Singapore ও Mumbai। প্ল্যানের ডেটা ট্রান্সফার লোকেশন অনুযায়ী আলাদা হতে পারে, তাই মূল্য তালিকায় প্রতিটি লোকেশনের মান আলাদা দেখানো হয়।",
        },
        identity: {
          q: "কেনার আগে কী কী করতে হয়?",
          a: "তিনটি ধাপ: ইমেইল যাচাই, মোবাইল নম্বর যাচাই, আর একটি অথেনটিকেটর অ্যাপ চালু করা। কোনো কাগজপত্র লাগে না, কারণ সব কেনাকাটা প্রিপেইড ওয়ালেট থেকে হয়।",
        },
        products: {
          q: "ডেটাবেস, স্টোরেজ ও অন্য পণ্য কবে?",
          a: "পণ্যগুলো ধাপে ধাপে খোলা হচ্ছে। যেটি এখনো খোলেনি, তার পাতায় আপনার ইমেইল দিলে খোলা হলে জানানো হবে।",
        },
        port25: {
          q: "ইমেইল পাঠানোর জন্য পোর্ট ২৫ খোলা থাকে?",
          a: "না। বাইরে যাওয়া পোর্ট ২৫ বন্ধ থাকে। ইমেইল পাঠাতে একটি ইমেইল সেবার API বা অন্য পোর্ট ব্যবহার করুন।",
        },
        support: {
          q: "সাহায্য কোথায় পাব?",
          a: "প্যানেলে সাপোর্ট অনুরোধ খুলুন এবং সেখানেই আমাদের উত্তর দেখুন। অ্যাকাউন্ট না থাকলে সাপোর্ট পাতার ফর্ম ব্যবহার করুন, আমরা ইমেইলে উত্তর দেব। সাপোর্টের কোনো ফোন লাইন বা ইমেইল ঠিকানা নেই।",
        },
        bdt: {
          q: "মূল্য কি টাকায়?",
          a: "মূল্য বাংলাদেশি টাকায় (BDT) দেখানো হয়, ওয়ালেট, টপ আপ ও ইনভয়েসও টাকায়। চেকআউটে যে পরিমাণ দেখেন, ঠিক সেই পরিমাণই ওয়ালেট থেকে কাটা হয়।",
        },
        // WPU-Z16: what people ask AI assistants about this offer; facts of the terms and refund drafts.
        vatInvoice: {
          q: "আমি কি VAT সহ কর চালানপত্র পাব?",
          a: "হ্যাঁ। প্রতিটি কেনা ও নবায়নের জন্য PanelPay আপনাকে টাকায় কর চালানপত্র (মূসক-৬.৩) দেয়। প্রতিটি মূল্যে VAT এবং প্রযোজ্য অন্যান্য কর ও ফি অন্তর্ভুক্ত, আর ইনভয়েসে VAT ও ফি দেখানো হয়। VAT-নিবন্ধিত প্রতিষ্ঠান তার BIN ইনভয়েসে দিতে পারে।",
        },
        refunds: {
          q: "টাকা ফেরত পাওয়া যায় কি?",
          a: "পেমেন্টের পর কোনো resource তৈরি না হলে পুরো টাকা নিজে থেকেই ওয়ালেটে ফেরত যায়। আমরা কোনো কেনা বা নবায়ন বাতিল করলে পুরো টাকা ওয়ালেটে ফেরত যায় এবং আপনি টাকায় ক্রেডিট নোট পান। অন্য কিছুর জন্য বিল বিষয়ে সাপোর্ট অনুরোধ খুলুন; বিস্তারিত ফেরতের নীতিতে আছে।",
        },
      },
    },
    support: {
      heading: "সাপোর্ট ও যোগাযোগ",
      // WPU-Z16: also the answer block of the page (40 to 60 words).
      lead: "PanelPay সাপোর্ট দেয় শুধু সাপোর্ট অনুরোধের মাধ্যমে, এবং প্রতিটি অনুরোধের লিখিত উত্তর দেয় আমাদের সাপোর্ট দল। অ্যাকাউন্ট থাকলে প্যানেলে অনুরোধ খুলুন এবং সেখানেই উত্তর দেখুন। অ্যাকাউন্ট না থাকলে সাপোর্ট পাতার ফর্ম ব্যবহার করুন, আমরা ইমেইলে উত্তর দেব। সাপোর্টের কোনো ফোন লাইন বা ইমেইল ঠিকানা নেই।",
      customerTitle: "আপনার অ্যাকাউন্ট থাকলে",
      customerText:
        "প্যানেলে সাপোর্ট অনুরোধ খুলুন এবং সেখানেই সেটি অনুসরণ করুন: আমাদের উত্তর পড়ুন এবং একই জায়গায় জবাব দিন। সাইন ইন করা না থাকলে আগে সাইন ইন করতে হবে।",
      newCta: "সাপোর্ট অনুরোধ খুলুন",
      requestsCta: "আমার সাপোর্ট অনুরোধ",
      visitorTitle: "অ্যাকাউন্ট না থাকলে",
      visitorText: "নিচের ফর্মে আমাদের লিখুন। আপনার দেওয়া ইমেইল ঠিকানায় আমরা উত্তর পাঠাব।",
      faqTitle: "আগে সাধারণ প্রশ্ন দেখুন",
      faqText: "বেশিরভাগ প্রশ্নের উত্তর সেখানে আছে।",
      faqCta: "সাধারণ প্রশ্ন",
      form: {
        title: "আমাদের লিখুন",
        lead: "অ্যাকাউন্ট লাগে না। আমরা ইমেইলে উত্তর দিই। এখানে পাসওয়ার্ড, কার্ডের নম্বর বা পরিচয়পত্রের নম্বর লিখবেন না।",
        email: "আপনার ইমেইল",
        emailPlaceholder: "name@example.com",
        name: "আপনার নাম (ঐচ্ছিক)",
        category: "বিষয়",
        subject: "শিরোনাম",
        message: "আপনার বার্তা",
        honeypot: "এই ঘরটি খালি রাখুন",
        submit: "পাঠান",
        doneTitle: "ধন্যবাদ",
        done: "আপনার বার্তা পেয়েছি, ইমেইলে উত্তর দেব।",
        categories: {
          billing: "বিল ও পেমেন্ট",
          technical: "কারিগরি সাহায্য",
          kyc: "পরিচয় যাচাই",
          domain: "ডোমেইন",
          abuse: "অপব্যবহারের অভিযোগ",
          other: "অন্য কিছু",
        },
        error: {
          invalid: "চিহ্নিত ঘরগুলো দেখে আবার চেষ্টা করুন।",
          rate_limited: "অনেকবার চেষ্টা হয়েছে। একটু পরে আবার চেষ্টা করুন।",
          unavailable: "এখন সংরক্ষণ করা যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।",
        },
        fieldInvalid: "এই ঘরটি দেখুন।",
        reference: "আবার লিখলে এই কোডটি জানাবেন: {ref}",
      },
    },
    legal: {
      heading: "আইনি নথি",
      sidebarTitle: "নথি",
      sidebarLabel: "আইনি নথির তালিকা",
      // WPU-Y6: the texts are approved by the owner (2026-11-14); no draft notice. The version line and
      // LEGAL_VERSIONS (server/auth/legal.ts) move together.
      version: "সংস্করণ ৫, ১৫ নভেম্বর ২০২৬",
      docs: legalDocsBn,
    },
    system: {
      maintenanceTitle: "রক্ষণাবেক্ষণ চলছে",
      maintenanceText: "আমরা সেবা উন্নত করছি। শিগগির ফিরে আসব।",
      errorTitle: "কিছু একটা ভুল হয়েছে",
      errorText: "পাতাটি দেখানো যায়নি। আবার চেষ্টা করুন।",
      retry: "আবার চেষ্টা করুন",
      home: "হোমে যান",
      contactUs: "যোগাযোগ করুন",
    },
  },
};
