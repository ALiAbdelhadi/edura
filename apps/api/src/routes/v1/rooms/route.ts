import { centerStaff, MANAGER } from "@repo/server-core/authz/center-actor";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { roomCreateSchema } from "@repo/server-core/services/rooms/rooms";
import { createRoom, listCenterRooms } from "@repo/server-core/services/rooms/manage-rooms";

export const GET = centerStaff(
  async (_req, _ctx, { acting: user }) => {
    const rooms = await listCenterRooms(user);
    return ok(rooms);
  },
  { allow: MANAGER },
);

const handlePost = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const body = await parseJson(req, roomCreateSchema);
    const room = await createRoom(user, body);
    return ok(room, { status: 201 });
  },
  { allow: MANAGER },
);

// A hall's amenities appear on the centre's public page, which is cached.
export const POST = invalidatesPublicData(handlePost, ["publicProfile"]);
