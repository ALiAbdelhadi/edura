import { z } from "zod";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { platformDb } from "@/lib/db/scope";
import { assertOnCenterRoster } from "@repo/server-core/services/center/roster-membership";
import {
  getGuardianContactStatus,
  setGuardianContact,
} from "@/lib/services/invites/guardian-contact";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    guardianEmail: z.string().trim().toLowerCase().email().optional(),
    guardianPhone: z.string().trim().min(6).max(20).optional(),
  })
  .strict();

// A guardian's email and phone are the contact details of a specific child's
// parent, returned unmasked because a receptionist genuinely has to ring them.
// Unmasked access is made accountable rather than removed: every read is scoped to
// an ACTIVE roster row and leaves an audit row naming the reader.
export const GET = withRateLimit(
  centerStaff(
    async (_req, ctx, { acting, actorId, onBehalfOf }) => {
      const { id } = await ctx.params;
      await platformDb(async (tx) => {
        await assertOnCenterRoster(tx, acting.centerId as string, id as string);
        await tx.auditLog.create({
          data: {
            actorId,
            action: "student.guardian_contact_viewed",
            targetType: "student",
            targetId: id as string,
            centerId: acting.centerId as string,
            onBehalfOf: onBehalfOf ?? null,
          },
        });
      });
      return ok(await getGuardianContactStatus(id as string));
    },
    { allow: RECEPTION },
  ),
  20,
  20,
);

export const POST = withRateLimit(
  centerStaff(
    async (req, ctx, { acting }) => {
      const { id } = await ctx.params;
      await platformDb((tx) =>
        assertOnCenterRoster(tx, acting.centerId as string, id as string),
      );
      const body = await parseJson(req, bodySchema);
      return ok(await setGuardianContact(acting, id as string, body));
    },
    { allow: RECEPTION },
  ),
  20,
  20,
);
