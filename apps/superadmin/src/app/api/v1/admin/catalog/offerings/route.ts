import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { listOfferings, createOffering } from "@/lib/services/catalog/catalog-admin";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
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

export const POST = withErrors(async (req) => {
  await requireRole("super_admin");
  const body = await parseJson(req, createSchema);
  return ok(await createOffering(body), { status: 201 });
});
