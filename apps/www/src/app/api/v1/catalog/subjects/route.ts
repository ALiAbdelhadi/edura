import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { ValidationError } from "@/lib/errors/classes";
import { platformDb } from "@/lib/db/scope";
import { assertApprovedChild } from "@/lib/services/wallet/parent-wallet";
import {
  getSubjectsForSelection,
  getSubjectsForGradeLevels,
  getSecondLanguageOptions,
  getAllActiveSubjects,
  getStudentOwnSubjects,
} from "@/lib/services/catalog/catalog-read";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withErrors(async (req) => {
  const user = await requireSession();
  const params = new URL(req.url).searchParams;

  // ?all=1 — every active catalog subject (the "Browse all" mode).
  if (params.get("all") === "1") {
    return ok(await getAllActiveSubjects());
  }

  // ?mine=1 — the session student's own track subjects (their picked second
  // language only), resolved server-side from their profile so the default list
  // always tracks profile changes.
  //
  // A PARENT asks the same question about a child by adding ?studentId=. The
  // subject list itself is catalog reference data, so this widens WHOSE profile
  // is read, nothing more — and only for an APPROVED child.
  if (params.get("mine") === "1") {
    if (user.role === "parent") {
      const studentId = params.get("studentId");
      if (!studentId || !UUID_RE.test(studentId)) {
        throw new ValidationError("studentId is required for a parent");
      }
      await platformDb((tx) => assertApprovedChild(tx, user.id, studentId));
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
