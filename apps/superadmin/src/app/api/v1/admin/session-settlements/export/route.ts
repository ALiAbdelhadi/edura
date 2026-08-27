import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { buildSettlementWorkbook } from "@/lib/services/finance/settlement-export";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  await requireRole("accountant", "super_admin");

  const p = new URL(req.url).searchParams;
  const date = (v: string | null) => {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const locale = p.get("locale") === "en" ? "en" : "ar";

  const { buffer, filename, rowCount, truncated } = await buildSettlementWorkbook(
    {
      centerId: p.get("centerId") ?? undefined,
      pricingMethod: p.get("pricingMethod") ?? undefined,
      from: date(p.get("from")),
      to: date(p.get("to")),
    },
    locale,
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-length": String(buffer.byteLength),
      "x-edura-rows": String(rowCount),
      "x-edura-truncated": String(truncated),
    },
  });
});
