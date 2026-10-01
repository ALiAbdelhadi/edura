import { requireSession } from "@repo/server-core/erp-auth/session";
import { ValidationError } from "@repo/server-core/errors/classes";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import {
  getAllActiveSubjects,
  getSubjectsForGradeLevels,
} from "@repo/server-core/services/catalog/catalog-cache";
import {
  getSecondLanguageOptions,
  getStudentOwnSubjects,
  getSubjectsForSelection,
} from "@repo/server-core/services/catalog/catalog-read";
import { assertParentOfApprovedChild } from "@repo/server-core/services/discovery/student-scope";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withErrors(async (req) => {
  const user = await requireSession();
  const params = new URL(req.url).searchParams;

  if (params.get("all") === "1") {
    return ok(await getAllActiveSubjects());
  }

  if (params.get("mine") === "1") {
    if (user.role === "parent") {
      const studentId = params.get("studentId");
      if (!studentId || !UUID_RE.test(studentId)) {
        throw new ValidationError("studentId is required for a parent");
      }
      await assertParentOfApprovedChild(user.id, studentId);
      return ok(await getStudentOwnSubjects(studentId));
    }
    if (user.role !== "student") {
      throw new ValidationError("mine=1 is for students and parents");
    }
    return ok(await getStudentOwnSubjects(user.id));
  }

  const gradeLevelIds = params.get("gradeLevelIds");
  if (gradeLevelIds) {
    const ids = gradeLevelIds.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0 || ids.length > 50 || ids.some((id) => !UUID_RE.test(id)))
      throw new ValidationError("gradeLevelIds must be 1-50 UUIDs");
    return ok(await getSubjectsForGradeLevels(ids));
  }

  const gradeLevelId = params.get("gradeLevelId");
  if (!gradeLevelId || !UUID_RE.test(gradeLevelId))
    throw new ValidationError("gradeLevelId is required");

  if (params.get("secondLanguage") === "1") {
    return ok(await getSecondLanguageOptions(gradeLevelId));
  }

  const trackId = params.get("trackId");
  if (trackId && !UUID_RE.test(trackId)) throw new ValidationError("trackId must be a UUID");
  return ok(await getSubjectsForSelection(gradeLevelId, trackId));
});
