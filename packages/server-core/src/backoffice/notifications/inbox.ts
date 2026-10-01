import { scopedDb } from "../../db/scope";
import { NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";

export {
  listNotifications,
  markAllNotificationsRead,
  type NotificationListQuery,
} from "../../services/notifications/inbox";

export async function markBackofficeNotificationRead(user: SessionUser, id: string) {
  return scopedDb(user, async (tx) => {
    const existing = await tx.notification.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw new NotFoundError("Notification not found");
    return tx.notification.update({ where: { id }, data: { read: true } });
  });
}
