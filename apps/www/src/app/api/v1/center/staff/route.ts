import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { createStaff, listStaff } from "@/lib/services/center/staff";

export const dynamic = "force-dynamic";

// Owner-only (requireRole("center_admin")). Staff-management is HARD EXCLUSION
// #4 — a center_staff caller 403s here by default-closed design (this route is
// never opened via center-actor).

export const GET = withErrors(async () => {
  const user = await requireRole("center_admin");
  return ok(await listStaff(user));
});

// No `password` field, deliberately: the center owner never chooses their staff
// member's credential. The staff member sets it themselves via the emailed
// single-use claim link (see services/center/staff.ts).
const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email(),
  role: z.enum(["receptionist", "manager", "center_accountant"]),
  title: z.string().trim().max(120).optional(),
  locale: z.enum(["ar", "en"]).optional(),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const data = await parseJson(req, createSchema);
  const result = await createStaff(user, data);
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
