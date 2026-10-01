import type { Prisma } from "@repo/database";
import { scopedDb } from "../../db/scope";
import { NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";

export type NotificationListQuery = {
  type?: string;
  read?: boolean;
  page: number;
  limit: number;
};

export async function listNotifications(user: SessionUser, query: NotificationListQuery) {
  const { page, limit } = query;
  const where: Prisma.NotificationWhereInput = { userId: user.id };
  if (query.type) where.type = query.type as Prisma.NotificationWhereInput["type"];
  if (query.read !== undefined) where.read = query.read;

  const [notifications, total] = await scopedDb(user, (tx) =>
    Promise.all([
      tx.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.notification.count({ where }),
    ]),
  );
  return { notifications, total };
}

export async function markNotificationRead(user: SessionUser, id: string) {
  return scopedDb(user, (tx) =>
    tx.notification
      .update({ where: { id, userId: user.id }, data: { read: true } })
      .catch((err: unknown) => {
        if ((err as { code?: string } | null)?.code === "P2025") {
          throw new NotFoundError("Notification not found");
        }
        throw err;
      }),
  );
}

export async function markAllNotificationsRead(user: SessionUser) {
  const result = await scopedDb(user, (tx) =>
    tx.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    }),
  );
  return result.count;
}
