import { z } from "zod";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  getGuardianContactStatus,
  setGuardianContact,
} from "@repo/server-core/services/invites/guardian-contact";
import {
  assertStudentOnCenterRoster,
  recordGuardianContactView,
} from "@repo/server-core/services/students/guardian-contact-access";

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
      await recordGuardianContactView({
        centerId: acting.centerId as string,
        studentId: id as string,
        actorId,
        onBehalfOf: onBehalfOf ?? null,
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
      await assertStudentOnCenterRoster(acting.centerId as string, id as string);
      const body = await parseJson(req, bodySchema);
      return ok(await setGuardianContact(acting, id as string, body));
    },
    { allow: RECEPTION },
  ),
  20,
  20,
);
