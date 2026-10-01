import { requireRole } from "@repo/server-core/authz/require-role";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { publicProfileUrl, publicRootDomain } from "@repo/server-core/services/public-handles/host";
import { HANDLE_MAX } from "@repo/server-core/services/public-handles/handle-rules";
import {
  clearMyHandle,
  getMyHandle,
  setMyHandle,
  type MyHandle,
} from "@repo/server-core/services/public-handles/public-handles";
import { parseJson } from "@repo/server-core/validation/zod";
import { appBaseUrl } from "@repo/server-core/http/app-url";
import { z } from "zod";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";

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

const handlePut = withErrors(async (req) => {
  const user = await requireRole(...OWNER_ROLES);
  const { handle } = await parseJson(req, putSchema);
  return ok(present(await setMyHandle(user, handle), user.locale ?? "ar"));
});

const handleDelete = withErrors(async () => {
  const user = await requireRole(...OWNER_ROLES);
  return ok(present(await clearMyHandle(user), user.locale ?? "ar"));
});

export const PUT = invalidatesPublicData(handlePut);
export const DELETE = invalidatesPublicData(handleDelete);
