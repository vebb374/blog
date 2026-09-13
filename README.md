# blog

Personal engineering blog — notes on testing systems that don't behave the same way twice.

Built with [Astro](https://astro.build) and the [AstroPaper](https://github.com/satnaing/astro-paper) theme (MIT).

## Local
```bash
pnpm install
pnpm dev        # http://localhost:4321
pnpm build      # typecheck + build + search index -> dist/
pnpm preview    # serve the built site (search only works here, not in dev)
```

## Added on top of the theme
- **Reading time** — computed at build time by a remark plugin (`src/utils/remark-reading-time.ts`).
- **Read aloud** — Web Speech API, no key and no network (`src/components/ReadAloud.astro`).

See `CLAUDE.md` for the working notes.

## Licence
Theme: MIT © Sat Naing. Post content: © Chaitanya Krishna.
