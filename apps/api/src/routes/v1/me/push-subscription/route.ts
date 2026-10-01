import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  registerPushSubscription,
  unregisterPushSubscription,
} from "@repo/server-core/services/notifications/push-registration";

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

  await registerPushSubscription(user, {
    endpoint: data.endpoint,
    p256dh: data.keys.p256dh,
    auth: data.keys.auth,
    userAgent,
  });

  return ok({ subscribed: true }, { status: 201 });
});

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

export const DELETE = withErrors(async (req) => {
  const user = await requireSession();
  const data = await parseJson(req, unsubscribeSchema);

  await unregisterPushSubscription(user, data.endpoint);
  return ok({ unsubscribed: true });
});
