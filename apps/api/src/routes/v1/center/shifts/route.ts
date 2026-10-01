import { z } from "zod";
import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { openShift, listShiftReconciliation } from "@repo/server-core/services/center/shifts";

const openSchema = z
  .object({ openingFloat: z.number().int().min(0).optional() })
  .strict();

export const POST = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const body = await parseJson(req, openSchema);
    return ok(await openShift(user, body), { status: 201 });
  },
  { allow: RECEPTION },
);

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
