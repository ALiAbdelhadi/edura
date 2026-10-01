import { centerStaff, MANAGER } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { getPerStudentAvailability } from "@repo/server-core/services/rooms/manage-rooms";

export const GET = centerStaff(
  async (_req, _ctx, { acting: user }) => {
    const data = await getPerStudentAvailability(user);
    return ok(data);
  },
  { allow: MANAGER },
);
