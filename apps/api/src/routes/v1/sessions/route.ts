import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { toActingUser } from "@repo/server-core/authz/teacher-actor";
import { authorizeCenterActor } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { listSessionsForUser } from "@repo/server-core/services/sessions/sessions";

const MAX_LIMIT = 500;

function parseLimit(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return undefined;
  return Math.min(n, MAX_LIMIT);
}

export const GET = withErrors(async (req) => {
  const session = await requireSession();
  const user =
    session.role === "center_staff"
      ? (
          await authorizeCenterActor(session, {
            allow: ["receptionist", "manager", "center_accountant"],
          })
        ).acting
      : await toActingUser(session);

  const url = new URL(req.url);

  const enriched = await listSessionsForUser(user, {
    courseId: url.searchParams.get("courseId"),
    teacherId: url.searchParams.get("teacherId"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    studentId: url.searchParams.get("studentId"),
    limit: parseLimit(url.searchParams.get("limit")),
  });

  return ok({ items: enriched });
});
