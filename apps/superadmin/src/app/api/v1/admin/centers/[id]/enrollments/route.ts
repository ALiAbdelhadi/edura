import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { adminEnrollStudent, adminListEnrollments } from "@/lib/services/admin/center-academic";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({ studentId: z.uuid(), courseId: z.uuid() }).strict();

export const GET = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await adminListEnrollments(user, id, q));
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, createSchema);
  return ok(await adminEnrollStudent(user, id, body), { status: 201 });
});
