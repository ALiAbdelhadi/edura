export const CATALOG_CACHE_TAG = "catalog";

export const CATALOG_CACHE_LIFE = { stale: 60, revalidate: 60, expire: 300 };

// There is deliberately NO revalidator for this tag, and the 300s expire above
// is the real freshness guarantee for the catalog in this app.
//
// A `revalidateCatalogCache()` calling `revalidateTag` stood here and nothing
// ever called it — because nothing in this app CAN. The catalog is written only
// by apps/superadmin (`/api/v1/admin/catalog/**`), and `revalidateTag`
// invalidates the cache of the process that runs it, so a back-office edit can
// never reach the ERP's. Closing that gap needs an internal revalidate endpoint
// here, called by the back office over INTERNAL_API_SECRET the way chat-notify
// is — a caching mechanism, which CLAUDE.md defers to the post-launch rendering
// and caching pass. Until then a catalog edit shows up in the ERP within five
// minutes, which is acceptable for reference data that changes a few times a
// year. Accepted on purpose (docs/follow-ups.md #8), not forgotten.
