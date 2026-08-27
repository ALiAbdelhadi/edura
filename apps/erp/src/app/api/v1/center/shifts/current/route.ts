import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { myOpenShift } from "@/lib/services/center/shifts";

export const dynamic = "force-dynamic";

export const GET = centerStaff(
  async (_req, _ctx, { acting: user }) => ok(await myOpenShift(user)),
  { allow: RECEPTION },
);
