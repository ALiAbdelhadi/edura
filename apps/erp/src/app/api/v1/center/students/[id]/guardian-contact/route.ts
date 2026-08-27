import { z } from "zod";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { platformDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
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

async function assertOnRoster(centerId: string, studentId: string) {
  const row = await platformDb((tx) =>
    tx.centerStudentRoster.findFirst({
      where: { centerId, studentId },
      select: { id: true },
    }),
  );
  if (!row) throw new NotFoundError("Student is not on this center's roster");
}

export const GET = centerStaff(
  async (_req, ctx, { acting }) => {
    const { id } = await ctx.params;
    await assertOnRoster(acting.centerId as string, id as string);
    return ok(await getGuardianContactStatus(id as string));
  },
  { allow: RECEPTION },
);

export const POST = withRateLimit(
  centerStaff(
    async (req, ctx, { acting }) => {
      const { id } = await ctx.params;
      await assertOnRoster(acting.centerId as string, id as string);
      const body = await parseJson(req, bodySchema);
      return ok(await setGuardianContact(acting, id as string, body));
    },
    { allow: RECEPTION },
  ),
  20,
  20,
);
