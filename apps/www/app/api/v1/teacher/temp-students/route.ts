import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { phoneSchema } from "@/lib/validation/common";
import { createTempStudent } from "@/lib/services/tempStudents/tempStudents";

export const dynamic = "force-dynamic";

// PRD §4.8 — teacher creates a temporary (invited) student.
const bodySchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: phoneSchema,
  grade: z.string().trim().max(50).optional(),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("teacher");
  const body = await parseJson(req, bodySchema);
  return ok(await createTempStudent(body, user), { status: 201 });
});
