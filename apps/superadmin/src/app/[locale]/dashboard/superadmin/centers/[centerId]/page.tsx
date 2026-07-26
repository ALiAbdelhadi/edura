import { CenterOversightScreen } from "@/features/admin/center-oversight/center-oversight-screen";

export const metadata = { title: "Center oversight | Edura Back-office" };

export default async function CenterOversightPage({
  params,
}: {
  params: Promise<{ centerId: string }>;
}) {
  const { centerId } = await params;
  return <CenterOversightScreen centerId={centerId} />;
}
