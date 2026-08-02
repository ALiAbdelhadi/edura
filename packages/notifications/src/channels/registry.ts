import { emailChannel } from "./email";
import type { ChannelId, NotificationChannel } from "../types";

// =============================================================================
// The channel registry.
//
// THIS ARRAY IS THE WHOLE "zero refactor" CLAIM. Shipping WhatsApp is:
//   1. write `whatsappChannel` satisfying NotificationChannel (it delegates to
//      the existing @repo/server-core/services/whatsapp/send abstraction, which
//      already has a mock driver and a Cloud API driver),
//   2. add a `whatsapp:` renderer to the templates Meta has approved,
//   3. push it into this array,
//   4. set NOTIFICATION_CHANNELS=email,whatsapp.
//
// No dispatcher change, no template-type change, no call-site change.
// `tests/channel-pluggability.test.ts` proves step 3 is sufficient by
// registering a synthetic channel and asserting the fan-out reaches it.
// =============================================================================

const BUILT_IN: NotificationChannel[] = [emailChannel];

/** Test/extension seam. Keeps the built-ins immutable to normal callers. */
const extra: NotificationChannel[] = [];

export function registerChannel(channel: NotificationChannel): () => void {
  extra.push(channel);
  return () => {
    const i = extra.indexOf(channel);
    if (i >= 0) extra.splice(i, 1);
  };
}

export function allChannels(): NotificationChannel[] {
  return [...BUILT_IN, ...extra];
}

export function getChannel(id: ChannelId): NotificationChannel | undefined {
  return allChannels().find((c) => c.id === id);
}
