import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const { email } = await parseJson(req, bodySchema);

  const teacher = await scopedDb(user, (tx) =>
    tx.user.findFirst({
      where: { email, role: "teacher", status: { not: "deleted" } },
      select: { id: true, name: true, email: true },
    }),
  );

  if (!teacher) throw new NotFoundError("Teacher not found");
  return ok({ id: teacher.id, name: teacher.name, email: teacher.email });
});
