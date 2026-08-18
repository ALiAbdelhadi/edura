import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

// The standalone Browse Courses page was absorbed into the Subjects page
// (subjects expand in place to show their courses). Redirect so old links keep working.
export default async function StudentCoursesPage() {
  const locale = await getLocale();
  redirect({ href: "/dashboard/student/subjects", locale });
}
