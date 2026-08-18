import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { requireCenterActor } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { convertToEnrolled, convertToExternal } from "@/lib/services/external-teachers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ teacherId: string }> };

/**
 * Move a teacher between off-system and on-platform.
 *
 * OWNER ONLY. Both directions change who may write the teacher's records and,
 * in one direction, close an account's login — decisions that belong with the
 * person who owns the commercial relationship, not the front desk.
 *
 * A REASON IS REQUIRED in both directions and lands in the append-only journal,
 * because months later "why is this teacher off-system again?" is exactly the
 * question nobody will be able to answer from the row alone.
 *
 * The response carries `recordsPreserved` — the counts observed inside the same
 * transaction as the flip. Nothing moved (the teacher keeps their user id), and
 * this is how the UI can say so with numbers rather than reassurance.
 */
const bodySchema = z.discriminatedUnion("to", [
  z.object({
    to: z.literal("enrolled"),
    // Optional here, but the service refuses the conversion when the teacher
    // ends up with no address at all — an `enrolled` teacher nobody can invite
    // is worse than an honest error.
    email: z.email().nullish(),
    reason: z.string().trim().min(3).max(500),
    locale: z.enum(["ar", "en"]).optional(),
  }),
  z.object({
    to: z.literal("external"),
    reason: z.string().trim().min(3).max(500),
  }),
]);

export const POST = withErrors(async (req, ctx) => {
  await requireRole("center_admin");
  const actor = await requireCenterActor();
  const { teacherId } = await (ctx as Ctx).params;
  const body = await parseJson(req, bodySchema);

  if (body.to === "enrolled") {
    return ok(
      await convertToEnrolled(actor, teacherId, {
        email: body.email ?? null,
        reason: body.reason,
        locale: body.locale,
      }),
    );
  }
  return ok(await convertToExternal(actor, teacherId, { reason: body.reason }));
});
