import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { ValidationError } from "@/lib/errors/classes";
import {
  getSubjectsForSelection,
  getSubjectsForGradeLevels,
  getSecondLanguageOptions,
} from "@/lib/services/catalog/catalog-read";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withErrors(async (req) => {
  await requireSession();
  const params = new URL(req.url).searchParams;

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
