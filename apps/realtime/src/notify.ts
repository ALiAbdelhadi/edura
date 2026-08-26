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
  })
    .then((res) => {
      // fetch resolves on 4xx/5xx, so a secret mismatch or app-side failure
      // would otherwise drop the notification with no trace in the logs.
      if (!res.ok) {
        console.error("[notify-offline]", input.recipientId, `app responded ${res.status}`);
      }
    })
    .catch((err) => {
      console.error("[notify-offline]", input.recipientId, err?.message ?? err);
    });
}
