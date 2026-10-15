import { fcmDriver, isFcmConfigured } from "../fcm/fcm-driver";
import { isWebPushConfigured, webPushDriver } from "../webpush/web-push-driver";
import { mockPushDriver } from "./mock-driver";
import type { FcmTarget, PushDriver, WebPushTarget } from "./types";
import { pushMode } from "./types";

export type { PushDriver, PushMessage, PushChannel, PushMode, WebPushTarget, FcmTarget } from "./types";
export { pushMode } from "./types";

export function resolveWebPushDriver(): PushDriver<WebPushTarget> {
  if (pushMode() === "mock") return mockPushDriver("webpush", "PUSH_MODE=mock");
  if (!isWebPushConfigured()) return mockPushDriver("webpush", "VAPID keys not set");
  return webPushDriver;
}

export function resolveFcmDriver(): PushDriver<FcmTarget> {
  if (pushMode() === "mock") return mockPushDriver("fcm", "PUSH_MODE=mock");
  if (!isFcmConfigured()) return mockPushDriver("fcm", "FIREBASE_SERVICE_ACCOUNT_JSON not set");
  return fcmDriver;
}
