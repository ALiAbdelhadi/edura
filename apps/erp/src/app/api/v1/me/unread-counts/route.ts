import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { getUnreadCounts } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireSession();
  return ok(await getUnreadCounts(user));
});
