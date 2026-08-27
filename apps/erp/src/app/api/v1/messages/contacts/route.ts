import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { listContacts } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireSession();
  const url = new URL(req.url);
  const contacts = await listContacts(user, {
    search: url.searchParams.get("search") ?? undefined,
    limit: url.searchParams.get("limit")
      ? Number(url.searchParams.get("limit"))
      : undefined,
  });
  return ok(contacts);
});
