import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { listDataExports, requestDataExport } from "@repo/server-core/services/data-rights/data-export";

export const dynamic = "force-dynamic";

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
