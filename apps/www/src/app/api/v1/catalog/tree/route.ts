import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { getCatalogTree } from "@/lib/services/catalog/catalog-read";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  await requireSession();
  return ok(await getCatalogTree());
});
