import { centerStaff, MANAGER } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseProvenance } from "@repo/server-core/http/provenance";
import { getAttendanceByCourse } from "@repo/server-core/services/reports/reports";
import { parseOrThrow } from "@repo/server-core/validation/zod";
import { z } from "zod";

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
