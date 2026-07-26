import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { setCenterRoomActive } from "@/lib/services/admin/center-control";

// Soft activate/deactivate of a hall — never a hard delete, so its sessions
// and settlement records keep resolving.
export const dynamic = "force-dynamic";

const schema = z.object({ isActive: z.boolean() }).strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id, roomId } = await ctx.params;
  const { isActive } = await parseJson(req, schema);
  return ok(await setCenterRoomActive(id, roomId, isActive, user));
});
