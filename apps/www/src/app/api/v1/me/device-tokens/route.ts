import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { scopedDb } from "@/lib/db/scope";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android", "web"]),
});

export const POST = withErrors(async (req) => {
  const user = await requireSession();
  const data = await parseJson(req, registerSchema);

  await scopedDb(user, (tx) =>
    tx.userDeviceToken.upsert({
      where: { token: data.token },
      create: {
        userId: user.id,
        token: data.token,
        platform: data.platform,
        lastSeenAt: new Date(),
      },
      update: {
        userId: user.id,
        platform: data.platform,
        lastSeenAt: new Date(),
      },
    }),
  );

  return ok({ registered: true }, { status: 201 });
});
