import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { toActingUser } from "@repo/server-core/authz/teacher-actor";
import { authorizeCenterActor } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { getSessionForUser } from "@repo/server-core/services/sessions/sessions";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrors(async (_req, ctx) => {
  // SECURITY_AUDIT.md M-01: `center_staff` is re-keyed to their own centre the
  // way GET /api/v1/sessions already does, so the `center_admin` branch in
  // getSessionForUser fires for them. Before this they fell through every branch and read any
  // centre's session by id.
  const session0 = await requireSession();
  const user =
    session0.role === "center_staff"
      ? (
          await authorizeCenterActor(session0, {
            allow: ["receptionist", "manager", "center_accountant"],
          })
        ).acting
      : await toActingUser(session0);

  const { id } = await ctx.params;

  const session = await getSessionForUser(user, id);

  return ok(session);
});
