import { localizedTitle } from "@/lib/i18n/page-metadata";
import { CenterOversightScreen } from "@/features/admin/center-oversight/center-oversight-screen";

export const generateMetadata = localizedTitle("centers");

export default async function CenterOversightPage({
  params,
}: {
  params: Promise<{ centerId: string }>;
}) {
  const { centerId } = await params;
  return <CenterOversightScreen centerId={centerId} />;
}
