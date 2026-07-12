import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { getEligibleTeachers } from "@/lib/services/reviews/reviews";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("student");
  const teachers = await getEligibleTeachers(user.id);
  return ok(teachers);
});
