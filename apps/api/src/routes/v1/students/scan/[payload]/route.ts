import { getSessionUser } from "@repo/server-core/erp-auth/session";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { resolveStudentScan } from "@repo/server-core/services/students/student-scan";

// The card-scan page's read. Session-optional: the viewer (or null) decides
// the disclosure tier inside resolveStudentScan, never here.
export const GET = withErrors(async (_req, ctx) => {
  const viewer = await getSessionUser();
  const payload = (await ctx.params).payload!;
  return ok(await resolveStudentScan(decodeURIComponent(payload), viewer));
});
