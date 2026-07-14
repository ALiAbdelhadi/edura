import { Prisma } from "@repo/database";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const result = await scopedDb(user, async (tx) => {
    const filter: Prisma.CenterTeacherAffiliationWhereInput = {
      centerId: user.centerId as string,
    };
    if (status) {
      filter.status = status as Prisma.CenterTeacherAffiliationWhereInput["status"];
    }

    const affiliations = await tx.centerTeacherAffiliation.findMany({ where: filter });
    const teacherIds = affiliations.map((a) => a.teacherId);
    const teachers = await tx.user.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, name: true, email: true, status: true },
    });
    const teacherMap = new Map(teachers.map((t) => [t.id, t]));

    const items = [];
    for (const a of affiliations) {
      const t = teacherMap.get(a.teacherId);
      const teacherCourses = await tx.course.findMany({
        where: { teacherId: a.teacherId, status: "active" },
        select: { subject: true },
      });
      const coursesCount = teacherCourses.length;
      const subjects = [...new Set(teacherCourses.map((c) => c.subject).filter(Boolean))];

      const reviewStats = await tx.review.aggregate({
        where: { teacherId: a.teacherId },
        _avg: { rating: true },
        _count: true,
      });
      const avg = reviewStats._avg.rating;
      const rating = avg ? Math.round(avg * 10) / 10 : 0;
      const reviewsCount = reviewStats._count ?? 0;

      items.push({
        id: a.teacherId,
        teacherId: a.teacherId,
        name: t?.name,
        email: t?.email,
        status: t?.status,
        subjects,
        coursesCount,
        rating,
        reviewsCount,
        affiliation: { ...a },
      });
    }

    return items;
  });

  return ok(result);
});
