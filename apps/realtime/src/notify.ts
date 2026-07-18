// Offline recipients get a push/in-app notification. All notification
// machinery (web-push subscriptions, FCM, Notification rows, channel matrix)
// lives in the Next.js app — so we bridge to it instead of duplicating it.
// Fire-and-forget: a failed notification must never fail a message send.
import { env } from "./env";

export type OfflineNotifyInput = {
  recipientId: string;
  senderName: string;
  conversationId: string;
  messageId: string;
  body: string;
};

export function notifyOffline(input: OfflineNotifyInput): void {
  void fetch(`${env.appInternalUrl}/api/v1/internal/chat-notify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": env.internalSecret,
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(5000),
  }).catch((err) => {
    console.error("[notify-offline]", input.recipientId, err?.message ?? err);
  });
}
