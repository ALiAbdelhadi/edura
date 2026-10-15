export type PushMode = "mock" | "live";

export function pushMode(): PushMode {
  return (process.env.PUSH_MODE ?? "live").toLowerCase() === "mock" ? "mock" : "live";
}

export type PushChannel = "fcm" | "webpush";

export type PushMessage = {
  title: string;
  body: string;
  url?: string;
  data?: Record<string, string>;
};

export type WebPushTarget = { endpoint: string; p256dh: string; auth: string };

export type FcmTarget = string;

export interface PushDriver<Target> {
  readonly name: "mock" | "web_push" | "fcm";
  readonly channel: PushChannel;
  /** Delivers to every target; resolves to the targets the provider reported as gone. */
  deliver(targets: Target[], message: PushMessage): Promise<Target[]>;
}
