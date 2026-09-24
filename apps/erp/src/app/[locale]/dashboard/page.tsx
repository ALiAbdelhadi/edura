import { resolvePortalEntry } from "@/lib/auth/portal-gate";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(await resolvePortalEntry(locale));
}
