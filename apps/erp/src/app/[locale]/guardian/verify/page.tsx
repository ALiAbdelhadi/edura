import { GuardianVerifyScreen } from "@/features/student/guardian-verify-screen";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edura",
  robots: { index: false, follow: false },
};

export default async function GuardianVerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  return <GuardianVerifyScreen locale={locale === "en" ? "en" : "ar"} token={token ?? null} />;
}
