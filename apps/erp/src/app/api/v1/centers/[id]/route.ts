import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { getCenterPublicProfile } from "@/lib/services/public-handles/public-profiles";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  const id = (await ctx.params).id;
  return ok(await getCenterPublicProfile(id));
});
