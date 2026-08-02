import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { centerStaff, MANAGER, requireCenterActor } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  createExternalTeacher,
  listCenterTeachers,
} from "@/lib/services/external-teachers";

export const dynamic = "force-dynamic";

/**
 * The center's teachers — ON-PLATFORM AND OFF-SYSTEM TOGETHER.
 *
 * This is deliberately not a separate "external teachers" list. A center that
 * has to look in two places does not have one picture of its own business,
 * which is the entire point of the feature; `?systemStatus=` narrows it only
 * when an operator explicitly asks for one side.
 *
 * READ is open to managers (an operational view). WRITE is owner-only: creating
 * a teacher record sets up who the center's money will later be split with, so
 * it sits with the same person who owns the rest of the commercial arrangement
 * — the same reasoning that keeps staff management and pricing owner-only.
 */
export const GET = centerStaff(
  async (req, _ctx, { acting }) => {
    const url = new URL(req.url);
    const systemStatus = url.searchParams.get("systemStatus");
    return ok(
      await listCenterTeachers(acting, {
        systemStatus:
          systemStatus === "external" || systemStatus === "enrolled" ? systemStatus : null,
        q: url.searchParams.get("q"),
        includeRemoved: url.searchParams.get("includeRemoved") === "true",
      }),
    );
  },
  { allow: MANAGER },
);

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  // Both contact fields are OPTIONAL. An off-system teacher who will not use
  // the platform may well not want to hand over an address, and refusing to
  // record them until they do would send the center straight back to paper.
  // An email becomes REQUIRED only at the moment they convert.
  phone: z.string().trim().min(6).max(20).nullish(),
  email: z.email().nullish(),
  bio: z.string().trim().max(2000).nullish(),
  subjects: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  qualifications: z.string().trim().max(500).nullish(),
  lessonPrice: z.number().int().min(0).nullish(),
  centerShare: z.number().int().min(0).nullish(),
});

export const POST = withErrors(async (req) => {
  await requireRole("center_admin");
  const actor = await requireCenterActor();
  const data = await parseJson(req, createSchema);
  return ok(await createExternalTeacher(actor, data), { status: 201 });
});
