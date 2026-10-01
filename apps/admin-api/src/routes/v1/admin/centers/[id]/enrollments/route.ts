import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminEnrollStudent, adminListEnrollments } from "@repo/server-core/backoffice/admin/center-academic";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const createSchema = z.object({ studentId: z.uuid(), courseId: z.uuid() }).strict();

export const GET = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await adminListEnrollments(user, id, q));
});

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, createSchema);
  return ok(await adminEnrollStudent(user, id, body), { status: 201 });
});
