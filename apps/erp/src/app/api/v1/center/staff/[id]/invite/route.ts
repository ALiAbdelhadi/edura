import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { resendStaffInvite } from "@/lib/services/center/staff";

export const dynamic = "force-dynamic";

// Owner-only, exactly like POST /center/staff. Staff-management is HARD
// EXCLUSION #4 — a center_staff caller 403s here by default-closed design, so
// a receptionist can never re-issue a colleague's claim link.

const bodySchema = z
  .object({ locale: z.enum(["ar", "en"]).optional() })
  .strict();

/**
 * Re-send a staff member's claim link. A re-send mints a fresh token that
 * invalidates the previous one. Refused once the staff member has set a
 * password — the owner does not get a reset door over their own staff.
 */
export const POST = withRateLimit(
  withErrors(async (req, ctx) => {
    const owner = await requireRole("center_admin");
    const { id } = await ctx.params;
    const { locale } = await parseJson(req, bodySchema).catch(() => ({
      locale: undefined as "ar" | "en" | undefined,
    }));
    const invite = await resendStaffInvite(owner, id as string, locale ?? "ar");
    return ok({
      delivery: invite.email.status,
      claimLink: invite.claimLink,
      expiresAt: invite.expiresAt,
    });
  }),
  10,
  10,
);
