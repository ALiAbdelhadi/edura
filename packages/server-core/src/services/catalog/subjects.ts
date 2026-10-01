import { platformDb } from "../../db/scope";

export async function listActiveSubjects() {
  return platformDb((tx) =>
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
}
