# Blog — working notes

Personal engineering blog. Astro 7 + AstroPaper theme, static output, no server.

## Commands
```bash
pnpm dev            # localhost:4321
pnpm build          # typecheck + build + pagefind index -> dist/
pnpm preview        # serve dist/ exactly as deployed
pnpm format         # prettier
pnpm lint           # eslint
```
`pnpm build` runs `astro check` first — **type errors fail the build**, so run it before pushing.

## Where things live
| Thing | Path |
|---|---|
| Posts | `src/content/posts/*.md(x)` |
| Standalone pages (about) | `src/content/pages/` |
| Site config — title, socials, features | `astro-paper.config.ts` |
| Frontmatter schema (Zod) | `src/content.config.ts` |
| Post page (layout + wiring) | `src/pages/posts/[...slug]/index.astro` |
| Markdown pipeline, Shiki, fonts | `astro.config.ts` |

## Writing a post
Create `src/content/posts/my-post.md`. Required frontmatter:
```yaml
---
title: "..."
description: "..."        # used for SEO + the OG card
pubDatetime: 2026-09-13T10:00:00+05:30
tags: ["testing", "llm"]
draft: false              # true = built locally, excluded from prod
featured: false
---
```
The schema is Zod-validated — **a malformed post fails the build, not production.** That is deliberate.

## Two things added on top of the stock theme

### Reading time
`src/utils/remark-reading-time.ts`, wired as the first entry in `markdown.remarkPlugins`.
Computed at build from the mdast tree and injected into frontmatter as `readingTime` ("6 min read").
The post page reads it via `remarkPluginFrontmatter` from `render(post)` — **not** from `post.data`,
because remark-injected frontmatter is not part of the collection schema.

### Read aloud
`src/components/ReadAloud.astro`. Web Speech API — no key, no network, nothing leaves the browser.
Deliberate choices in there, don't "simplify" them away:
- The control starts `hidden` and only unhides once `speechSynthesis` is confirmed present.
- **Chrome silently stops synthesis after ~15s.** The `setInterval` pause/resume keep-alive is the
  documented workaround, not dead code.
- `synth.cancel()` before every `speak()` — some browsers refuse to queue over a stale utterance.
- `<pre>`, the TOC and heading anchors are stripped before speaking. Nobody wants a code block read out.
- Audio is stopped on `astro:before-swap`, `pagehide` and `beforeunload` so it never outlives the page.
- Icons are wrapped in `<span hidden>` rather than `<svg hidden>` — Astro's `SVGAttributes` has no
  `hidden` and the build will fail on it.

If a consistent voice ever matters more than zero cost, pre-generate an MP3 per post at build time and
swap this for `<audio>`. See `../knowledge-graph/blog/STACK.md`.

## Gotchas
- **`site.url` must be a root domain, not a sub-path.** Astro's asset resolution fights sub-path hosting
  (this cost ~200 lines of path-patching scripts in a previous project before it was abandoned).
  So: Vercel/Cloudflare at a root domain, *not* GitHub Pages under `/blog`.
- Images: put them in `src/assets/` and import them, so Astro optimises and hashes them. Files in
  `public/` are served raw and unoptimised.
- Pagefind indexes `dist/` **after** the build. Search does not work in `pnpm dev` — use `pnpm preview`.
- Post URLs come from the filename, not the title. Renaming a file breaks its permalink.

## Deploy
Static. Build command `pnpm build`, output `dist/`. Vercel or Cloudflare Pages.
Publish on this domain first, then syndicate to dev.to with `canonical_url` pointing back here.

## Conventions
- Prose over bullet lists in posts; every technical claim gets a real number or a mechanism.
- Anonymise employer and customers in anything published (see `../knowledge-graph/ENGINEERING_DOSSIER.md` §0/§1).
- Never commit API keys. There are none in this repo and it should stay that way.

## Writing review — `agent-style`

[`yzhao062/agent-style`](https://github.com/yzhao062/agent-style) (677★, MIT + CC-BY-4.0) gives deterministic
writing checks, not just prose advice. Run it on a draft before publishing:

```bash
pipx run agent-style review src/content/posts/my-post.md
```

**Act on:** RULE-12 (sentences over 30 words) and RULE-C (consecutive sentences opening with the same word).
Both catch real rhythm problems that are hard to see in your own draft.

**Deliberately ignored here, with reasons — don't "fix" these blindly:**
- **RULE-B, em dash as casual punctuation.** Calibrated to the 2023-24 consensus that em dashes read as
  AI. The 2026 stylometry says the opposite: frontier models emit *fewer* em dashes than the human
  baseline, and zero em dashes is now its own tell. Keep them at roughly one per 100 words.
- **RULE-I, no contractions.** Right for formal API documentation, wrong for a personal blog. Contractions
  are most of what makes prose sound like a person.
- **RULE-G, title-case headings.** House style here is sentence case, like the rest of the theme.
- It also flags **image alt text** as prose. Alt text should be descriptive; ignore those hits.

The tool is a second pair of eyes, not an authority. Every suppression above is a judgement you should be
able to defend, which is the same bar the posts themselves are held to.
