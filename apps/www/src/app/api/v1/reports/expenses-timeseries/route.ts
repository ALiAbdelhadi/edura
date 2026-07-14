import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseOrThrow } from "@/lib/validation/zod";
import { getExpensesTimeseries } from "@/lib/services/reports/reports";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  granularity: z.enum(["week", "month"]).optional(),
});

export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const url = new URL(req.url);
  const query = parseOrThrow(
    querySchema,
    Object.fromEntries(url.searchParams.entries()),
  );
  const result = await getExpensesTimeseries(
    user,
    query.from,
    query.to,
    query.granularity ?? "month",
  );
  return ok(result);
});
