import { z } from "zod";
import bcrypt from "bcryptjs";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { platformDb } from "@/lib/db/scope";
import { ConflictError } from "@/lib/errors/classes";
import { emailSchema, passwordSchema, nameSchema, phoneSchema } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

// Provision an accountant account (PRD §4.2 — super_admin ONLY).
const createSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional(),
});

export const POST = withErrors(async (req) => {
  await requireRole("super_admin");
  const body = await parseJson(req, createSchema);

  const accountant = await platformDb(async (tx) => {
    const existing = await tx.user.findFirst({
      where: { OR: [{ email: body.email }, ...(body.phone ? [{ phone: body.phone }] : [])] },
      select: { id: true },
    });
    if (existing) throw new ConflictError("An account with this email or phone already exists");

    const passwordHash = await bcrypt.hash(body.password, 10);
    return tx.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone ?? null,
        passwordHash,
        role: "accountant",
        status: "active",
        emailVerified: true,
      },
      select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
    });
  });

  return ok(accountant, { status: 201 });
});
