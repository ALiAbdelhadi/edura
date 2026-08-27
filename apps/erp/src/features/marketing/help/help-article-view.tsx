"use client";

import { track } from "@/lib/track";
import { ANALYTICS_EVENTS } from "@repo/observability";
import { useEffect, type ReactNode } from "react";

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
    track(ANALYTICS_EVENTS.HELP_ARTICLE_VIEWED, { slug, category });
  }, [slug, category]);

  return <>{children}</>;
}
