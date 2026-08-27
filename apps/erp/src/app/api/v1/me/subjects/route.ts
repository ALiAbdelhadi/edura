import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { getSessionUser } from "@/lib/auth/session";
import { toActingUser } from "@/lib/authz/teacher-actor";
import { platformDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  await requireRole("teacher", "assistant");
  const raw = await getSessionUser();
  const user = raw ? await toActingUser(raw) : null;
  const teacherId = user?.role === "teacher" ? user.id : null;
  if (!teacherId) return ok([]);

  const rows = await platformDb((tx) =>
    tx.teacherSubject.findMany({
      where: { teacherId },
      select: { subject: { select: { id: true, nameAr: true, nameEn: true } } },
    }),
  );
  return ok(rows.map((r) => r.subject));
});
