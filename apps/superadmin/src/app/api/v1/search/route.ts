import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { backOfficeSearch } from "@/lib/services/admin/global-search";

export const dynamic = "force-dynamic";

/**
 * GLOBAL SEARCH — `GET /api/v1/search?q=…`
 *
 * BOTH back-office roles at the door, because this route serves providers whose
 * allow-lists differ: a single static list here could only be their UNION, so
 * the tier that matters is applied PER PROVIDER inside `backOfficeSearch`
 * (`PROVIDERS[].roles`). Same shape, and the same reason, as the reports export
 * (see `report-export.ts`, decision #3) and as the ERP's own search route.
 *
 * A super_admin viewing the finance portal through impersonation is the
 * accountant for this purpose too — `requireRole` reads the session that
 * impersonation minted, so the role in hand is the role the palette serves.
 */
export const GET = withErrors(async (req) => {
  const user = await requireRole("super_admin", "accountant");
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return ok(await backOfficeSearch(user, { q }));
});
