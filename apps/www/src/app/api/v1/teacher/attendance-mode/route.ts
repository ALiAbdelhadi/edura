import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { delegated } from "@/lib/authz/teacher-actor";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { platformDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ mode: z.enum(["counter_only", "counter_and_door"]) })
  .strict();

export const GET = withErrors(async () => {
  const user = await requireRole("teacher");
  const profile = await platformDb((tx) =>
    tx.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { attendanceMode: true },
    }),
  );
  if (!profile) throw new NotFoundError("Teacher profile not found");
  return ok(profile);
});

/** The global per-teacher setting (approved decision #4). */
export const PATCH = delegated(async (req, _ctx, { acting: user }) => {
  const { mode } = await parseJson(req, bodySchema);
  const updated = await platformDb(
    (tx) =>
      tx.teacherProfile.update({
        where: { userId: user.id },
        data: { attendanceMode: mode },
        select: { attendanceMode: true },
      }),
    { actorId: user.id },
  );
  return ok(updated);
});
