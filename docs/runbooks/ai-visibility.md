# AI visibility: OmniRank audit, GEO files, IndexNow

How the public site of PanelPay stays readable and quotable for search engines and answer engines (ChatGPT, Claude, Gemini, Perplexity, Copilot), and what the owner does off the site (WPU-Z16). Owner decision 2026-11-13: no tracking tool is installed; the site itself is made easy to crawl, quote and cite. Nothing here needs an AWS role, a secret or a deploy.

What the site serves:

- Every public page (home, pricing, Cloud Server, help, support, the four legal documents) in bn and en: one `h1`, a canonical URL, `hreflang` bn, en and `x-default`, a title of at most 60 and a description of at most 160 characters, OpenGraph with the picture `/brand/og.png` (1200 x 630), and JSON-LD: Organization (stable `@id` `<origin>/#organization`, the entity statement as description, no `sameAs` until a profile exists), WebSite, WebPage (`dateModified`), BreadcrumbList, FAQPage on help and Cloud Server, Product and Offer in USD where the page shows prices.
- An answer block of 40 to 60 words near the top of home, help, pricing, Cloud Server and support: the hero subtitle class `.subheading` of the mockup (`geo.answerBlockSelector` of `omnirank.config.json`). The FAQ is a description list (`dl`, `dt`, `dd`) with every answer in the server HTML.
- A dated line "Last updated" at the foot of every public page (`CONTENT_UPDATED` in `apps/web/server/public/seo.ts`).
- `/llms.txt`, `/llms-full.txt` and `/facts.json`: PHYSICAL files in `apps/web/public`, written from the messages by `apps/web/server/public/geo.ts`. Licence `CC-BY-4.0`, attribution "PanelPay". The company is PanelPay with "BIN: 000000000-0000" and "Trade License: TRAD/DNCC/000000/2000" (owner, WPU-Y6, 2026-11-14), the same as the footer and the Organization JSON-LD (`identifier`).
- `/robots.txt`: every crawler may read the public pages; GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot, Perplexity-User, Google-Extended, bingbot and Applebot-Extended each have a group of their own; every group keeps out the panel, the sign-in pages, `/api/`, `/pay/` and `/dev/`. The admin app (admin.tryaws.now) is `noindex` on every page.
- Only production is indexed (owner ruling 2026-11-14): on staging and every other stage (TC_STAGE not `production`, or missing) robots.txt is `User-Agent: *` / `Disallow: /` with no sitemap line, and every response of the proxy carries `X-Robots-Tag: noindex, nofollow` (`indexableStage` in `apps/web/server/public/indexing.ts`).
- `/sitemap.xml`: the public pages in both locales with their `hreflang` alternates; a product family only while its flag is on.
- `/<key>.txt`: the IndexNow key file (public by design, indexnow.org). The key is the file name in `apps/web/public`; it is not repeated here.

## Trigger

- After every production deploy: the workflow `omnirank` runs on its own (jobs `audit` and `indexnow`).
- Before go-live and after a change of a public text: run the audit against staging by hand.
- A text of the public pages changed: move `CONTENT_UPDATED` and write the GEO files again.
- The owner's off-site steps below are not done yet.

## Who

DevOps or the owner starts the workflow (GitHub, Actions, `omnirank`, Run workflow). The owner does the off-site steps. A Claude Code session may run the audit workflow and edit the texts; it never logs in to Search Console, Bing Webmaster Tools or a listing site.

## Run the audit

1. GitHub, Actions, workflow `omnirank`, Run workflow: target `staging` (https://staging.tryaws.now) before go-live, `production` (https://tryaws.now) after. The production run also starts on its own after every successful `deploy-production`. The job takes the origin from the variable `TC_DOMAIN_WEB` of the GitHub environment of the target (`staging` or `production`), read with `deployment: false` (no deployment record), and stops when it is not a host name; the IndexNow job reads `TC_DOMAIN_WEB` of `production` the same way. VERIFY on the first run: the environment `production` accepts deployments only from tags `v*`; if GitHub applies that rule to a job with `deployment: false` too, the production audit after a deploy (which runs on `main`) is refused at the start. Then run it by hand with `gh workflow run omnirank.yml --ref <the pushed v* tag> -f target=production` and write a Needs decision in JOURNEY.md.
2. The job installs the dependencies from the hashed lock `.github/omnirank/requirements.txt` (`--require-hashes --no-deps`), then OmniRank v0.4.0 (commit `dabe4bedd6e2623aa0160cb584bf5880aaec14bc`) with `--no-deps --no-build-isolation`, in a virtual environment on Python 3.12, and runs `omnirank audit` with `omnirank.config.json`, the site URL replaced by the chosen site. To move the lock (a new OmniRank commit or a security fix): follow the commands at the top of `.github/omnirank/requirements.in` with Python 3.12, and review the diff of the lock.
3. It fails on the gates of `audit.failOn` (h1, canonical, title and description length, schema, schema fabrication, speakable, llms.txt, llms-full.txt, facts.json, ai-allowlist, sitemap health, noindex in sitemap, robots and sitemap, canonical target, hreflang noindex, lang, mixed content, https redirect). The scores and every finding are in the job summary.
4. On staging the five indexing gates (ai-allowlist, noindex-in-sitemap, robots-sitemap, canonical-target, hreflang-noindex) are dropped from failOn (`STAGING_SKIPPED_GATES` of the workflow): staging is noindex and disallows everything on purpose, so they report errors there. Judge them on the production run only.
5. Expected findings that do not fail the job: `aeo.answer-block.missing` on the four legal pages (a legal text gets no summary without the owner's wording), `security.*` header findings (`info`), the perf warnings of a cold start.
6. A finding `geo.llms-full.forbidden` or `geo.facts.forbidden` (HTTP 403) means CloudFront sent the path to a store that does not hold it: check that the files are in `apps/web/public` of the deployed commit (they are committed, not built).

## Write the GEO files again after a text change

1. Change the messages (`apps/web/messages/public-bn.ts` first, then `public-en.ts`) and move `CONTENT_UPDATED` in `apps/web/server/public/seo.ts` to the day of the change (Asia/Dhaka).
2. In `apps/web`: `GEO_WRITE=1 pnpm exec vitest run server/public/geo-files.test.ts` writes `llms.txt`, `llms-full.txt` and `facts.json`.
3. `pnpm test --filter web` must pass: the same test fails whenever a file on disk differs from the messages.

## IndexNow ping

- Automatic: job `indexnow` of the workflow `omnirank`, after every successful production deploy.
- By hand: Run workflow with target `production` and `indexnow` ticked, or in a terminal `node scripts/indexnow-ping.mjs --origin https://tryaws.now` (add `--dry-run` to see the count of URLs without sending).
- The URLs are those of the live `sitemap.xml`. An answer other than 200 or 202 fails the job: 403 means the key file is not served at the root, 422 a URL of another host, 429 too many pings (wait a day).

## AI visibility: the owner's off-site steps

No tracking tool is installed and none is needed for these steps.

1. Google Search Console: add the domain property `tryaws.now`. Google shows a TXT value (`google-site-verification=...`). Add it as a TXT record at the apex of the Route 53 public hosted zone `tryaws.now` (Route 53 console, the zone, Create record, type TXT, the value in quotes; keep the SES and DMARC records as they are). Click Verify. Submit `https://tryaws.now/sitemap.xml`.
2. Bing Webmaster Tools (Bing, and through it Copilot and ChatGPT search): add the site, choose DNS verification, add the given TXT (or CNAME) record in the same zone, verify, and submit the same sitemap. Import from Search Console is the shorter path once Google is verified.
3. Business listings with the same name, company, address, identifiers and description as `facts.json` (the entity statement, word for word): Google Business Profile (as a service-area business in Dhaka if no walk-in address is wanted), Bing Places, and the profiles PanelPay will keep (LinkedIn company page, Facebook page, Crunchbase, Wikidata when notable). Then add each real profile URL to `sameAs` in `omnirank.config.json` and to the Organization JSON-LD (`organizationLd` in `apps/web/server/public/seo.ts`), and write the GEO files again.
4. Every few weeks, ask ChatGPT, Claude, Gemini and Perplexity the questions of the help page ("how to pay for a cloud server in taka", "VAT invoice for cloud servers in Bangladesh", "Amazon Lightsail in Bangladesh"); note whether PanelPay is named and cited. No tool, no account linking.

## Rollback

- A wrong text in the GEO files: correct the messages, write the files again, deploy through CI. The previous files come back with a revert of the commit.
- Stop answer engines from training on the site: remove `GPTBot`, `ClaudeBot`, `Google-Extended` and `Applebot-Extended` from `AI_CRAWLERS` (`apps/web/server/public/sitemap.ts`) and add a group that disallows `/` for them; keep the search and user agents (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User) open, or the site leaves their answers.
- A bad IndexNow key: replace the key file in `apps/web/public` with a new random 32-hex key (file name and content) and the path in `omnirank.config.json`.

## Log

Write in JOURNEY.md: the date, the audit target and its overall score, the gates that failed and what changed. For the off-site steps: which property or listing was added and when it was verified (no value of a verification record is needed there).

## Must not

- Install a tracking, analytics or chat script, or load anything from another origin (rule U3).
- Serve `llms.txt`, `llms-full.txt` or `facts.json` from a route handler (403 behind CloudFront); they stay physical files.
- Put a mark of AWS into a profile name other than the brand token PanelPay (16.13), or claim that AWS sells, supports or endorses the service.
- Add a `sameAs` URL of a profile that does not exist.
- Print or store the password of Search Console, Bing Webmaster Tools or a listing site anywhere in this repository.

---

_PanelPay is open source (Apache-2.0), created by [S M Moshiur Rahman](https://www.linkedin.com/in/in-moshiur) · [LinkedIn](https://www.linkedin.com/in/in-moshiur)._
