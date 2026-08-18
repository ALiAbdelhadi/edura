import { scopedDb } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Registering a push channel — device tokens (FCM/APNs) and web-push
 * subscriptions.
 *
 * WHY THIS IS A SERVICE AND NOT INLINE IN THE ROUTE (M-2):
 * both routes used to hold a bare `upsert` on the unique credential
 * (`token` / `endpoint`) whose UPDATE branch set `userId` to the caller
 * unconditionally. Knowing another account's token was enough to repoint its
 * registration at yourself, after which the real owner silently stopped
 * receiving push notifications — for a parent, that means missing attendance
 * and child-safety alerts. Both DELETE routes already scoped by `userId`; the
 * POSTs were the only place that did not.
 *
 * The rule, in one place so both channels cannot drift apart:
 *
 *   - Same owner re-registering  -> scoped UPDATE of their own row, in place.
 *   - Anyone else (or an unknown credential) -> the existing row is DELETED and
 *     a fresh one created for the caller.
 *
 * A transfer stays possible on purpose: a device genuinely changes hands (a
 * shared family phone, a resold handset), and refusing would strand those
 * users. What is no longer possible is a SILENT repoint that leaves the
 * previous owner's row — and their platform/lastSeenAt, or in the web-push
 * case their encryption keys — attached to a different account.
 */

export type DeviceTokenInput = {
  token: string;
  platform: "ios" | "android" | "web";
};

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
};

/** "refreshed" = the caller already owned it; "registered" = a fresh row. */
export type RegistrationOutcome = "refreshed" | "registered";

export async function registerDeviceToken(
  user: SessionUser,
  input: DeviceTokenInput,
): Promise<RegistrationOutcome> {
  return scopedDb(user, async (tx) => {
    const refreshed = await tx.userDeviceToken.updateMany({
      where: { token: input.token, userId: user.id },
      data: { platform: input.platform, lastSeenAt: new Date() },
    });
    if (refreshed.count > 0) return "refreshed";

    await tx.userDeviceToken.deleteMany({ where: { token: input.token } });
    await tx.userDeviceToken.create({
      data: {
        userId: user.id,
        token: input.token,
        platform: input.platform,
        lastSeenAt: new Date(),
      },
    });
    return "registered";
  });
}

export async function registerPushSubscription(
  user: SessionUser,
  input: PushSubscriptionInput,
): Promise<RegistrationOutcome> {
  return scopedDb(user, async (tx) => {
    const refreshed = await tx.webPushSubscription.updateMany({
      where: { endpoint: input.endpoint, userId: user.id },
      data: {
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
        lastSeenAt: new Date(),
      },
    });
    if (refreshed.count > 0) return "refreshed";

    await tx.webPushSubscription.deleteMany({ where: { endpoint: input.endpoint } });
    await tx.webPushSubscription.create({
      data: {
        userId: user.id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
        lastSeenAt: new Date(),
      },
    });
    return "registered";
  });
}
