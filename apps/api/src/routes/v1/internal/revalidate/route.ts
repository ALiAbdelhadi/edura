import { requireDedicatedSecret } from "@repo/server-core/config/secrets";
import { ForbiddenError } from "@repo/server-core/errors/classes";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { invalidatePublicData } from "@repo/server-core/cache/public-data";
import { PUBLIC_DATASETS, type PublicDataset } from "@repo/server-core/cache/public-data";
import { parseJson } from "@repo/server-core/validation/zod";
import { secretEquals } from "@repo/server-core/auth/secret-compare";
import { z } from "zod";

// The back office writes the catalog, centres, courses and teachers, but its
// `revalidateTag` would clear its OWN cache, not this app's. It posts here
// instead (apps/superadmin/src/lib/cache/erp-revalidate.ts), after its write has
// committed. Same gate as chat-notify: the dedicated server-to-server secret.
//
// The body names datasets, never tags, so a caller holding the secret can expire
// only the three public caches and nothing else that may ever carry a tag.
const schema = z.object({
  datasets: z.array(z.enum(PUBLIC_DATASETS as [PublicDataset, ...PublicDataset[]])).min(1).max(8),
});

export const POST = withErrors(async (req) => {
  const secret = requireDedicatedSecret("INTERNAL_API_SECRET");
  if (!secretEquals(req.headers.get("x-internal-secret"), secret)) {
    throw new ForbiddenError("Invalid internal secret");
  }
  const { datasets } = await parseJson(req, schema);
  invalidatePublicData(...datasets);
  return ok({ revalidated: [...new Set(datasets)] });
});
