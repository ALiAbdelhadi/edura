import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminListStaff, adminCreateStaff } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

// No `password` field, deliberately — same as the center's own route. The staff
// member sets their own credential through the emailed single-use claim link,
// so nobody (owner or super admin) ever knows it.
const createSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.email(),
    role: z.enum(["receptionist", "manager", "center_accountant"]),
    title: z.string().trim().max(120).optional(),
    locale: z.enum(["ar", "en"]).optional(),
  })
  .strict();

export const GET = withErrors(async (_req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await adminListStaff(user, id));
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
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
