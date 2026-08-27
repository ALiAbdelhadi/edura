import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  blockUser,
  listBlocks,
  unblockUser,
} from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

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
