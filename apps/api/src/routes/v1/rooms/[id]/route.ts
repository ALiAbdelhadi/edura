import { centerStaff, MANAGER } from "@repo/server-core/authz/center-actor";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { roomPatchSchema } from "@repo/server-core/services/rooms/rooms";
import { deactivateRoom, updateRoom } from "@repo/server-core/services/rooms/manage-rooms";

type Ctx = { params: Promise<{ id: string }> };

const handlePatch = centerStaff(
  async (req, ctx, { acting: user }) => {
    const { id } = await ctx.params;
    const body = await parseJson(req, roomPatchSchema);
    const updated = await updateRoom(user, id, body);
    return ok(updated);
  },
  { allow: MANAGER },
);

const handleDelete = centerStaff(
  async (_req, ctx, { acting: user }) => {
    const { id } = await ctx.params;
    const result = await deactivateRoom(user, id);
    return ok(result);
  },
  { allow: MANAGER },
);

// A hall's amenities appear on the centre's public page, which is cached.
export const PATCH = invalidatesPublicData(handlePatch, ["publicProfile"]);
export const DELETE = invalidatesPublicData(handleDelete, ["publicProfile"]);
