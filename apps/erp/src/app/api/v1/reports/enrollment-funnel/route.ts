import { z } from "zod";
import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseOrThrow } from "@/lib/validation/zod";
import { getEnrollmentFunnel } from "@/lib/services/reports/reports";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

// Operational report — MANAGER (and owner).
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
