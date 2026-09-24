import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { publicProfileUrl, publicRootDomain } from "@/lib/public-site/host";
import { HANDLE_MAX } from "@/lib/services/public-handles/handle-rules";
import {
  clearMyHandle,
  getMyHandle,
  setMyHandle,
  type MyHandle,
} from "@/lib/services/public-handles/public-handles";
import { parseJson } from "@/lib/validation/zod";
import { appBaseUrl } from "@repo/server-core/http/app-url";
import { z } from "zod";
import { invalidatesPublicData } from "@/lib/cache/public-data";

export const dynamic = "force-dynamic";

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
