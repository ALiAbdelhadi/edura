"use client";

import { use } from "react";
import { StudentIdScreen } from "@/features/student/student-id-screen";

/**
 * A parent looking at their child's card — practically, the person who will
 * actually print it.
 *
 * The screen is the student's own, unchanged: whether this parent may see this
 * child is decided by `buildStudentCard` → `assertApprovedChild` on the server,
 * not by which folder the route sits in. The checklist is hidden because every
 * item on it links to a screen only the student can act on.
 */
export default function Page({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = use(params);
  return <StudentIdScreen studentId={studentId} showChecklist={false} audience="parent" />;
}
