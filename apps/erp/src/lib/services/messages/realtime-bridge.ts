import type {
  BridgeMessagePayload,
  BridgeReadPayload,
} from "@repo/database/chat-protocol";
import { requireDedicatedSecret } from "@/lib/config/secrets";

const REALTIME_INTERNAL_URL = (
  process.env.REALTIME_INTERNAL_URL ?? "http://localhost:3005"
).replace(/\/$/, "");

function internalSecret(): string {
  return requireDedicatedSecret("INTERNAL_API_SECRET");
}

async function post(path: string, body: unknown): Promise<unknown | null> {
  try {
    const res = await fetch(`${REALTIME_INTERNAL_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": internalSecret(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

export async function bridgeMessage(
  payload: BridgeMessagePayload,
): Promise<{ recipientOnline: boolean } | null> {
  const result = (await post("/internal/message", payload)) as {
    recipientOnline?: boolean;
  } | null;
  if (!result || typeof result.recipientOnline !== "boolean") return null;
  return { recipientOnline: result.recipientOnline };
}

export async function bridgeRead(payload: BridgeReadPayload): Promise<void> {
  await post("/internal/read", payload);
}
