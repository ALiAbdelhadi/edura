import { localizedTitle } from "@/lib/i18n/page-metadata";
import { use } from "react";
import { UserDetailScreen } from "@/features/admin/user-detail-screen";

export const generateMetadata = localizedTitle("users");

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <UserDetailScreen userId={id} />;
}
