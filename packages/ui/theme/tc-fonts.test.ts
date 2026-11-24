import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "postcss";
import { describe, expect, it } from "vitest";
import { refKind, resolveRef, scanCssRefs } from "./css-refs.ts";
import { faceFor, fontPackageDir, readFontFaces, type FontFace } from "./font-faces.ts";
import { TC_FONTS, TC_OWN_FONTS } from "./manifest.ts";
import { woff2CodePoints } from "./woff2.ts";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const read = (path: string): string => readFileSync(`${repoRoot}${path}`, "utf8");
const tc = read("packages/ui/styles/tc.css");
// The theme is the paid Antler theme; a public checkout has none (docs/theme.md), and the one test that
// reads its CSS skips. The tests of tc.css and the fonts run.
const hasTheme = existsSync(`${repoRoot}design/mockup/template`);
const themeCss = hasTheme ? read("design/mockup/template/assets/css/theme.min.css") : "";
const faces = readFontFaces(tc);

const LATIN = "open-sans-latin-wght-normal.woff2";
const LATIN_EXT = "open-sans-latin-ext-wght-normal.woff2";
const NOTO = "noto-sans-bengali-bengali-wght-normal.woff2";
const HIND = (weight: string): string => `hind-siliguri-${weight}.woff2`;
const HIND_DIR = `${repoRoot}packages/ui/fonts/hind-siliguri`;
const DIGIT_ONE = 0x9e7;

// The four weight groups: Hind Siliguri is static (one file per weight), so each group is one composite face.
const GROUPS = [
  { weight: "300 400", hind: "400" },
  { weight: "500", hind: "500" },
  { weight: "600", hind: "600" },
  { weight: "700 800", hind: "700" },
] as const;
const FACES_PER_GROUP = 5;
const groupFaces = (weight: string): FontFace[] =>
  faces.filter((f) => f.family === "Open Sans" && f.weight === weight);

const packageOf = (face: FontFace): string | null => {
  const file = basename(face.url);
  if (file.startsWith("hind-siliguri-")) return null;
  return file.startsWith("noto-sans-bengali-")
    ? "@fontsource-variable/noto-sans-bengali"
    : "@fontsource-variable/open-sans";
};
const fileOf = (face: FontFace): string => {
  const pkg = packageOf(face);
  return pkg === null
    ? join(HIND_DIR, basename(face.url))
    : join(fontPackageDir(pkg), "files", basename(face.url));
};
const glyphs = new Map<string, ReadonlySet<number>>();
const hasGlyph = (face: FontFace, codePoint: number): boolean => {
  const path = fileOf(face);
  if (!glyphs.has(path)) glyphs.set(path, woff2CodePoints(readFileSync(path)));
  return glyphs.get(path)?.has(codePoint) === true;
};
const drawnBy = (weight: string, codePoint: number): string | null =>
  basename(faceFor(groupFaces(weight), codePoint, hasGlyph)?.url ?? "") || null;

describe("the composite family 'Open Sans' (16.4, WPU-F1)", () => {
  it("is four weight groups of five faces, each Latin ext, Latin, Noto Bengali, Hind Siliguri, then the digit one", () => {
    const named = faces.filter((f) => f.family === "Open Sans");
    expect(named).toHaveLength(GROUPS.length * FACES_PER_GROUP);
    for (const group of GROUPS) {
      expect(groupFaces(group.weight).map((f) => basename(f.url))).toEqual([
        LATIN_EXT,
        LATIN,
        NOTO,
        HIND(group.hind),
        NOTO,
      ]);
    }
  });

  it("Review Focus 1: inside a weight group every face has the same style, weight, stretch and display", () => {
    for (const group of GROUPS) {
      expect(
        new Set(
          groupFaces(group.weight).map((f) => `${f.style}|${f.weight}|${f.stretch}|${f.display}`),
        ),
        group.weight,
      ).toEqual(new Set([`normal|${group.weight}|normal|swap`]));
    }
    // the groups cover 300 to 800 without a gap or an overlap
    expect(GROUPS.map((g) => g.weight)).toEqual(["300 400", "500", "600", "700 800"]);
  });

  it("takes the Latin and Noto ranges from the Fontsource stylesheet of the same file, character for character", () => {
    for (const face of faces.filter((f) => packageOf(f) !== null)) {
      const pkg = packageOf(face) as string;
      const index = readFontFaces(readFileSync(join(fontPackageDir(pkg), "index.css"), "utf8"));
      const same = index.find((f) => basename(f.url) === basename(face.url));
      expect(same, basename(face.url)).toBeDefined();
      // the digit face is a narrower range of the Noto file on purpose
      if (face.ranges.length === 1 && face.ranges[0]?.[0] === DIGIT_ONE) continue;
      expect(face.ranges, basename(face.url)).toEqual(same?.ranges);
    }
  });

  it.skipIf(!hasTheme)(
    "is the family that the theme names for the body, headings, buttons and inputs, with !important",
    () => {
      let rule: { value: string; important: boolean } | undefined;
      parse(themeCss).walkRules((r) => {
        if (r.selectors.includes("body[data-font=opensans] button"))
          r.walkDecls("font-family", (d) => {
            rule = { value: d.value, important: d.important === true };
          });
      });
      expect(rule).toEqual({ value: "'Open Sans',sans-serif", important: true });
    },
  );

  it("draws Bengali text with Hind Siliguri in every weight, and the Latin text with Open Sans", () => {
    for (const group of GROUPS) {
      // ka, aa-kar, the zero and nine digits, the danda and the virama (which Hind has)
      for (const c of [0x995, 0x9be, 0x9e6, 0x9ef, 0x9cd, 0x964])
        expect(drawnBy(group.weight, c), `${group.weight} U+${c.toString(16)}`).toBe(
          HIND(group.hind),
        );
      for (let c = 0x20; c <= 0x7e; c++)
        expect(drawnBy(group.weight, c), `${group.weight} U+${c.toString(16)}`).toBe(LATIN);
      expect([0xe9, 0x20ac, 0xd7].map((c) => drawnBy(group.weight, c))).toEqual([
        LATIN,
        LATIN,
        LATIN,
      ]);
      expect([0x101, 0x141].map((c) => drawnBy(group.weight, c))).toEqual([LATIN_EXT, LATIN_EXT]);
    }
    expect(drawnBy("300 400", 0x2192)).toBeNull(); // an arrow is in none of the files: the system font draws it
  });

  it("draws the Bengali digit one, and only it, with Noto Sans Bengali, by unicode-range alone", () => {
    for (const group of GROUPS) {
      expect(drawnBy(group.weight, DIGIT_ONE), group.weight).toBe(NOTO);
      for (const c of [0x9e6, 0x9e8, 0x9e9, 0x9ea, 0x9eb, 0x9ec, 0x9ed, 0x9ee, 0x9ef])
        expect(drawnBy(group.weight, c), `${group.weight} U+${c.toString(16)}`).toBe(
          HIND(group.hind),
        );
    }
    // the digit face is exactly U+09E7, declared last, in every group
    for (const group of GROUPS) {
      const last = groupFaces(group.weight).at(-1) as FontFace;
      expect(last.ranges).toEqual([[DIGIT_ONE, DIGIT_ONE]]);
      expect(basename(last.url)).toBe(NOTO);
    }
  });

  it("has a class tc-d1 and a family 'TC Bengali One' for the digit one, for places that must name it", () => {
    const named = faces.filter((f) => f.family === "TC Bengali One");
    expect(named.map((f) => [basename(f.url), f.ranges, f.display])).toEqual([
      [NOTO, [[DIGIT_ONE, DIGIT_ONE]], "swap"],
    ]);
    const rules: string[] = [];
    parse(tc).walkRules((r) => {
      if (r.selector === ".tc-d1")
        r.walkDecls("font-family", (d) => {
          rules.push(d.value);
        });
    });
    expect(rules).toEqual(['"TC Bengali One", "Open Sans", sans-serif']);
  });

  it("falls back to Noto Sans Bengali for any glyph of its range that Hind Siliguri lacks: nothing is lost", () => {
    const noto = faces.find((f) => basename(f.url) === NOTO) as FontFace;
    const all = [...woff2CodePoints(readFileSync(fileOf(noto)))];
    const inRange = all.filter((c) => noto.ranges.some(([a, b]) => c >= a && c <= b));
    expect(inRange.length).toBeGreaterThan(110);
    for (const group of GROUPS)
      expect(
        inRange.filter((c) => drawnBy(group.weight, c) === null),
        group.weight,
      ).toEqual([]);
    // the taka sign and both joiners
    for (const c of [0x9f3, 0x200c, 0x200d])
      expect(drawnBy("300 400", c), `U+${c.toString(16)}`).not.toBeNull();
  });

  it("has a glyph for every character of the Bengali statements and product names of 16.13", () => {
    const texts = [
      "১০০% AWS অবকাঠামো। Amazon Lightsail দিয়ে তৈরি।",
      "এখানে কেনা প্রতিটি সার্ভার, ডেটাবেস ও স্টোরেজ একটি Amazon Lightsail resource, যা Singapore বা Mumbai AWS Region থেকে চলে। বিক্রি, বিল ও সাপোর্ট PanelPay দেয়। সবকিছু এই প্যানেল থেকেই চালানো যায়, আলাদা AWS account লাগে না।",
      "ক্লাউড সার্ভার ম্যানেজড ডেটাবেস ব্লক স্টোরেজ অবজেক্ট স্টোরেজ লোড ব্যালান্সার কন্টেইনার সার্ভিস সিডিএন স্ট্যাটিক আইপি ব্যাকআপ প্ল্যান ইমেজ লোকেশন ডিএনএস, ডোমেইন টপ আপ AWS সার্ভিস মূল্য",
      "৳ ১,২৩৪.৫০ ০১৭১২৩৪৫৬৭৮৯",
    ];
    for (const group of GROUPS) {
      const missing = texts.flatMap((t) =>
        [...t].filter((ch) => ch !== " " && drawnBy(group.weight, ch.codePointAt(0) ?? 0) === null),
      );
      expect(missing, group.weight).toEqual([]);
    }
  });

  it("names no other origin, imports nothing, and every url() is a font file beside tc.css (U3)", () => {
    const refs = scanCssRefs(tc);
    expect(refs.filter((r) => r.kind === "import")).toEqual([]);
    expect(new Set(refs.map((r) => refKind(r.raw)))).toEqual(new Set(["relative"]));
    expect(new Set(refs.map((r) => resolveRef("tc.css", r.raw)))).toEqual(
      new Set([
        `fonts/${LATIN_EXT}`,
        `fonts/${LATIN}`,
        `fonts/${NOTO}`,
        ...GROUPS.map((g) => `fonts/${HIND(g.hind)}`),
      ]),
    );
  });

  it("every font file that tc.css names is copied by the publish stage (an installed package or the repository)", () => {
    const copied = new Set<string>([
      ...TC_FONTS.flatMap((f) => f.files),
      ...TC_OWN_FONTS.flatMap((f) => f.files),
    ]);
    for (const face of faces) expect(copied.has(basename(face.url)), face.url).toBe(true);
  });
});

describe("Hind Siliguri, self-hosted (WPU-F1)", () => {
  it("holds the four weights as woff2 and the SIL Open Font License", () => {
    const own = TC_OWN_FONTS.find((f) => f.id === "hind-siliguri");
    expect(own?.dir).toBe("packages/ui/fonts/hind-siliguri");
    for (const file of own?.files ?? []) {
      const path = join(HIND_DIR, file);
      expect(existsSync(path), file).toBe(true);
      expect(readFileSync(path).subarray(0, 4).toString("latin1"), file).toBe("wOF2");
    }
    const licence = readFileSync(join(HIND_DIR, "OFL.txt"), "utf8");
    expect(licence).toContain("SIL Open Font License, Version 1.1");
    expect(licence).toContain("Indian Type Foundry");
  });
});

// U3: no font, stylesheet or script comes from a third-party origin. Test files are skipped on purpose:
// they name such origins as examples of what must be refused.
describe("no third-party font origin anywhere (U3)", () => {
  const ORIGIN =
    /fonts\.googleapis\.com|fonts\.gstatic\.com|gstatic\.com|fonts\.google\.com|use\.typekit\.net|fonts\.bunny\.net/i;
  const SKIP_DIR = new Set(["node_modules", ".next", ".open-next", "dist", "coverage", ".sst"]);
  const TEXT = /\.(css|ts|tsx|js|mjs|cjs|json|html|md|svg|txt)$/;
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (SKIP_DIR.has(name)) return [];
      if (statSync(path).isDirectory()) return files(path);
      return TEXT.test(name) && !/\.test\./.test(name) ? [path] : [];
    });

  it.each(["apps", "packages/ui", "functions"])("%s names none", (dir) => {
    const found = files(`${repoRoot}${dir}`).filter((path) =>
      ORIGIN.test(readFileSync(path, "utf8")),
    );
    expect(found.map((p) => p.slice(repoRoot.length))).toEqual([]);
  });

  it("the invoice and the mail name fonts, never fetch them (no @font-face, no font URL)", () => {
    for (const file of [
      "packages/core/invoices/render.ts",
      "packages/notify/templates/layout.ts",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/@font-face\s*\{|fonts\.(googleapis|gstatic)/);
    }
  });
});
