import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/site-origin";

/**
 * `robots.txt`, and its one real job here is pointing at the sitemap with an
 * ABSOLUTE url — the `Sitemap:` directive is the only line in the file that a
 * relative path is invalid for.
 *
 * Everything is allowed: this site is five marketing pages and two legal ones,
 * with no search surface, no user content and no authenticated area to keep
 * out of an index. The product app is a different origin with its own rules.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteOrigin()}/sitemap.xml`,
    host: siteOrigin(),
  };
}
