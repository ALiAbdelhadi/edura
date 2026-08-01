import { LandingScreen } from "@/features/landing/landing-screen";
import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The root page. Used to be a spinner that bounced everyone to /login — a
 * visitor to the product's own domain never saw what the product IS. Now:
 * a signed-in user (server-side session, not the old localStorage guess) goes
 * straight to their dashboard exactly as before; everyone else gets the
 * landing page.
 */
export default async function RootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getSessionUser();
  if (user) redirect(`/${locale}/dashboard`);
  return <LandingScreen />;
}
