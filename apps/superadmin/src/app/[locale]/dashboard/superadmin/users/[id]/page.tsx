"use client";
import { use } from "react";
import { UserDetailScreen } from "@/features/admin/user-detail-screen";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <UserDetailScreen userId={id} />;
}
