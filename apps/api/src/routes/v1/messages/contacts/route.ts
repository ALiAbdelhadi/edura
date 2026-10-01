import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { listContacts } from "@repo/server-core/services/messages/messages";

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
