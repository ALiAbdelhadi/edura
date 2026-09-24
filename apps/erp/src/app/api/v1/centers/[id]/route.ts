import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { getCenterPublicProfileShared } from "@/lib/services/public-handles/public-profiles-cache";

export const dynamic = "force-dynamic";

// Served from the server's "use cache" (60s) with live enrollment counts, NOT
// from the CDN: the page shows seats taken and total students, which a CDN would
// hold for up to two minutes and which no revalidation can reach there.
export const GET = withErrors(async (_req, ctx) => {
  const id = (await ctx.params).id;
  return ok(await getCenterPublicProfileShared(id));
});
