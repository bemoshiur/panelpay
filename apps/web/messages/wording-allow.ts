// WP9-T5: values that may stay equal in bn and en, or hold no Bengali letter in bn. Each entry is a
// dotted message key, a prefix ending in ".*", or a suffix starting with "*.", with the reason. Brand
// names, numbers, URLs, format tokens and placeholders-only values need no entry: the check skips
// them itself.
export interface WordingAllow {
  readonly key: string;
  readonly reason: string;
}

const AWS_NAME =
  "AWS name shown beside the product name: 16.13 prints it in English in both locales";

export const SAME_IN_BOTH: readonly WordingAllow[] = [
  { key: "kit.locale.*", reason: "each language is written in its own script in both locales" },
  { key: "Settings.profile.details.localeBn", reason: "language name in its own script" },
  { key: "Settings.profile.details.localeEn", reason: "language name in its own script" },
  { key: "Shell.footer.companyName", reason: "the company name, the brand PanelPay (WPU-Y6)" },
  {
    key: "Shell.footer.bin",
    reason: "WPU-Y6: the BIN of the company, written exactly as the owner gave it",
  },
  {
    key: "Shell.footer.tradeLicense",
    reason: "WPU-Y6: the trade licence number, written exactly as the owner gave it",
  },
  { key: "Shell.footer.address", reason: "postal address of the company (16.14), in Latin" },
  { key: "Shell.admin.ops", reason: "role abbreviation shown as in the operator tools" },
  { key: "Aws.trademark", reason: "16.13: the trademark line is the same English line" },
  { key: "Public.home.regionNames.*", reason: AWS_NAME },
  { key: "Servers.region.*", reason: "16.13: AWS Region names with their official English names" },
  {
    key: "Servers.new.namePlaceholder",
    reason: "example label in Latin letters (resource label rule)",
  },
  { key: "Containers.detail.deploy.imagePlaceholder", reason: "example image reference" },
  { key: "*.detail.header.aws", reason: AWS_NAME },
  { key: "Gallery.names.*", reason: AWS_NAME },
  { key: "Gallery.samples.*", reason: "dev-only gallery: component names and mockup selectors" },
];

// Bengali text that carries an English name on purpose (the AWS name or the relational phrase of 16.13).
export const LATIN_ONLY_BN: readonly WordingAllow[] = [
  {
    key: "Servers.new.intro",
    reason: "16.13 relational phrase: Cloud Server, built on Amazon Lightsail",
  },
  {
    key: "Extras.storage.intro",
    reason: "16.13 AWS name beside the product: Amazon Lightsail block storage disk",
  },
  {
    key: "DiskRestore.intro",
    reason: "16.13 AWS name beside the product: Amazon Lightsail block storage disk",
  },
  {
    key: "DiskList.intro",
    reason: "16.13 AWS name beside the product: Amazon Lightsail block storage disk",
  },
  {
    key: "Storage.awsNote",
    reason: "16.13 AWS name beside the product: Amazon Lightsail object storage bucket",
  },
  {
    key: "Public.legal.docs.acceptable-use.sections.aws.p1",
    reason: "title of the AWS policy, a document name",
  },
];
