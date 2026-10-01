import { z } from "zod";
import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { listRosterStudents, addRosterStudent } from "@repo/server-core/services/center/roster";

const addSchema = z.object({
  studentId: z.string().min(1),
});

export const GET = centerStaff(
  async (req, _ctx, { acting }) => {
    const url = new URL(req.url);
    const items = await listRosterStudents(acting, {
      blacklisted: url.searchParams.get("blacklisted"),
      courseId: url.searchParams.get("courseId"),
      q: url.searchParams.get("q"),
    });
    return ok({ items });
  },
  { allow: RECEPTION },
);

export const POST = centerStaff(
  async (req, _ctx, { acting }) => {
    const { studentId } = await parseJson(req, addSchema);
    return ok(await addRosterStudent(acting, studentId), { status: 201 });
  },
  { allow: RECEPTION },
);
