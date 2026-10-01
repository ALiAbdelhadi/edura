import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { adminListStaff, adminCreateStaff } from "@repo/server-core/backoffice/admin/center-people";

const createSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.email(),
    role: z.enum(["receptionist", "manager", "center_accountant"]),
    title: z.string().trim().max(120).optional(),
    locale: z.enum(["ar", "en"]).optional(),
  })
  .strict();

export const GET = withRole("super_admin", async (user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await adminListStaff(user, id));
});

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const data = await parseJson(req, createSchema);
  const result = await adminCreateStaff(user, id, data);
  return ok(
    {
      id: result.link.id,
      staffUserId: result.user.id,
      role: result.link.role,
      title: result.link.title,
      existingAccount: result.existingAccount,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        status: result.user.status,
      },
      invite: result.invite
        ? {
            delivery: result.invite.email.status,
            claimLink: result.invite.claimLink,
            expiresAt: result.invite.expiresAt,
          }
        : null,
    },
    { status: 201 },
  );
});
