import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { listContacts } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

// "Who can I start a conversation with?" — mirrors the conversation matrix +
// relationship gates. Search-first: rosters can hold thousands of students.
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
