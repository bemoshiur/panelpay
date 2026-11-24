// Namespace `SupportForm` of the customer app (WP9-T4b): the signed-in support form of 16.10
// (/support when signed in). Bengali is written first (rule U5); `support-en.ts` is typed from this
// tree, so a missing key fails `tsc`. No AWS name, account id or raw error appears in a text (U6).
export const supportBn = {
  SupportForm: {
    meta: { title: "সাপোর্টে অনুরোধ" },
    heading: "সাপোর্টে অনুরোধ",
    intro:
      "সমস্যা বা প্রশ্ন লিখে পাঠান। PanelPay-এর সাপোর্ট দলের উত্তর আপনার সাপোর্ট অনুরোধে দেখা যাবে।",
    form: {
      title: "নতুন অনুরোধ",
      category: {
        legend: "বিষয়ের ধরন",
        billing: "বিল ও ওয়ালেট",
        technical: "কারিগরি সমস্যা",
        kyc: "পরিচয় যাচাই",
        domain: "ডোমেইন ও DNS",
        abuse: "অপব্যবহারের অভিযোগ",
        other: "অন্য কিছু",
      },
      related: {
        label: "যে সেবা নিয়ে (ঐচ্ছিক)",
        none: "নির্দিষ্ট কিছু নয়",
        hint: "যে সার্ভার বা সেবা নিয়ে লিখছেন সেটি বেছে নিন।",
      },
      subject: { label: "বিষয়", hint: "এক লাইনে, সর্বোচ্চ ১২০ অক্ষর।" },
      message: { label: "বার্তা", hint: "যা ঘটেছে তা লিখুন। পাসওয়ার্ড বা গোপন কোড লিখবেন না।" },
      submit: "অনুরোধ পাঠান",
      working: "পাঠানো হচ্ছে…",
    },
    done: {
      title: "অনুরোধ পাঠানো হয়েছে",
      body: "আমরা আপনার অনুরোধ পেয়েছি। উত্তর আপনার সাপোর্ট অনুরোধে দেখা যাবে।",
      reference: "অনুরোধের রেফারেন্স",
      again: "আরেকটি অনুরোধ লিখুন",
      replayed: "এই অনুরোধ আগেই পাঠানো হয়েছিল, নতুন করে যোগ করা হয়নি।",
      // WPU-Z6: the new request has a page of its own with the thread.
      open: "অনুরোধটি দেখুন",
    },
    list: {
      title: "আপনার আগের অনুরোধ",
      caption: "আপনার সাপোর্ট অনুরোধের তালিকা",
      subject: "বিষয়",
      category: "ধরন",
      status: "অবস্থা",
      sentOn: "পাঠানোর তারিখ",
      empty: { title: "এখনও কোনো অনুরোধ নেই", body: "অনুরোধ পাঠালে এখানে দেখা যাবে।" },
    },
    // WPU-Z5: a request that support has answered and that waits for the customer.
    // Final review (Z6 minors): the label of a status the screen does not know.
    status: {
      open: "খোলা",
      answered: "উত্তর দেওয়া হয়েছে",
      closed: "বন্ধ",
      unknown: "অবস্থা জানা নেই",
    },
    error: {
      unauthenticated: "আপনার সেশন শেষ হয়েছে। আবার সাইন ইন করুন।",
      validation: "কিছু তথ্য ঠিক নয়। চিহ্নিত ঘর ঠিক করে আবার চেষ্টা করুন।",
      rate_limited: "অল্প সময়ে অনেক অনুরোধ হয়েছে। একটু অপেক্ষা করে আবার চেষ্টা করুন।",
      forbidden: "এই কাজটি করা গেল না।",
      unavailable: "এখন শেষ করা গেল না। কিছুক্ষণ পরে আবার চেষ্টা করুন।",
    },
    field: { invalid: "এই ঘরের তথ্য ঠিক নয়।" },
  },
  // WPU-Z6: the customer's requests (/support/requests) and the thread of one (/support/requests/[id]).
  // Support's replies are signed "PanelPay সাপোর্ট", never with the name of the person who wrote them.
  SupportRequests: {
    meta: { title: "সাপোর্ট অনুরোধ", threadTitle: "সাপোর্ট অনুরোধের বিস্তারিত" },
    heading: "সাপোর্ট অনুরোধ",
    intro: "আপনার পাঠানো অনুরোধ ও তার উত্তর এখানে দেখুন। সাম্প্রতিক কার্যক্রম আগে দেখানো হয়।",
    newRequest: "নতুন অনুরোধ",
    list: {
      caption: "আপনার সাপোর্ট অনুরোধের তালিকা",
      subject: "বিষয়",
      category: "ধরন",
      status: "অবস্থা",
      lastActivity: "সর্বশেষ কার্যক্রম",
      empty: {
        title: "এখনও কোনো অনুরোধ নেই",
        body: "কোনো সমস্যা বা প্রশ্ন থাকলে নতুন অনুরোধ পাঠান। উত্তর এখানে দেখা যাবে।",
      },
    },
    thread: {
      back: "সব অনুরোধ",
      category: "ধরন",
      status: "অবস্থা",
      openedOn: "পাঠানোর সময়",
      lastActivity: "সর্বশেষ কার্যক্রম",
      reference: "রেফারেন্স",
      // Final review (Z6 minors): what a visitor sent from the public form is labelled neutrally, not "আপনি".
      author: {
        customer: "আপনি",
        visitor: "সর্বজনীন সাপোর্ট ফর্ম থেকে পাঠানো",
        admin: "PanelPay সাপোর্ট",
      },
      earlier: "আগের কিছু উত্তর এখানে দেখানো হচ্ছে না। প্রয়োজনে সাপোর্টকে জানান।",
      closed: "এই অনুরোধটি বন্ধ। নিচে উত্তর লিখলে অনুরোধটি আবার খুলবে।",
    },
    reply: {
      title: "উত্তর লিখুন",
      label: "আপনার উত্তর",
      hint: "সর্বোচ্চ ৫০০০ অক্ষর। পাসওয়ার্ড বা গোপন কোড লিখবেন না।",
      rule: "উত্তর পাঠালে বন্ধ বা উত্তর দেওয়া অনুরোধ আবার খোলা হয়।",
      submit: "উত্তর পাঠান",
      working: "পাঠানো হচ্ছে…",
      done: "আপনার উত্তর যোগ হয়েছে।",
      replayed: "এই উত্তর আগেই পাঠানো হয়েছিল, নতুন করে যোগ করা হয়নি।",
    },
    close: {
      button: "অনুরোধ বন্ধ করুন",
      working: "বন্ধ করা হচ্ছে…",
      hint: "সমস্যার সমাধান হলে অনুরোধটি বন্ধ করুন। পরে উত্তর লিখলে এটি আবার খুলবে।",
      done: "অনুরোধটি বন্ধ করা হয়েছে।",
    },
    notFound: {
      title: "অনুরোধটি পাওয়া যায়নি",
      body: "এই ঠিকানায় আপনার কোনো সাপোর্ট অনুরোধ নেই।",
      back: "সব অনুরোধ",
    },
    error: {
      unauthenticated: "আপনার সেশন শেষ হয়েছে। আবার সাইন ইন করুন।",
      validation: "কিছু তথ্য ঠিক নয়। চিহ্নিত ঘর ঠিক করে আবার চেষ্টা করুন।",
      not_found: "অনুরোধটি পাওয়া যায়নি।",
      conflict: "এই ফর্মটি আগে অন্য লেখা দিয়ে পাঠানো হয়েছিল। পাতাটি আবার খুলে নতুন করে লিখুন।",
      rate_limited: "অল্প সময়ে অনেকবার চেষ্টা হয়েছে। একটু অপেক্ষা করে আবার চেষ্টা করুন।",
      forbidden: "এই কাজটি করা গেল না।",
      unavailable: "এখন শেষ করা গেল না। কিছুক্ষণ পরে আবার চেষ্টা করুন।",
    },
    field: { invalid: "লেখাটি ১ থেকে ৫০০০ অক্ষরের মধ্যে হতে হবে, বিশেষ নিয়ন্ত্রণ-চিহ্ন ছাড়া।" },
  },
};
