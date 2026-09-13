import getReadingTime from "reading-time";
import { toString } from "mdast-util-to-string";
import type { RemarkPlugin } from "@astrojs/markdown-remark";

/**
 * Computes reading time at build time and writes it into frontmatter as
 * `readingTime` ("6 min read"). Runs during the markdown pass, so it costs
 * nothing at runtime and ships no client JS.
 */
export const remarkReadingTime: RemarkPlugin = () => {
  return (tree, file) => {
    const textOnPage = toString(tree);
    const readingTime = getReadingTime(textOnPage);
    // @ts-expect-error astro augments `data` at runtime
    file.data.astro.frontmatter.readingTime = readingTime.text;
  };
};
