import { requireSession } from "@repo/server-core/erp-auth/session";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { getCatalogTree } from "@repo/server-core/services/catalog/catalog-cache";

export const GET = withErrors(async () => {
  await requireSession();
  return ok(await getCatalogTree());
});
