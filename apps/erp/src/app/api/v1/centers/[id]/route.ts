import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { getCenterPublicProfile } from "@/lib/services/public-handles/public-profiles";

export const dynamic = "force-dynamic";

// Session-less. The status gate and the meeting-link redaction live in the
// service, which /p/[handle] and the tenant subdomain share.
export const GET = withErrors(async (_req, ctx) => {
  const id = (await ctx.params).id;
  return ok(await getCenterPublicProfile(id));
});
