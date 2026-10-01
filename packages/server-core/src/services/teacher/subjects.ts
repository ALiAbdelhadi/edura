import { platformDb } from "../../db/scope";

export async function listTeacherSubjects(teacherId: string) {
  const rows = await platformDb((tx) =>
    tx.teacherSubject.findMany({
      where: { teacherId },
      select: { subject: { select: { id: true, nameAr: true, nameEn: true } } },
    }),
  );
  return rows.map((r) => r.subject);
}
