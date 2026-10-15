import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { PUBLIC_CACHE, withPublicCache } from "@repo/server-core/http/public-cache";
import { getAllActiveSubjects } from "@repo/server-core/services/catalog/catalog-cache";

export const GET = withPublicCache(withErrors(async () => {
  return ok(await getAllActiveSubjects());
}), PUBLIC_CACHE.catalog);
