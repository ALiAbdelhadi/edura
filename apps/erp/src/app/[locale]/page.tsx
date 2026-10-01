import { marketingSiteUrl } from "@/lib/marketing-site";
import { ssrSession } from "@/lib/server/ssr-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const { user } = await ssrSession();
  if (user) redirect(`/${locale}/dashboard`);

  const marketing = marketingSiteUrl();
  redirect(marketing ? `${marketing}/${locale}` : `/${locale}/login`);
}
