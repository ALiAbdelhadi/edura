import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { registerDeviceToken } from "@/lib/services/notifications/push-registration";

export const dynamic = "force-dynamic";

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
