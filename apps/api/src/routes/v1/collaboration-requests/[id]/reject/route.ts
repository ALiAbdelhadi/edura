import { z } from "zod";
import { delegatedWithCenter } from "@repo/server-core/authz/teacher-actor";
import { MANAGER } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { rejectCollaborationRequest } from "@repo/server-core/services/collaboration/collaboration";

const bodySchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();

export const POST = delegatedWithCenter(
  async (req, ctx, { acting: user }) => {
    const { id } = await ctx.params;
    const len = req.headers.get("content-length");
    const body = !len || len === "0" ? {} : await parseJson(req, bodySchema);
    return ok(await rejectCollaborationRequest(id, (body as { reason?: string }).reason, user));
  },
  { staffAllow: MANAGER },
);
