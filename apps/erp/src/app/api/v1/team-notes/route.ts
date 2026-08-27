import { z } from "zod";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { delegatedWithCenter } from "@/lib/authz/teacher-actor";
import { RECEPTION, ACCOUNTANT } from "@/lib/authz/center-actor";
import {
  createTeamNote,
  listTeamNotes,
  type TeamNoteActor,
} from "@/lib/services/team-notes/team-notes";

export const dynamic = "force-dynamic";

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
  { staffAllow: STAFF_ALL },
);
