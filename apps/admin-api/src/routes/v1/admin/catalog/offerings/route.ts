import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { listOfferings, createOffering } from "@repo/server-core/services/catalog/catalog-admin";

export const GET = withRole("super_admin", async (_user, req) => {
  const params = new URL(req.url).searchParams;
  return ok(
    await listOfferings({
      subjectId: params.get("subjectId") ?? undefined,
      gradeLevelId: params.get("gradeLevelId") ?? undefined,
      trackId: params.get("trackId") ?? undefined,
    }),
  );
});

const createSchema = z.object({
  subjectId: z.string().uuid(),
  gradeLevelId: z.string().uuid(),
  trackId: z.string().uuid().nullish(),
});

export const POST = withRole("super_admin", async (actor, req) => {
  const body = await parseJson(req, createSchema);
  return ok(await createOffering(body, actor), { status: 201 });
});
