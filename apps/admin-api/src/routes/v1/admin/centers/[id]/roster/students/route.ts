import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { adminListStudents, adminAddStudent } from "@repo/server-core/backoffice/admin/center-people";

const addSchema = z.object({ studentId: z.uuid() }).strict();

export const GET = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok({ items: await adminListStudents(user, id, q) });
});

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const { studentId } = await parseJson(req, addSchema);
  return ok(await adminAddStudent(user, id, studentId), { status: 201 });
});
