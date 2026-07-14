import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    email: z.string().email().toLowerCase().trim().optional(),
    phone: z.string().trim().optional(),
  })
  .refine((d) => d.email || d.phone, { message: "Provide email or phone" });

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const body = await parseJson(req, bodySchema);

  const filter: { email?: string; phone?: string } = {};
  if (body.email) filter.email = body.email;
  else if (body.phone) filter.phone = body.phone;

  const student = await scopedDb(user, (tx) =>
    tx.user.findFirst({
      where: { ...filter, role: "student", status: { not: "deleted" } },
      select: { id: true, name: true, email: true },
    }),
  );

  if (!student) throw new NotFoundError("Student not found");

  return ok({
    id: student.id,
    name: student.name,
    email: student.email,
  });
});
