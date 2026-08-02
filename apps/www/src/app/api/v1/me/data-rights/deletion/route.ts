import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  getDeletionEligibility,
  getMyDeletionRequests,
  requestAccountDeletion,
} from "@repo/server-core/services/data-rights/account-deletion";

export const dynamic = "force-dynamic";

/**
 * Eligibility AND history in one call.
 *
 * Eligibility is returned rather than inferred client-side because the reason
 * a button is missing matters: "you are registered as a minor, your guardian
 * asks for this" is a different message from "you already have a request under
 * review", and a UI that just hides the button says neither.
 */
export const GET = withErrors(async (req) => {
  const user = await requireSession();
  const studentId = new URL(req.url).searchParams.get("studentId") ?? undefined;
  const [eligibility, requests] = await Promise.all([
    getDeletionEligibility(user, studentId),
    getMyDeletionRequests(user, studentId),
  ]);
  return ok({ ...eligibility, requests });
});

const postSchema = z
  .object({
    studentId: z.string().uuid().optional(),
    reason: z.string().max(1000).optional(),
  })
  .strict();

export const POST = withErrors(async (req) => {
  const user = await requireSession();
  const body = await parseJson(req, postSchema);
  return ok(
    await requestAccountDeletion(user, { subjectUserId: body.studentId, reason: body.reason }),
    { status: 201 },
  );
});
