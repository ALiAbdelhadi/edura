import { PUBLIC_DATA_TAGS } from "@repo/server-core/cache/public-data";

export const CATALOG_CACHE_TAG = PUBLIC_DATA_TAGS.catalog;

export const CATALOG_CACHE_LIFE = { stale: 60, revalidate: 60, expire: 300 };

// The catalog is written only by apps/superadmin. A back-office write reaches
// this cache through the audit listener in apps/superadmin
// (lib/cache/erp-revalidate.ts), which posts the affected datasets to this app's
// /api/v1/internal/revalidate over INTERNAL_API_SECRET — closing
// docs/follow-ups.md #8.
//
// That makes an edit appear SOONER; it does not replace the bound. With the
// default per-process handler, one revalidation clears only the instance that
// received it, so `revalidate` (60s) stays the guarantee everywhere. Readers use
// "use cache: remote": where the platform provides a shared handler it is one
// cache across instances and a revalidation clears it for all; where it does
// not, Next falls back to the same in-memory handler as plain "use cache".
