import { z } from "zod";
import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { createWalkInSubscription } from "@repo/server-core/services/subscriptions/subscriptions";
import { listCenterSubscriptions } from "@repo/server-core/services/subscriptions/center-list";

const bodySchema = z
  .object({
    studentId: z.string().uuid(),
    courseId: z.string().uuid(),
    plan: z.enum(["monthly", "per_session"]),
    sessionId: z.string().uuid().optional(),
    markAttendance: z.boolean().optional(),
    paymentMethod: z.enum(["cash", "instapay", "pos_card", "mobile_wallet"]).optional(),
  })
  .strict();

export const POST = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const body = await parseJson(req, bodySchema);
    return ok(await createWalkInSubscription(body, user), { status: 201 });
  },
  { allow: RECEPTION },
);

export const GET = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? undefined;
    const rows = await listCenterSubscriptions(user, status);
    return ok(rows);
  },
  { allow: RECEPTION },
);
