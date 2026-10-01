import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { myOpenShift } from "@repo/server-core/services/center/shifts";

export const GET = centerStaff(
  async (_req, _ctx, { acting: user }) => ok(await myOpenShift(user)),
  { allow: RECEPTION },
);
