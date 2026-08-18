import { GuardianVerifyScreen } from "@/features/student/guardian-verify-screen";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edura",
  // A verification link is a private, single-use URL. It has no business in an
  // index, and a crawler that followed it would be one more thing pointed at a
  // token.
  robots: { index: false, follow: false },
};

/**
 * Where a guardian lands from the email.
 *
 * OUTSIDE the dashboard and behind NO login: the visitor is a parent with no
 * account. The page reads the token from the query and renders a button — it
 * confirms nothing on its own.
 */
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
