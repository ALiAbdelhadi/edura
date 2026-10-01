import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  adminGetStudent,
  adminUpdateStudent,
  adminRemoveStudent,
} from "@repo/server-core/backoffice/admin/center-people";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.email().optional(),
    phone: z.string().trim().max(20).optional(),
    operationalParentName: z.string().trim().max(120).optional(),
    operationalParentPhone: z.string().trim().max(20).optional(),
    blacklisted: z.boolean().optional(),
    blacklistReason: z.string().trim().max(500).optional(),
  })
  .strict();

export const GET = withRole("super_admin", async (user, _req, ctx) => {
  const { id, studentId } = await ctx.params;
  return ok(await adminGetStudent(user, id, studentId));
});

export const PATCH = withRole("super_admin", async (user, req, ctx) => {
  const { id, studentId } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  return ok(await adminUpdateStudent(user, id, studentId, body));
});

export const DELETE = withRole("super_admin", async (user, _req, ctx) => {
  const { id, studentId } = await ctx.params;
  return ok(await adminRemoveStudent(user, id, studentId));
});
