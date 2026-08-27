"use client";

import { use } from "react";
import { StudentIdScreen } from "@/features/student/student-id-screen";

export default function Page({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = use(params);
  return <StudentIdScreen studentId={studentId} showChecklist={false} audience="parent" />;
}
