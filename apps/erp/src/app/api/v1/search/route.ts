import { authorizeCenterActor } from "@/lib/authz/center-actor";
import { toActingUser } from "@/lib/authz/teacher-actor";
import { requireSession } from "@/lib/auth/session";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import {
  globalSearch,
  type SearchPrincipal,
} from "@repo/server-core/services/search/global-search";

export const dynamic = "force-dynamic";

/**
 * GLOBAL SEARCH — `GET /api/v1/search?q=…&locale=ar`
 *
 * ONE endpoint for every role, because the palette that calls it is one
 * component in the shell of all six portals. What differs per role is resolved
 * HERE, where the app's own delegation helpers live, and handed to the kernel
 * already resolved:
 *
 *   center_admin / center_staff → `authorizeCenterActor`, which re-checks the
 *     staff link LIVE on every request (a removed staff member stops resolving
 *     immediately) and returns the center-shaped actor RLS binds to.
 *   teacher / assistant → `toActingUser`, the Step 8 delegation resolution, so
 *     an assistant searches EXACTLY the teacher's reach and nothing wider.
 *   parent / student → themselves.
 *
 * Every sub-role is admitted at the door on purpose: this route serves seven
 * different providers whose tiers differ, so a single static allow-list here
 * could only be the UNION of them. The tier that matters is applied per
 * PROVIDER inside the kernel — the same shape the reports export uses, and for
 * the same reason (see `report-export.ts`, decision #3).
 */
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
      // Any other role (super_admin reaching this app, a future role) gets an
      // EMPTY result rather than a 403. The palette asks on every keystroke;
      // a refusal there would paint an error banner over a working screen for
      // somebody who has simply typed into a box.
      return ok({ q, groups: [], truncated: false });
  }

  return ok(await globalSearch(principal, { q, locale }));
});
