// PRO-3, PRO-4. Bundles main.ts (the worker) and migrate.ts (tc-migrate), with the workspace packages they
// import, into dist/main.mjs and dist/migrate.mjs for the box (/opt/tc/current/worker). Node cannot run the workspace .ts packages directly. Dependencies
// from npm stay external and are installed next to the bundle with the lockfile (R17).
import { build } from "esbuild";
import { fileURLToPath, URL } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

await build({
  entryPoints: { main: here("./main.ts"), migrate: here("./migrate.ts") },
  outdir: here("./dist"),
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: false,
  legalComments: "none",
  // Everything that is not a workspace package (@tc/*) stays a normal import.
  plugins: [
    {
      name: "external-npm",
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) =>
          args.path.startsWith("@tc/") || args.path.startsWith("node:") ? null : { external: true },
        );
      },
    },
  ],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "warning",
});
