import { PUBLIC_DATA_TAGS } from "../../cache/public-data";
import { cachedRead } from "../../cache/public-store";
import { readAllActiveSubjects, readCatalogTree, readSubjectsForGradeLevels } from "./catalog-read";

export const CATALOG_CACHE_TAG = PUBLIC_DATA_TAGS.catalog;

export const CATALOG_CACHE_LIFE = { stale: 60, revalidate: 60, expire: 300 };

// The shared-store layer over the catalog reads (cache/public-store.ts); the
// reads themselves are in catalog-read.ts and stay uncached for the DB suites.
//
// The catalog is written only by apps/superadmin. A back-office write reaches
// this cache through the audit listener in apps/superadmin
// (lib/cache/erp-revalidate.ts), which posts the affected datasets to
// /api/v1/internal/revalidate over INTERNAL_API_SECRET — closing
// docs/follow-ups.md #8. That makes an edit appear SOONER; `revalidate` (60s)
// stays the guarantee.

export function getCatalogTree() {
  return cachedRead(
    { tag: CATALOG_CACHE_TAG, name: "catalog.tree", ttlSeconds: CATALOG_CACHE_LIFE.revalidate },
    readCatalogTree,
  );
}

export function getAllActiveSubjects() {
  return cachedRead(
    { tag: CATALOG_CACHE_TAG, name: "catalog.allActiveSubjects", ttlSeconds: CATALOG_CACHE_LIFE.revalidate },
    readAllActiveSubjects,
  );
}

export function getSubjectsForGradeLevels(gradeLevelIds: string[]) {
  return cachedRead(
    {
      tag: CATALOG_CACHE_TAG,
      name: "catalog.subjectsForGradeLevels",
      args: [gradeLevelIds],
      ttlSeconds: CATALOG_CACHE_LIFE.revalidate,
    },
    () => readSubjectsForGradeLevels(gradeLevelIds),
  );
}
