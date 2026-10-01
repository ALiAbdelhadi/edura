import { authorizeCenterActor } from "@repo/server-core/authz/center-actor";
import { toActingUser } from "@repo/server-core/authz/teacher-actor";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import {
  globalSearch,
  type SearchPrincipal,
} from "@repo/server-core/services/search/global-search";

export const GET = withErrors(async (req) => {
  const user = await requireSession();
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const locale = url.searchParams.get("locale") === "en" ? "en" : "ar";

  let principal: SearchPrincipal;
  switch (user.role) {
    case "center_admin":
    case "center_staff": {
      const actor = await authorizeCenterActor(user, {
        allow: ["receptionist", "manager", "center_accountant"],
      });
      principal = {
        kind: "center",
        acting: actor.acting,
        staffRole: actor.staffRole,
        portal: user.role === "center_admin" ? "admin" : "staff",
      };
      break;
    }
    case "teacher":
    case "assistant":
      principal = {
        kind: "teacher",
        acting: await toActingUser(user),
        portal: user.role === "teacher" ? "teacher" : "assistant",
      };
      break;
    case "parent":
      principal = { kind: "parent", user };
      break;
    case "student":
      principal = { kind: "student", user };
      break;
    default:
      return ok({ q, groups: [], truncated: false });
  }

  return ok(await globalSearch(principal, { q, locale }));
});
