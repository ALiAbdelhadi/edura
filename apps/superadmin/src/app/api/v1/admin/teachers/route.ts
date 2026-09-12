import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listTeachers } from "@/lib/services/admin/platform";
import { createTeacher } from "@/lib/services/admin/teacher-control";
import { emailSchema, nameSchema, passwordSchema, phoneSchema } from "@/lib/validation/common";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, req) => {
  const sp = new URL(req.url).searchParams;
  const result = await listTeachers({
    q: sp.get("q") ?? undefined,
    status: sp.get("status") ?? undefined,
    mode: sp.get("mode") ?? undefined,
    page: sp.get("page") ?? undefined,
    limit: sp.get("limit") ?? sp.get("pageSize") ?? undefined,
  });
  return ok(result.data, { meta: { total: result.total, page: result.page, limit: result.limit } });
});

// The role is pinned in `createTeacher` and is deliberately absent from this
// schema: the body cannot ask for any other one.
const createSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    phone: phoneSchema.optional(),
    bio: z.string().trim().max(2000).nullable().optional(),
    subjects: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
    qualifications: z.string().trim().max(2000).nullable().optional(),
    experienceYears: z.number().int().min(0).max(80).optional(),
    lessonPrice: z.number().int().min(0).max(99_999_900).nullable().optional(),
    attendanceMode: z.enum(["counter_only", "counter_and_door"]).optional(),
  })
  .strict();

export const POST = withRole("super_admin", async (actor, req) => {
  const body = await parseJson(req, createSchema);
  return ok(await createTeacher(actor, body), { status: 201 });
});
