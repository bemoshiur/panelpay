import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // PRO-3: the Pro edition (one EC2) runs the standalone server under systemd. The Lambda build leaves
  // `output` unset, as before.
  ...(process.env["TC_BUILD_TARGET"] === "pro" ? { output: "standalone" as const } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  // @tc/ui is raw TypeScript with explicit .ts import extensions.
  transpilePackages: ["@tc/ui"],
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
};

export default withNextIntl(nextConfig);
