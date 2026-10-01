import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { getCenterPublicProfileShared } from "@repo/server-core/services/public-handles/public-profiles-cache";

// Served from the shared public-data store (60s) with live enrollment counts,
// NOT from the CDN: the page shows seats taken and total students, which a CDN
// would hold for up to two minutes and which no revalidation can reach there.
export const GET = withErrors(async (_req, ctx) => {
  const id = (await ctx.params).id;
  return ok(await getCenterPublicProfileShared(id));
});
