import { platformDb } from "../../db/scope";
import { resolveFcmDriver, type PushMessage } from "../push";

export const FCM_PUSH_TYPES = new Set([
  "absence_marked",
  "session_cancelled",
  "session_postponed",
  "course_cancelled",
  "grade_entered",
  "material_uploaded",
  "payment_recorded",
  "enrollment_request_approved",
  "enrollment_request_declined",
  "admin_broadcast",
]);

export async function fcmToUser(userId: string, message: PushMessage): Promise<void> {
  const [devices, user] = await platformDb((tx) =>
    Promise.all([
      tx.userDeviceToken.findMany({ where: { userId }, select: { token: true } }),
      tx.user.findUnique({ where: { id: userId }, select: { fcmToken: true } }),
    ]),
  );
  const tokens = [...new Set([...devices.map((d) => d.token), ...(user?.fcmToken ? [user.fcmToken] : [])])];
  if (tokens.length === 0) return;

  const invalid = await resolveFcmDriver().deliver(tokens, message);

  if (invalid.length > 0) {
    await platformDb((tx) =>
      Promise.all([
        tx.userDeviceToken.deleteMany({ where: { token: { in: invalid } } }),
        tx.user.updateMany({ where: { fcmToken: { in: invalid } }, data: { fcmToken: null } }),
      ]),
    );
  }
}
