import { z } from "zod";
import { delegated } from "@/lib/authz/teacher-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { listTeacherBlacklist, teacherBlacklistStudent } from "@/lib/services/blacklist/blacklist";

export const dynamic = "force-dynamic";

export const GET = delegated(async (_req, _ctx, { acting: user }) => {
  return ok(await listTeacherBlacklist(user.id));
});

const bodySchema = z.object({
  studentId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
});

export const POST = delegated(async (req, _ctx, { acting: user }) => {
  const { studentId, reason } = await parseJson(req, bodySchema);
  return ok(await teacherBlacklistStudent(studentId, reason, user), { status: 201 });
});
