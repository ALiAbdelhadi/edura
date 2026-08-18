import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { buildProfileChecklist } from "@repo/server-core/services/students/student-card";

export const dynamic = "force-dynamic";

/**
 * اكتمال الملف — the LIGHT read the card screen opens with.
 *
 * Split out of `me/student-card` (2026-08-09) so opening the page costs one
 * cheap query pair and builds NO card: no QR signed, no credential columns
 * read, nothing rendered that the student has not asked for.
 *
 * It carries `cardAvailable`, which is the whole point — the screen can offer
 * the "show my card" button, or explain what is missing, without ever
 * requesting a card the server would refuse.
 *
 * `?studentId=` is the same convention `me/guardian-contact` uses for a parent
 * acting for a child; whether that is allowed is decided inside
 * `buildProfileChecklist`, not here.
 */
export const GET = withErrors(async (req) => {
  const session = await requireSession();
  const studentId = new URL(req.url).searchParams.get("studentId") ?? session.id;
  return ok(await buildProfileChecklist(studentId, session));
});
