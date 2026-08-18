import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";

export const dynamic = "force-dynamic";

/**
 * The back office's own `me/prefs`, mirroring www's.
 *
 * `user_prefs` is a SHARED table keyed on the user, so this needed no
 * migration — only a door in this app, which had none. It is a door and not an
 * import because the two apps carry different sessions by construction
 * (distinct cookie names AND distinct signing secrets), so a back-office
 * account cannot read its preference through www's route.
 *
 * The only field is `tourCompleted`, which is what the first-run guided tour
 * reads to decide whether to offer itself. Nothing else belongs here: a
 * preferences endpoint that grows fields is a preferences endpoint someone
 * eventually writes something sensitive into.
 */

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
