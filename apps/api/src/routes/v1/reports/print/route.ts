import { ACCOUNTANT, centerStaff, MANAGER } from "@repo/server-core/authz/center-actor";
import { AppError, NotFoundError } from "@repo/server-core/errors/classes";
import { ok } from "@repo/server-core/http/envelope";
import {
  buildReportExport,
  isReportExportKey,
} from "@repo/server-core/services/reports/report-export";

// The print page's read: the same buildReportExport the screen and the CSV
// export run (report-export.md — one set of books), under the same staff
// tiers as /api/v1/reports/export. An unknown key or a build-time AppError is
// a 404, as the page's notFound() was.
export const GET = centerStaff(
  async (req, _ctx, actor) => {
    const url = new URL(req.url);
    const key = url.searchParams.get("key") ?? "";
    if (!isReportExportKey(key)) throw new NotFoundError();

    try {
      return ok(
        await buildReportExport({
          key,
          user: actor.acting,
          staffRole: actor.staffRole,
          from: url.searchParams.get("from") ?? undefined,
          to: url.searchParams.get("to") ?? undefined,
        }),
      );
    } catch (err) {
      if (err instanceof AppError) throw new NotFoundError();
      throw err;
    }
  },
  { allow: [...ACCOUNTANT, ...MANAGER] },
);
