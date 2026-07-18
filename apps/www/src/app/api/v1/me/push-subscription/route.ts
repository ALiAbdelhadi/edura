import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";

export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const POST = withErrors(async (req) => {
  const user = await requireSession();
  const data = await parseJson(req, subscribeSchema);
  const userAgent = req.headers.get("user-agent") ?? undefined;

  await scopedDb(user, (tx) =>
    tx.webPushSubscription.upsert({
      where: { endpoint: data.endpoint },
      create: {
        userId: user.id,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        userAgent,
        lastSeenAt: new Date(),
      },
      update: {
        userId: user.id,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        userAgent,
        lastSeenAt: new Date(),
      },
    }),
  );

  return ok({ subscribed: true }, { status: 201 });
});

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

// Body-based (not /push-subscription/[endpoint]) because a push endpoint is a
// full URL — putting it in a path segment would need double URL-encoding.
export const DELETE = withErrors(async (req) => {
  const user = await requireSession();
  const data = await parseJson(req, unsubscribeSchema);

  const result = await scopedDb(user, (tx) =>
    tx.webPushSubscription.deleteMany({
      where: { endpoint: data.endpoint, userId: user.id },
    }),
  );

  if (result.count === 0)
    throw new NotFoundError("Push subscription not found");
  return ok({ unsubscribed: true });
});
