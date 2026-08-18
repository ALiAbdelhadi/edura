import { z } from "zod";
import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  importStudentCsv,
  MAX_IMPORT_ROWS,
} from "@repo/server-core/services/center/bulk-import-students";

export const dynamic = "force-dynamic";

/**
 * Bulk student import from a spreadsheet export (CSV/TSV).
 *
 * MANAGER, not RECEPTION — deliberately. The receptionist's counter flow is
 * one child standing in front of them; this writes hundreds of roster rows in
 * one call, which is a migration decision an owner or manager makes. The
 * capability map in lib/authz/center-actor.ts is the reference for that split.
 *
 * `dryRun: true` reads and reports ONLY — nothing is written, not even the
 * audit row. The UI runs it first so a center sees "312 new, 18 already known,
 * 2 errors" BEFORE committing, which is the difference between an import you
 * can trust and one you find out about afterwards.
 *
 * Money is untouched: no subscription, payment or enrolment. See the service
 * header for why importing a name must never be a financial event.
 */
const bodySchema = z
  .object({
    // Bounded so a pasted novel cannot become a request body. 1 MB holds far
    // more than MAX_IMPORT_ROWS rows of realistic student data; the row cap in
    // the service is the limit that actually governs.
    csv: z.string().min(1, "The file is empty").max(1_000_000, "File is too large — split it"),
    dryRun: z.boolean().optional(),
    // The UI uploads a big file in chunks (one request per chunk cannot exceed
    // the serverless execution limit). Each chunk is a standalone CSV, so this
    // keeps the reported line numbers pointing at the ORIGINAL spreadsheet.
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
