import { revalidateTag } from "next/cache";
import {
  PUBLIC_DATA_TAGS,
  type PublicDataset,
} from "@repo/server-core/cache/public-data";

export { PUBLIC_DATA_TAGS, type PublicDataset };

// What an ERP write that changes a public listing or profile invalidates.
export const PUBLIC_WRITE: PublicDataset[] = ["discovery", "publicProfile"];

// Expires the given datasets NOW (`expire: 0`), so the next read refills them
// rather than being served the entry the write just made wrong.
//
// Call it only once the write has COMMITTED. Invalidating first would let a read
// that lands in between refill the cache from the pre-commit rows, and the edit
// would then sit invisible for a whole `revalidate` window. The wrapper below is
// the safe way to get that ordering.
//
// Never throws. The write it follows already succeeded; failing the request
// because a cache could not be told would report a saved change as an error.
// The data's own `revalidate` bound still holds either way.
export function invalidatePublicData(...datasets: PublicDataset[]): void {
  for (const tag of new Set(datasets.map((d) => PUBLIC_DATA_TAGS[d]))) {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch (err) {
      console.error(`[cache] could not invalidate "${tag}"`, err);
    }
  }
}

// Wraps a write route: runs it, and on a successful response (below 400)
// invalidates `datasets`. The handler has returned — so its transaction has
// committed — before anything is invalidated.
export function invalidatesPublicData<A extends unknown[], R extends Response>(
  handler: (...args: A) => R | Promise<R>,
  datasets: PublicDataset[] = PUBLIC_WRITE,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const res = await handler(...args);
    if (res.status < 400) invalidatePublicData(...datasets);
    return res;
  };
}
