import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listContactSubmissions } from "@repo/server-core/backoffice/admin/contact-submissions";

export const GET = withRole("super_admin", async (_user, req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await listContactSubmissions(q));
});
