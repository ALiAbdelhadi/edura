import { scopedDb } from "../../db/scope";
import { NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";

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

export async function unregisterDeviceToken(user: SessionUser, token: string): Promise<void> {
  const result = await scopedDb(user, (tx) =>
    tx.userDeviceToken.deleteMany({
      where: { token, userId: user.id },
    }),
  );
  if (result.count === 0) throw new NotFoundError("Device token not found");
}

export async function unregisterPushSubscription(user: SessionUser, endpoint: string): Promise<void> {
  const result = await scopedDb(user, (tx) =>
    tx.webPushSubscription.deleteMany({
      where: { endpoint, userId: user.id },
    }),
  );
  if (result.count === 0) throw new NotFoundError("Push subscription not found");
}
