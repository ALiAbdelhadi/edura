import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { registerDeviceToken } from "@repo/server-core/services/notifications/push-registration";

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android", "web"]),
});

export const POST = withErrors(async (req) => {
  const user = await requireSession();
  const data = await parseJson(req, registerSchema);

  await registerDeviceToken(user, data);

  return ok({ registered: true }, { status: 201 });
});
