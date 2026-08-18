import { delegatedWithCenter } from "@/lib/authz/teacher-actor";
import { ok } from "@/lib/http/envelope";
import { previewSessionSettlement } from "@/lib/services/finance/distribution";

export const dynamic = "force-dynamic";

// READ-ONLY twin of ./complete — what settling this lesson WOULD distribute.
// Same wrapper as the commit on purpose: the preview shows the lesson's price,
// the head-count and the frozen split, so it is not a lesser permission and is
// not guarded more loosely. The kernel re-checks the actor against the session
// itself (`assertMaySettle`), so this route holds no policy of its own.
export const GET = delegatedWithCenter(async (_req, ctx, { acting: user }) => {
  const { id } = await ctx.params;
  return ok(await previewSessionSettlement(id, user));
});
