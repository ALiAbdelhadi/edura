import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  blockUser,
  listBlocks,
  unblockUser,
} from "@repo/server-core/services/messages/messages";

export const GET = withErrors(async () => {
  const user = await requireSession();
  return ok(await listBlocks(user));
});

const blockSchema = z.object({
  userId: z.uuid(),
  reason: z.string().max(500).optional(),
  conversationId: z.uuid().optional(),
});

export const POST = withErrors(async (req) => {
  const user = await requireSession();
  const data = await parseJson(req, blockSchema);
  return ok(
    await blockUser(user, data.userId, {
      reason: data.reason,
      conversationId: data.conversationId,
    }),
    { status: 201 },
  );
});

export const DELETE = withErrors(async (req) => {
  const user = await requireSession();
  const { userId } = await parseJson(req, z.object({ userId: z.uuid() }));
  return ok(await unblockUser(user, userId));
});
