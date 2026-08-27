import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminListStudents, adminAddStudent } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

const addSchema = z.object({ studentId: z.uuid() }).strict();

export const GET = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok({ items: await adminListStudents(user, id, q) });
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { studentId } = await parseJson(req, addSchema);
  return ok(await adminAddStudent(user, id, studentId), { status: 201 });
});
