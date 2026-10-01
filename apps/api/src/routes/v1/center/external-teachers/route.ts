import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { centerStaff, MANAGER, requireCenterActor } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  createExternalTeacher,
  listCenterTeachers,
} from "@repo/server-core/services/external-teachers/index";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";

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
  phone: z.string().trim().min(6).max(20).nullish(),
  email: z.email().nullish(),
  bio: z.string().trim().max(2000).nullish(),
  subjects: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  qualifications: z.string().trim().max(500).nullish(),
  lessonPrice: z.number().int().min(0).nullish(),
  centerShare: z.number().int().min(0).nullish(),
});

const handlePost = withErrors(async (req) => {
  await requireRole("center_admin");
  const actor = await requireCenterActor();
  const data = await parseJson(req, createSchema);
  return ok(await createExternalTeacher(actor, data), { status: 201 });
});

export const POST = invalidatesPublicData(handlePost);
