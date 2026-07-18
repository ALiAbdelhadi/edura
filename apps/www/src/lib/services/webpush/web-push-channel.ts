import webpush from "web-push";
import { platformDb } from "@/lib/db/scope";

type WebPushMessage = {
  title: string;
  body: string;
  url?: string;
  data?: Record<string, string>;
};

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

async function sendToSubscription(
  sub: { endpoint: string; p256dh: string; auth: string },
  message: WebPushMessage,
): Promise<"ok" | "gone" | "error"> {
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
    return "ok";
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    return "error";
  }
}

export async function webPushToUser(
  userId: string,
  message: WebPushMessage,
): Promise<void> {
  if (!ensureVapid()) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[webpush] VAPID keys not set; skipping push delivery");
    }
    return;
  }

  const subs = await platformDb((tx) =>
    tx.webPushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    }),
  );
  if (subs.length === 0) return;

  const staleIds: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      const result = await sendToSubscription(s, message);
      if (result === "gone") staleIds.push(s.id);
    }),
  );

  if (staleIds.length > 0) {
    await platformDb((tx) =>
      tx.webPushSubscription.deleteMany({ where: { id: { in: staleIds } } }),
    );
  }
}
