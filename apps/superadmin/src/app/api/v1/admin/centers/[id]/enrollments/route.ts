import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminListEnrollments, adminEnrollStudent } from "@/lib/services/admin/center-academic";

export const dynamic = "force-dynamic";

const createSchema = z.object({ studentId: z.uuid(), courseId: z.uuid() }).strict();

export const GET = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await adminListEnrollments(user, id, q));
});

// Enrolling creates the ROSTER link only — no subscription, so it does not
// hand out paid coverage.
export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, createSchema);
  return ok(await adminEnrollStudent(user, id, body), { status: 201 });
});
