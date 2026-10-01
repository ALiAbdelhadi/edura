import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { ValidationError } from "@repo/server-core/errors/classes";
import {
  getOnboardingState,
  saveOnboardingDraft,
  completeStudentOnboarding,
  completeTeacherOnboarding,
  completeCenterOnboarding,
} from "@repo/server-core/services/catalog/onboarding";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";

export const GET = withErrors(async () => {
  const user = await requireSession();
  return ok(await getOnboardingState(user));
});

const draftSchema = z.object({ draft: z.record(z.string(), z.unknown()) });

const handlePatch = withErrors(async (req) => {
  const user = await requireSession();
  const body = await parseJson(req, draftSchema);
  if (JSON.stringify(body.draft).length > 10_000) throw new ValidationError("Draft too large");
  return ok(await saveOnboardingDraft(user, body.draft as never));
});

const studentSchema = z.object({
  educationSystemId: z.string().uuid(),
  stageId: z.string().uuid(),
  gradeLevelId: z.string().uuid(),
  trackId: z.string().uuid().nullish(),
  secondLanguageSubjectId: z.string().uuid().nullish(),
});

const teacherSchema = z.object({
  gradeLevelIds: z.array(z.string().uuid()).min(1).max(100),
  subjectIds: z.array(z.string().uuid()).min(1).max(100),
});

const centerSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  governorate: z.string().trim().max(100).nullish(),
  area: z.string().trim().max(200).nullish(),
  phone: z.string().trim().max(20).nullish(),
  stageIds: z.array(z.string().uuid()).min(1).max(50),
});

const handlePost = withErrors(async (req) => {
  const user = await requireSession();
  if (user.role === "student") {
    const body = await parseJson(req, studentSchema);
    return ok(await completeStudentOnboarding(user, body));
  }
  if (user.role === "teacher") {
    const body = await parseJson(req, teacherSchema);
    return ok(await completeTeacherOnboarding(user, body));
  }
  if (user.role === "center_admin") {
    const body = await parseJson(req, centerSchema);
    return ok(await completeCenterOnboarding(user, body));
  }
  throw new ValidationError("No onboarding flow for this role");
});

export const PATCH = invalidatesPublicData(handlePatch);
export const POST = invalidatesPublicData(handlePost);
