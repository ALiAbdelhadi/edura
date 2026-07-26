import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { getCenter } from "@/lib/services/admin/platform";
import { updateCenterProfile } from "@/lib/services/admin/center-control";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  await requireRole("super_admin");
  const { id } = await ctx.params;
  return ok(await getCenter(id));
});

// Control op #6 — edit the center's PROFILE. `.strict()` is load-bearing: an
// unknown key is a 400, not a silently-dropped field.
//
// Deliberately NOT editable here, and each for its own reason:
//   walletBalance / receiptSeq   money — moved only by settlement/refund/payout
//   status                       has its own audited endpoint (…/status)
//   shortId / entityType / isDemo / ownerUserId    identity & provenance
//   revenue split / commission %  stays in the dedicated pricing flow, with its
//     snapshot-on-create + new-courses-only semantics. Two edit paths to one
//     money-sensitive number is the failure mode this omission prevents.
const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    area: z.string().trim().max(200).nullable().optional(),
    governorate: z.string().trim().max(200).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    whatsapp: z.string().trim().max(40).nullable().optional(),
    email: z.email().max(320).nullable().optional(),
    logoUrl: z.url().max(2000).nullable().optional(),
    classroomCount: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const patch = await parseJson(req, patchSchema);
  return ok(await updateCenterProfile(id, patch, user));
});
