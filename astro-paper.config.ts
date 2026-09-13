import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    // Live. Must stay a ROOT domain, not a sub-path —
    // Astro's asset resolution fights sub-path hosting.
    url: "https://qacraft.vercel.app/",
    title: "Chaitanya Krishna",
    description:
      "Notes on testing systems that don't behave the same way twice — flaky browsers, parallel workers, LLM judges, and the AI agents built to test them.",
    author: "Chaitanya Krishna",
    profile: "https://github.com/vebb374",
    ogImage: "default-og.jpg",
    lang: "en",
    timezone: "Asia/Kolkata",
    dir: "ltr",
  },
  posts: {
    perPage: 6,
    perIndex: 4,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showArchives: true,
    showBackButton: true,
    editPost: { enabled: false },
    search: "pagefind",
  },
  socials: [
    { name: "github", url: "https://github.com/vebb374" },
    { name: "linkedin", url: "https://www.linkedin.com/in/chaitanya-krishna-371859176/" },
    { name: "mail", url: "mailto:yendrapallichaitanya@proton.me" },
  ],
  shareLinks: [
    { name: "linkedin", url: "https://www.linkedin.com/sharing/share-offsite/?url=" },
    { name: "x", url: "https://x.com/intent/post?url=" },
    { name: "mail", url: "mailto:?subject=See%20this%20post&body=" },
  ],
});
