import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireSession();
  const prefs = await scopedDb(user, (tx) =>
    tx.userPrefs.findUnique({ where: { userId: user.id } }),
  );
  return ok(prefs || { tourCompleted: false });
});

const patchSchema = z.object({ tourCompleted: z.boolean().optional() }).strict();

export const PATCH = withErrors(async (req) => {
  const user = await requireSession();
  const body = await parseJson(req, patchSchema);

  const prefs = await scopedDb(user, (tx) =>
    tx.userPrefs.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...body },
      update: body,
    }),
  );

  return ok(prefs);
});
