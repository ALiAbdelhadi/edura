import { scopedDb } from "../../db/scope";
import type { SessionUser } from "../../auth/types";

export type UserPrefsPatch = { tourCompleted?: boolean };

export async function getUserPrefs(user: SessionUser) {
  const prefs = await scopedDb(user, (tx) =>
    tx.userPrefs.findUnique({ where: { userId: user.id } }),
  );
  return prefs || { tourCompleted: false };
}

export async function updateUserPrefs(user: SessionUser, body: UserPrefsPatch) {
  return scopedDb(user, (tx) =>
    tx.userPrefs.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...body },
      update: body,
    }),
  );
}
