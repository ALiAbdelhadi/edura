import { use } from "react";
import { ExternalTeacherDetailScreen } from "@/features/admin/external-teacher-detail-screen";

export default function Page({ params }: { params: Promise<{ teacherId: string }> }) {
  const { teacherId } = use(params);
  return <ExternalTeacherDetailScreen teacherId={teacherId} />;
}
