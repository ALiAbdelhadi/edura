import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { createBookingRequest } from "@/lib/services/bookings/classroom-bookings";

export const dynamic = "force-dynamic";
const schema = z.object({ classroom_id: z.string().uuid(), lesson_id: z.string().uuid() });

export const POST = withErrors(async (req) => {
  const user = await requireRole("teacher");
  const body = await parseJson(req, schema);
  return ok(await createBookingRequest({ classroomId: body.classroom_id, lessonId: body.lesson_id }, user), { status: 201 });
});
