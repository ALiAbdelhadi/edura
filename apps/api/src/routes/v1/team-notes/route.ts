import { ACCOUNTANT, RECEPTION } from "@repo/server-core/authz/center-actor";
import { delegatedWithCenter } from "@repo/server-core/authz/teacher-actor";
import { ok } from "@repo/server-core/http/envelope";
import {
  createTeamNote,
  listTeamNotes,
  type TeamNoteActor,
} from "@repo/server-core/services/team-notes/team-notes";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const STAFF_ALL = [...RECEPTION, ...ACCOUNTANT];

export const GET = delegatedWithCenter(
  async (_req, _ctx, actor) => ok(await listTeamNotes(actor as TeamNoteActor)),
  { staffAllow: STAFF_ALL },
);

const createSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export const POST = delegatedWithCenter(
  async (req, _ctx, actor) => {
    const data = await parseJson(req, createSchema);
    const note = await createTeamNote(actor as TeamNoteActor, data);
    return ok({ id: note.id }, { status: 201 });
  },
  { staffAllow: RECEPTION },
);
