import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseProvenance } from "@/lib/http/provenance";
import { getAttendanceByCourse } from "@/lib/services/reports/reports";
import { parseOrThrow } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

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
    const result = await getAttendanceByCourse(user, query.from, query.to, parseProvenance(url));
    return ok(result);
  },
  { allow: MANAGER },
);
