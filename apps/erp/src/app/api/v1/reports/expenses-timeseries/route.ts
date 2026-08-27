import { z } from "zod";
import { centerStaff, ACCOUNTANT } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseOrThrow } from "@/lib/validation/zod";
import { getExpensesTimeseries } from "@/lib/services/reports/reports";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  granularity: z.enum(["week", "month"]).optional(),
});

export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
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
  },
  { allow: ACCOUNTANT },
);
