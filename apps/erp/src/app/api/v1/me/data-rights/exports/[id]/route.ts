import { NextResponse } from "next/server";
import { toDateKey, todayKey } from "@repo/server-core/lib/date-key";
import { requireSession } from "@/lib/auth/session";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import {
  cancelDataExport,
  getDataExportPayload,
} from "@repo/server-core/services/data-rights/data-export";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (_req, ctx) => {
  const user = await requireSession();
  const { id } = await ctx.params;
  const { payload, completedAt, userId } = await getDataExportPayload(user, id);

  const stamp = completedAt ? toDateKey(completedAt) : todayKey();
  const body = JSON.stringify(payload, null, 2);

  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="edura-data-${userId.slice(0, 8)}-${stamp}.json"`,
      "cache-control": "no-store, private",
    },
  });
});

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireSession();
  const { id } = await ctx.params;
  return ok(await cancelDataExport(user, id));
});
