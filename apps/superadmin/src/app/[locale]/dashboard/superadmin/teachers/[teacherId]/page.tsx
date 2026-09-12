import { localizedTitle } from "@/lib/i18n/page-metadata";
import { TeacherOversightScreen } from "@/features/admin/teacher-oversight/teacher-oversight-screen";

export const generateMetadata = localizedTitle("teachers");

export default async function TeacherOversightPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;
  return <TeacherOversightScreen teacherId={teacherId} />;
}
