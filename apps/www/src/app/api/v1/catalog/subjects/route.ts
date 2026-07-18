import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { ValidationError, NotFoundError } from "@/lib/errors/classes";
import { platformDb } from "@/lib/db/scope";
import {
  getSubjectsForSelection,
  getSubjectsForGradeLevels,
  getSecondLanguageOptions,
  getAllActiveSubjects,
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

  // ?mine=1 — the session student's own track subjects, resolved server-side
  // from their profile so the default list always tracks profile changes.
  if (params.get("mine") === "1") {
    if (user.role !== "student") throw new ValidationError("mine=1 is student-only");
    const profile = await platformDb((tx) =>
      tx.studentProfile.findUnique({
        where: { userId: user.id },
        select: { gradeLevelId: true, trackId: true },
      }),
    );
    if (!profile) throw new NotFoundError("Student profile not found");
    if (!profile.gradeLevelId) return ok([]);
    return ok(await getSubjectsForSelection(profile.gradeLevelId, profile.trackId));
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
