import { z } from "zod";
import { centerStaff, MANAGER } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseOrThrow } from "@repo/server-core/validation/zod";
import { getEnrollmentFunnel } from "@repo/server-core/services/reports/reports";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const url = new URL(req.url);
    const query = parseOrThrow(
      querySchema,
      Object.fromEntries(url.searchParams.entries()),
    );
    const result = await getEnrollmentFunnel(user, query.from, query.to);
    return ok(result);
  },
  { allow: MANAGER },
);
