import { env } from "./env";

/**
 * The ERP route reads recipient, sender name and body from the message row
 * itself (SECURITY_AUDIT.md RT-02) — a compromised realtime host must not be
 * able to pick who gets told what. So the bridge sends only the two ids, and
 * anything more would be silently discarded on arrival.
 */
type OfflineNotifyInput = {
  conversationId: string;
  messageId: string;
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
      if (!res.ok) {
        console.error("[notify-offline]", input.messageId, `app responded ${res.status}`);
      }
    })
    .catch((err) => {
      console.error("[notify-offline]", input.messageId, err?.message ?? err);
    });
}
