import { z } from "zod";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { createManualStudent, listTeacherStudents } from "@/lib/services/external-teachers";

export const dynamic = "force-dynamic";

/**
 * An off-system teacher's students.
 *
 * RECEPTION-level: registering a child for a teacher is exactly the front
 * desk's job, and it is the same tier that already runs walk-in registration
 * and counter check-in.
 */
export const GET = centerStaff(
  async (_req, ctx, { acting }) => {
    const { teacherId } = (await ctx.params) as { teacherId: string };
    return ok(await listTeacherStudents(acting, teacherId));
  },
  { allow: RECEPTION },
);

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(20).nullish(),
  // 14 digits, and the service normalises + validates it before it can ever
  // reach the UNIQUE index — a mistyped national ID does not merely store
  // badly, it permanently blocks the real owner of that number.
  nationalId: z.string().trim().min(14).max(20).nullish(),
  guardianName: z.string().trim().max(120).nullish(),
  guardianPhone: z.string().trim().min(6).max(20).nullish(),
  guardianEmail: z.email().nullish(),
  gradeLevelId: z.uuid().nullish(),
  /** Enrol into one of this teacher's groups in the same step. */
  courseId: z.uuid().nullish(),
});

/**
 * Register a student for this teacher — reusing the existing child whenever a
 * dedup key matches. There is deliberately NO "create anyway" flag: an override
 * like that is how the duplicate gets created at 6pm on a busy evening, and a
 * duplicated child means two attendance histories and two wallets that no
 * report can ever add back together.
 *
 * `created: false` in the response means an existing record was reused; the UI
 * should say so rather than silently pretending it made something new.
 */
export const POST = centerStaff(
  async (req, ctx, actor) => {
    const { teacherId } = (await ctx.params) as { teacherId: string };
    const data = await parseJson(req, createSchema);
    return ok(await createManualStudent(actor, teacherId, data), { status: 201 });
  },
  { allow: RECEPTION },
);
