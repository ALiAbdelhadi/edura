import { platformDb } from "../../db/scope";
import { NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";

export type TeacherAttendanceMode = "counter_only" | "counter_and_door";

export async function getTeacherAttendanceMode(user: SessionUser) {
  const profile = await platformDb((tx) =>
    tx.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { attendanceMode: true },
    }),
  );
  if (!profile) throw new NotFoundError("Teacher profile not found");
  return profile;
}

export async function setTeacherAttendanceMode(user: SessionUser, mode: TeacherAttendanceMode) {
  return platformDb(
    (tx) =>
      tx.teacherProfile.update({
        where: { userId: user.id },
        data: { attendanceMode: mode },
        select: { attendanceMode: true },
      }),
    { actorId: user.id },
  );
}
