import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  createConversation,
  listConversations,
} from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

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
