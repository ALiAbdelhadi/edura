import webpush from "web-push";
import type { PushDriver, WebPushTarget } from "../push/types";

let vapidConfigured = false;

export function isWebPushConfigured(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export const webPushDriver: PushDriver<WebPushTarget> = {
  name: "web_push",
  channel: "webpush",
  async deliver(targets, message) {
    const gone: WebPushTarget[] = [];
    await Promise.all(
      targets.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({
              title: message.title,
              body: message.body,
              url: message.url ?? "/",
              data: message.data ?? {},
            }),
          );
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(sub);
        }
      }),
    );
    return gone;
  },
};
