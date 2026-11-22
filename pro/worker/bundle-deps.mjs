// PRO-4. Writes dist/package.json for the bundles: every npm package that dist/*.mjs imports, pinned to
// the exact version the workspace resolves today (R17). The release step then runs
// `npm install --omit=dev --ignore-scripts` in dist/ with that file, so the box runs the versions that
// were tested. A package that cannot be resolved stops the build (R16).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { stderr, stdout } from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";

const dist = fileURLToPath(new URL("./dist/", import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));

const names = new Set();
for (const f of readdirSync(dist).filter((n) => n.endsWith(".mjs"))) {
  const src = readFileSync(dist + f, "utf8");
  for (const m of src.matchAll(
    /(?:^|\n)\s*(?:import|export)\s[^"'`;]*?from\s*["']([^"'./][^"']*)["']/g,
  )) {
    const spec = m[1];
    if (spec.startsWith("node:") || spec.startsWith("@tc/")) continue;
    const parts = spec.split("/");
    names.add(spec.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0]);
  }
}

// Resolve each name from the workspace packages that import it.
const bases = ["packages", "functions", "pro", "apps"].flatMap((d) =>
  readdirSync(root + d, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `${root}${d}/${e.name}/package.json`),
);

function versionOf(name) {
  for (const base of bases) {
    try {
      const req = createRequire(base);
      const dir = req.resolve(`${name}/package.json`);
      return JSON.parse(readFileSync(dir, "utf8")).version;
    } catch {
      // try the next package; some packages do not export ./package.json
      try {
        const req = createRequire(base);
        const entry = req.resolve(name);
        const at = entry.lastIndexOf(`/node_modules/${name}/`);
        if (at < 0) continue;
        const pkg = entry.slice(0, at + `/node_modules/${name}/`.length) + "package.json";
        return JSON.parse(readFileSync(pkg, "utf8")).version;
      } catch {
        continue;
      }
    }
  }
  return undefined;
}

const dependencies = {};
for (const name of [...names].sort()) {
  const v = versionOf(name);
  if (v === undefined) {
    stderr.write(`bundle-deps: cannot resolve ${name}\n`);
    process.exit(1);
  }
  dependencies[name] = v;
}
writeFileSync(
  dist + "package.json",
  JSON.stringify(
    { name: "tc-pro-worker-bundle", private: true, type: "module", dependencies },
    null,
    2,
  ) + "\n",
);
stdout.write(
  `${JSON.stringify({ event: "bundle_deps", count: Object.keys(dependencies).length })}\n`,
);
