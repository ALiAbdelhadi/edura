import { z } from "zod";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { openShift, listShiftReconciliation } from "@/lib/services/center/shifts";

export const dynamic = "force-dynamic";

const openSchema = z
  .object({ openingFloat: z.number().int().min(0).optional() })
  .strict();

/** Open MY drawer session (Phase 2). One open shift per staff member. */
export const POST = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const body = await parseJson(req, openSchema);
    return ok(await openShift(user, body), { status: 201 });
  },
  { allow: RECEPTION },
);

/** The reconciliation list — the same service function the CSV export runs. */
export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const url = new URL(req.url);
    return ok(
      await listShiftReconciliation(user, {
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
      }),
    );
  },
  { allow: ["receptionist", "manager", "center_accountant"] },
);
