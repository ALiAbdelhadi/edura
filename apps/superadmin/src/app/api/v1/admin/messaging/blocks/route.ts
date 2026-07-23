import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listBlocks } from "@/lib/services/admin/messaging";

export const dynamic = "force-dynamic";

// Platform-wide block list. Adult-blocks-minor events also raise a
// system-generated safety_concern report, so they surface in the reports queue
// as well as here.
export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
  const p = new URL(req.url).searchParams;
  return ok(
    await listBlocks({
      page: p.get("page") ?? undefined,
      limit: p.get("limit") ?? undefined,
      all: p.get("all") ?? undefined,
    }),
  );
});
