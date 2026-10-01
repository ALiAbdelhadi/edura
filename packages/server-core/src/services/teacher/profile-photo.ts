import { scopedDb } from "../../db/scope";
import { NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";

export async function getTeacherPhotoUrl(user: SessionUser) {
  const profile = await scopedDb(user, (tx) =>
    tx.teacherProfile.findUnique({ where: { userId: user.id }, select: { photoUrl: true } }),
  );
  if (!profile) throw new NotFoundError("Teacher profile not found");
  return { photoUrl: profile.photoUrl };
}
