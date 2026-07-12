import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { listTeacherBlacklist, teacherBlacklistStudent } from "@/lib/services/blacklist/blacklist";

export const dynamic = "force-dynamic";

// Teacher blacklist list/add (PRD §7). teacher.
export const GET = withErrors(async () => {
  const user = await requireRole("teacher");
  return ok(await listTeacherBlacklist(user.id));
});

const bodySchema = z.object({
  studentId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("teacher");
  const { studentId, reason } = await parseJson(req, bodySchema);
  return ok(await teacherBlacklistStudent(studentId, reason, user), { status: 201 });
});
