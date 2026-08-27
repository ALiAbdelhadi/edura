import { z } from "zod";
import { delegatedWithCenter } from "@/lib/authz/teacher-actor";
import { MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { rejectCollaborationRequest } from "@/lib/services/collaboration/collaboration";

export const dynamic = "force-dynamic";

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
