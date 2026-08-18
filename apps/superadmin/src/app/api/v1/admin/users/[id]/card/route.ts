import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  buildStudentCard,
  reissueStudentCard,
  revokeStudentCard,
} from "@repo/server-core/services/students/student-card";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * بطاقة الطالب من الباك أوفيس — the back office's view of a student's card.
 *
 * ── GET IS A READ THAT LEAVES A ROW ────────────────────────────────────────
 *
 * `buildStudentCard` writes `student.card_viewed` for a super_admin, in the
 * same transaction as the read. That is not this route's decision to make or
 * to skip — it lives in the service so every caller inherits it, and so a
 * second surface cannot quietly become an unaudited door to the same data.
 *
 * ── AND IT IS FETCHED ONLY WHEN ASKED FOR ──────────────────────────────────
 *
 * Deliberately its own route rather than a field on the user record: the user
 * detail screen loads for every role, and folding a card build (plus an audit
 * write) into it would sign a QR and log a view for every teacher, parent and
 * center owner an operator ever opens. The screen calls this only when the
 * card section is expanded.
 */
export const GET = withErrors(async (_req, ctx) => {
  const actor = await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await buildStudentCard(id, actor));
});

/**
 * Reissue or revoke. Both demand a reason and both write an audit row — the
 * same discipline every other act on the user-detail screen carries, for the
 * same reason: a child's card refused at a counter with no recorded
 * explanation is one nobody can safely un-refuse.
 */
const bodySchema = z.object({
  action: z.enum(["reissue", "revoke"]),
  reason: z.string().trim().min(3).max(500),
});

export const POST = withErrors(async (req, ctx) => {
  const actor = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { action, reason } = await parseJson(req, bodySchema);
  return ok(
    action === "reissue"
      ? await reissueStudentCard(id, actor, reason)
      : await revokeStudentCard(id, actor, reason),
  );
});
