import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireSession } from "@/lib/auth/session";
import { ForbiddenError, NotFoundError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { platformDb } from "@/lib/db/scope";
import {
  getGuardianContactStatus,
  setGuardianContact,
} from "@/lib/services/invites/guardian-contact";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    guardianEmail: z.string().trim().toLowerCase().email().optional(),
    guardianPhone: z.string().trim().min(6).max(20).optional(),
    /** Parents only: which of their children this is for. */
    studentId: z.string().uuid().optional(),
  })
  .strict();

/**
 * Whose guardian contact may this session touch?
 *   - a student: their own;
 *   - a parent: any child they have an APPROVED link to.
 * Anyone else is refused here; center staff use the counter route instead,
 * which carries the center-actor scoping.
 */
async function resolveTarget(
  session: { id: string; role: string },
  studentId?: string,
): Promise<string> {
  if (session.role === "student") return session.id;
  if (session.role === "parent") {
    if (!studentId) throw new NotFoundError("studentId is required");
    const link = await platformDb((tx) =>
      tx.parentStudentLink.findFirst({
        where: { parentId: session.id, studentId, status: "approved" },
        select: { id: true },
      }),
    );
    if (!link) throw new ForbiddenError();
    return studentId;
  }
  throw new ForbiddenError();
}

export const GET = withErrors(async (req) => {
  const session = await requireSession();
  const studentId = new URL(req.url).searchParams.get("studentId") ?? undefined;
  const target = await resolveTarget(session, studentId);
  return ok(await getGuardianContactStatus(target));
});

export const POST = withRateLimit(
  withErrors(async (req) => {
    const session = await requireSession();
    const body = await parseJson(req, bodySchema);
    const target = await resolveTarget(session, body.studentId);
    return ok(await setGuardianContact(session, target, body));
  }),
  10,
  10,
);
