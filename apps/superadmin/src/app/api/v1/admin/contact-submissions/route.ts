import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { listContactSubmissions } from "@/lib/services/admin/contact-submissions";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await listContactSubmissions(q));
});
