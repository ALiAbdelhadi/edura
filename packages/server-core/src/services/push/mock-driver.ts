import type { PushChannel, PushDriver } from "./types";

export function mockPushDriver<Target>(channel: PushChannel, reason: string): PushDriver<Target> {
  return {
    name: "mock",
    channel,
    async deliver() {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[${channel}] ${reason}; skipping push delivery`);
      }
      return [];
    },
  };
}
