import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { publicProfileUrl, publicRootDomain } from "@/lib/public-site/host";
import { HANDLE_MAX } from "@/lib/services/public-handles/handle-rules";
import {
  clearMyHandle,
  getMyHandle,
  setMyHandle,
  type MyHandle,
} from "@/lib/services/public-handles/public-handles";
import { appBaseUrl } from "@repo/server-core/http/app-url";

export const dynamic = "force-dynamic";

// The owner is the session (center_admin → their centre, teacher → their own
// profile). Assistants and centre staff are refused by the service: the
// handle is the tenant's public name, not a delegated task.
const OWNER_ROLES = ["center_admin", "teacher"] as const;

function present(mine: MyHandle, locale: string) {
  const rootDomain = publicRootDomain();
  return {
    ...mine,
    rootDomain,
    url: mine.handle
      ? publicProfileUrl({ baseUrl: appBaseUrl(), locale, handle: mine.handle, rootDomain })
      : null,
    pathUrl: mine.handle
      ? publicProfileUrl({ baseUrl: appBaseUrl(), locale, handle: mine.handle, rootDomain: null })
      : null,
  };
}

export const GET = withErrors(async () => {
  const user = await requireRole(...OWNER_ROLES);
  return ok(present(await getMyHandle(user), user.locale ?? "ar"));
});

const putSchema = z.object({
  handle: z.string().trim().min(1).max(HANDLE_MAX + 20),
});

export const PUT = withErrors(async (req) => {
  const user = await requireRole(...OWNER_ROLES);
  const { handle } = await parseJson(req, putSchema);
  return ok(present(await setMyHandle(user, handle), user.locale ?? "ar"));
});

export const DELETE = withErrors(async () => {
  const user = await requireRole(...OWNER_ROLES);
  return ok(present(await clearMyHandle(user), user.locale ?? "ar"));
});
