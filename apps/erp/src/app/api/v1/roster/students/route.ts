import { z } from "zod";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { listRosterStudents, addRosterStudent } from "@repo/server-core/services/center/roster";

export const dynamic = "force-dynamic";

// The roster logic moved to the shared kernel so apps/superadmin can run the
// SAME code against any center. This route keeps its exact guard, schema and
// response shape — only the body moved.

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
