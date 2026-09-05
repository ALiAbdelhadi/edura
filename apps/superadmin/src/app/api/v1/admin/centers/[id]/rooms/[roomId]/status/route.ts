import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { setCenterRoomActive } from "@/lib/services/admin/center-control";

export const dynamic = "force-dynamic";

const schema = z.object({ isActive: z.boolean() }).strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id, roomId } = await ctx.params;
  const { isActive } = await parseJson(req, schema);
  return ok(await setCenterRoomActive(id, roomId, isActive, user));
});
