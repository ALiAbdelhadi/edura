import { z } from "zod";
import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseOrThrow } from "@/lib/validation/zod";
import { getAttendanceByCourse } from "@/lib/services/reports/reports";
import { parseProvenance } from "@/lib/http/provenance";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

// Operational report — MANAGER (and owner). Financial reports (revenue/profit/
// expenses) are center_accountant-only; see center-actor.ts CAPABILITY MAP.
export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const url = new URL(req.url);
    const query = parseOrThrow(
      querySchema,
      Object.fromEntries(url.searchParams.entries()),
    );
    const result = await getAttendanceByCourse(user, query.from, query.to, parseProvenance(url));
    return ok(result);
  },
  { allow: MANAGER },
);
