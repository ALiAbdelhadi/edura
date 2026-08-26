import { z } from "zod";
import { delegated } from "@/lib/authz/teacher-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { platformDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ mode: z.enum(["counter_only", "counter_and_door"]) })
  .strict();

/**
 * T-2: `delegated()`, matching its own PATCH below. The old
 * `requireRole("teacher")` GET meant an assistant could CHANGE the attendance
 * mode but not READ it — so the assistant's settings card could not show the
 * value it may edit, and the door screen's counter-only notice (the one that
 * says the door adds nothing here) silently never rendered for the very
 * person standing at that door (the fetch 403'd into a catch).
 */
export const GET = delegated(async (_req, _ctx, { acting: user }) => {
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
