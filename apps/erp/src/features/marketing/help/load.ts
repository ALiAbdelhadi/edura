import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Locale } from "@/lib/i18n";

const CONTENT_ROOT = path.join(process.cwd(), "src", "content", "help");

export type LoadedArticle = {
  title: string;
  summary: string;
  body: string;
};

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

export async function loadArticleMeta(locale: Locale, slug: string) {
  const { title, summary } = await loadArticle(locale, slug);
  return { slug, title, summary };
}
