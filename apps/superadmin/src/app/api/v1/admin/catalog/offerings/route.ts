import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { listOfferings, createOffering } from "@/lib/services/catalog/catalog-admin";

export const dynamic = "force-dynamic";

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
