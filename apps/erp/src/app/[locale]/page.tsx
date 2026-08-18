import { getSessionUser } from "@/lib/auth/session";
import { marketingSiteUrl } from "@/lib/marketing-site";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const user = await getSessionUser();
  if (user) redirect(`/${locale}/dashboard`);

  const marketing = marketingSiteUrl();
  redirect(marketing ? `${marketing}/${locale}` : `/${locale}/login`);
}
