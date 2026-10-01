import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  createConversation,
  listConversations,
} from "@repo/server-core/services/messages/messages";

export const GET = withErrors(async (req) => {
  const user = await requireSession();
  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const limit = url.searchParams.get("limit");
  const result = await listConversations(user, {
    before: before ? new Date(before) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  return ok(result.conversations, { meta: { hasMore: result.hasMore } });
});

const createSchema = z.object({ recipientId: z.uuid() });

export const POST = withErrors(async (req) => {
  const user = await requireSession();
  const { recipientId } = await parseJson(req, createSchema);
  const conversation = await createConversation(user, recipientId);
  return ok(conversation, { status: 201 });
});
