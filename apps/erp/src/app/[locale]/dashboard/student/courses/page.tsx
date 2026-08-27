import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

export default async function StudentCoursesPage() {
  const locale = await getLocale();
  redirect({ href: "/dashboard/student/subjects", locale });
}
