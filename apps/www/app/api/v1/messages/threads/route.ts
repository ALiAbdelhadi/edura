import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { listThreads } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireSession();

  const threads = await listThreads(user);
  return ok(threads);
});
