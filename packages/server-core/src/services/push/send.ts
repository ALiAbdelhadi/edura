import { fcmToUser } from "../fcm/fcm-channel";
import { webPushToUser } from "../webpush/web-push-channel";
import type { PushMessage } from "./types";

export async function pushToUser(userId: string, message: PushMessage): Promise<void> {
  const data = message.data ?? {};
  await Promise.all([
    fcmToUser(userId, {
      title: message.title,
      body: message.body,
      data: message.url ? { ...data, url: message.url } : data,
    }).catch(() => {}),
    webPushToUser(userId, {
      title: message.title,
      body: message.body,
      url: message.url,
      data,
    }).catch(() => {}),
  ]);
}
