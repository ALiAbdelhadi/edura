import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listContactSubmissions } from "@/lib/services/admin/contact-submissions";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await listContactSubmissions(q));
});
