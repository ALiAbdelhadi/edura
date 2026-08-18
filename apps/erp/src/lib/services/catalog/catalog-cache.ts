import { revalidateTag } from "next/cache";

/**
 * Cache identity + invalidation for the Egyptian education catalog.
 *
 * WHAT IS CACHED — only the permanent reference tables that CLAUDE.md
 * designates as catalog data: education_systems, education_stages,
 * grade_levels, tracks, grade_tracks, subjects, subject_offerings. These
 * survive the pre-launch wipe and are not `is_demo`-flagged.
 *
 * WHAT IS NOT — nothing that reads money, wallets, subscriptions, attendance,
 * messaging, auth, or any per-user row. In particular `commission_settings`
 * LOOKS like reference data and is deliberately excluded: it is a rate that
 * multiplies money, and a stale rate silently mis-splits revenue.
 *
 * Auth is never cached. The routes stay `force-dynamic` and still run
 * `requireSession()` on every single request; only the catalog query RESULT
 * behind that gate is memoised. Caching a function is not caching a response.
 */
export const CATALOG_CACHE_TAG = "catalog";

/**
 * Cache window for every `"use cache"` catalog function.
 *
 * Short on purpose. Catalog writes happen in the SEPARATE superadmin app, so
 * `revalidateTag` cannot reach this cache (see below) — this window IS the
 * cross-app freshness guarantee, not a performance tuning knob:
 *
 *   revalidate 60  — background refresh once a minute under traffic
 *   expire     300 — HARD ceiling; past this an entry must be refetched
 *                    (blocking), never served stale
 *   stale      60  — client router may reuse for at most a minute
 *
 * Lengthening it would buy almost nothing: the win here is collapsing repeated
 * reads of an expensive 5-join query, which a 60s window already captures.
 */
export const CATALOG_CACHE_LIFE = { stale: 60, revalidate: 60, expire: 300 };

/**
 * INVALIDATION MODEL — read this before assuming a write propagates instantly.
 *
 * www and superadmin are two SEPARATE Next.js applications (own build, own
 * process, own subdomain — decision #1 in CLAUDE.md), and `use cache` entries
 * live in each app's own cache. Catalog READS are cached here in www; catalog
 * WRITES happen in superadmin. `revalidateTag` cannot cross that process
 * boundary, so tag invalidation alone does NOT make a superadmin edit appear
 * in www.
 *
 * Closing that gap properly needs either a shared cache handler (the Redis
 * store M3 introduces) or a new internal HTTP bridge from superadmin. Both are
 * larger changes than the caching itself and the bridge would put a network
 * call on a write path, so neither is in this batch.
 *
 * Instead the cross-app bound is enforced by a SHORT cacheLife (see
 * catalog-read.ts): revalidate 60s, hard expire 300s. www therefore can never
 * serve catalog data more than 5 minutes old, and refreshes within ~60s under
 * normal traffic. That costs almost nothing in benefit — the win comes from
 * collapsing repeated concurrent reads, not from long retention — while
 * removing nearly all staleness risk.
 *
 * This helper is the in-process invalidation point. It is exported so that any
 * www-side catalog write, and a future superadmin bridge, has one place to
 * call. Today www has no catalog-write path, so nothing calls it in
 * production; the proof suite exercises it.
 */
export async function revalidateCatalogCache(): Promise<void> {
  // Next 16 requires the caller to state the expiry the purge should apply.
  // Reuse the same ceiling the entries were written with so the two can never
  // drift apart.
  revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_CACHE_LIFE.expire });
}
