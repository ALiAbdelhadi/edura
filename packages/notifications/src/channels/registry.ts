import { emailChannel } from "./email";
import type { ChannelId, NotificationChannel } from "../types";

const BUILT_IN: NotificationChannel[] = [emailChannel];

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
