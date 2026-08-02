import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Locale } from "@/lib/i18n";

/**
 * Reads a help article off disk.
 *
 * The `/help` routes are STATICALLY GENERATED (`generateStaticParams` over
 * every locale × slug, with no dynamic API in the tree), so every one of these
 * reads happens during `next build` on a machine that has the source tree.
 * Nothing here runs at request time in production, which is why a plain `fs`
 * read is safe and no file-tracing configuration is needed — deliberately, since
 * next.config.ts belongs to another workstream this cycle.
 */

const CONTENT_ROOT = path.join(process.cwd(), "src", "content", "help");

export type LoadedArticle = {
  title: string;
  summary: string;
  body: string;
};

/**
 * Frontmatter parser for the two keys we actually use. Deliberately NOT a YAML
 * engine: the content is ours, the shape is fixed, and a dependency that can
 * evaluate arbitrary YAML is not worth adding for `title:` and `summary:`.
 * Values may be quoted; a missing block is an error, not a silent empty title.
 */
function parseFrontmatter(raw: string, id: string): LoadedArticle {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) throw new Error(`Help article ${id} has no frontmatter block`);

  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at === -1) continue;
    const key = line.slice(0, at).trim();
    const value = line
      .slice(at + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key) meta[key] = value;
  }

  if (!meta.title) throw new Error(`Help article ${id} is missing a title`);
  return {
    title: meta.title,
    summary: meta.summary ?? "",
    body: raw.slice(match[0].length),
  };
}

export async function loadArticle(locale: Locale, slug: string): Promise<LoadedArticle> {
  const file = path.join(CONTENT_ROOT, locale, `${slug}.mdx`);
  return parseFrontmatter(await readFile(file, "utf8"), `${locale}/${slug}`);
}

/**
 * Title + summary only, for the index cards. Same read as `loadArticle`; the
 * body is discarded rather than compiled, so listing 11 articles does not run
 * 11 MDX compilations.
 */
export async function loadArticleMeta(locale: Locale, slug: string) {
  const { title, summary } = await loadArticle(locale, slug);
  return { slug, title, summary };
}
