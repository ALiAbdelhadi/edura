import { revalidateTag } from "next/cache";

export const CATALOG_CACHE_TAG = "catalog";

export const CATALOG_CACHE_LIFE = { stale: 60, revalidate: 60, expire: 300 };

export async function revalidateCatalogCache(): Promise<void> {
  revalidateTag(CATALOG_CACHE_TAG, { expire: CATALOG_CACHE_LIFE.expire });
}
