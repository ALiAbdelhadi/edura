import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  proposeAgreement,
  listCenterAgreements,
} from "@repo/server-core/services/finance/agreements";

export const dynamic = "force-dynamic";

const proposeSchema = z
  .object({
    teacherId: z.string().uuid(),
    basis: z.enum(["percent_of_net", "fixed_per_student"]),
    rateBp: z.number().int().min(0).max(10000).optional(),
    rateFlat: z.number().int().positive().optional(),
    residual: z.enum(["teacher", "center"]).optional(),
    note: z.string().max(500).optional(),
  })
  .strict();

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const body = await parseJson(req, proposeSchema);
  return ok(await proposeAgreement(body, user), { status: 201 });
});

export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const teacherId = new URL(req.url).searchParams.get("teacherId") ?? undefined;
  return ok(await listCenterAgreements(user, teacherId));
});
