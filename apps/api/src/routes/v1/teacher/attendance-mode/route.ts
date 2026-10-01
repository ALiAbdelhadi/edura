import { z } from "zod";
import { delegated } from "@repo/server-core/authz/teacher-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  getTeacherAttendanceMode,
  setTeacherAttendanceMode,
} from "@repo/server-core/services/teacher/attendance-mode";

const bodySchema = z
  .object({ mode: z.enum(["counter_only", "counter_and_door"]) })
  .strict();

export const GET = delegated(async (_req, _ctx, { acting: user }) => {
  const profile = await getTeacherAttendanceMode(user);
  return ok(profile);
});

export const PATCH = delegated(async (req, _ctx, { acting: user }) => {
  const { mode } = await parseJson(req, bodySchema);
  const updated = await setTeacherAttendanceMode(user, mode);
  return ok(updated);
});
