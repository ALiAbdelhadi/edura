import { z } from "zod";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { delegatedWithCenter } from "@/lib/authz/teacher-actor";
import { RECEPTION } from "@/lib/authz/center-actor";
import {
  deleteTeamNote,
  updateTeamNote,
  type TeamNoteActor,
} from "@/lib/services/team-notes/team-notes";

export const dynamic = "force-dynamic";


const patchSchema = z
  .object({
    body: z.string().trim().min(1).max(2000).optional(),
    pinned: z.boolean().optional(),
    status: z.enum(["open", "done", "declined"]).optional(),
  })
  .refine((p) => Object.keys(p).length > 0, { message: "Empty patch" });

export const PATCH = delegatedWithCenter(
  async (req, ctx, actor) => {
    const { id } = await ctx.params;
    const patch = await parseJson(req, patchSchema);
    const note = await updateTeamNote(actor as TeamNoteActor, id, patch);
    return ok({
      id: note.id,
      body: note.body,
      pinned: note.pinned,
      status: note.status,
    });
  },
  { staffAllow: RECEPTION },
);

export const DELETE = delegatedWithCenter(
  async (_req, ctx, actor) => {
    const { id } = await ctx.params;
    await deleteTeamNote(actor as TeamNoteActor, id);
    return ok({ deleted: true });
  },
  { staffAllow: RECEPTION },
);
