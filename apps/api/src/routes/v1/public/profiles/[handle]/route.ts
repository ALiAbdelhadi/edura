import { NotFoundError } from "@repo/server-core/errors/classes";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { publicProfileForRequest } from "@repo/server-core/services/public-handles/public-profile-for-request";

// /p/[handle]'s read. The gate serves anonymous visitors from the shared
// public-data store and editors fresh; this route reads the session on the
// cookie branch, so it is never CDN-cached (public-cache.ts): every answer
// carries ok()'s no-store.
export const GET = withErrors(async (req, ctx) => {
  const handle = (await ctx.params).handle!;
  const profile = await publicProfileForRequest(handle, req.headers.get("cookie"));
  if (!profile) throw new NotFoundError();
  return ok(profile);
});
