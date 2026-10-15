import { platformDb } from "../../db/scope";
import { resolveWebPushDriver, type PushMessage } from "../push";

export async function webPushToUser(userId: string, message: PushMessage): Promise<void> {
  const driver = resolveWebPushDriver();
  if (driver.name === "mock") {
    await driver.deliver([], message);
    return;
  }

  const subs = await platformDb((tx) =>
    tx.webPushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    }),
  );
  if (subs.length === 0) return;

  const gone = await driver.deliver(subs, message);
  const staleIds = subs.filter((s) => gone.includes(s)).map((s) => s.id);

  if (staleIds.length > 0) {
    await platformDb((tx) =>
      tx.webPushSubscription.deleteMany({ where: { id: { in: staleIds } } }),
    );
  }
}
