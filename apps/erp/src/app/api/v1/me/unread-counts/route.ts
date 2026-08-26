import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { getUnreadCounts } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

/**
 * B.1#11 — unread counts for the caller: own messages + notifications, plus
 * (parents only) each minor child's own unread-message total, scoped exactly
 * to the oversight population. The badges themselves are the follow-up UI
 * session's; this route only makes an honest count exist.
 */
export const GET = withErrors(async () => {
  const user = await requireSession();
  return ok(await getUnreadCounts(user));
});
