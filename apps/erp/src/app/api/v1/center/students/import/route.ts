import { z } from "zod";
import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  importStudentCsv,
  MAX_IMPORT_ROWS,
} from "@repo/server-core/services/center/bulk-import-students";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    csv: z.string().min(1, "The file is empty").max(1_000_000, "File is too large — split it"),
    dryRun: z.boolean().optional(),
    lineOffset: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict();

export const POST = centerStaff(
  async (req, _ctx, actor) => {
    const body = await parseJson(req, bodySchema);
    const summary = await importStudentCsv(
      { acting: actor.acting, actorId: actor.actorId, onBehalfOf: actor.onBehalfOf },
      body.csv,
      { dryRun: body.dryRun ?? false, lineOffset: body.lineOffset ?? 0 },
    );
    return ok(summary, { meta: { maxRows: MAX_IMPORT_ROWS } });
  },
  { allow: MANAGER },
);
