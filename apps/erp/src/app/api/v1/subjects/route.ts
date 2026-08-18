import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { platformDb } from "@/lib/db/scope";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const subjects = await platformDb((tx) =>
    tx.subject.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        code: true,
        nameAr: true,
        nameEn: true,
        isAzhari: true,
        isSecondLanguage: true,
      },
    }),
  );
  return ok(subjects);
});
