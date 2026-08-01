"use client";

import { track } from "@/lib/track";
import { useEffect, type ReactNode } from "react";

/**
 * Records that an article was opened, then renders its (server-rendered) body
 * unchanged as children. Keeping the boundary here means the MDX itself never
 * becomes a client component — the only thing crossing is the fact of a view.
 */
export function HelpArticleView({
  slug,
  category,
  children,
}: {
  slug: string;
  category: string;
  children: ReactNode;
}) {
  useEffect(() => {
    track("help_article_viewed", { slug, category });
  }, [slug, category]);

  return <>{children}</>;
}
