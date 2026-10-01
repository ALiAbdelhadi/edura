import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { listSitemapHandles } from "@repo/server-core/services/public-handles/sitemap-handles";

export const GET = withErrors(async () => ok(await listSitemapHandles()));
