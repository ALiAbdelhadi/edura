import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { listDataExports, requestDataExport } from "@repo/server-core/services/data-rights/data-export";

export const dynamic = "force-dynamic";

/**
 * `studentId` narrows to a CHILD, and is authorized inside the service by
 * `assertDataRightsSubject` — the same approved-link gate the parent money
 * paths use. Omitted, it means "me". There is no role check here on purpose:
 * every signed-in person has these rights over their own data, whatever their
 * role, and the only question is whose data they are asking for.
 */
export const GET = withErrors(async (req) => {
  const user = await requireSession();
  const studentId = new URL(req.url).searchParams.get("studentId") ?? undefined;
  return ok(await listDataExports(user, studentId));
});

const postSchema = z.object({ studentId: z.string().uuid().optional() }).strict();

export const POST = withErrors(async (req) => {
  const user = await requireSession();
  const body = await parseJson(req, postSchema);
  return ok(await requestDataExport(user, body.studentId), { status: 201 });
});
