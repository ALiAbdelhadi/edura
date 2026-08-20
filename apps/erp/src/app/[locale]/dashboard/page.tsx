import { redirect } from "next/navigation";
import { resolvePortalEntry } from "@/lib/auth/portal-gate";

export const dynamic = "force-dynamic";

/**
 * The role router. It is a REDIRECT, and now nothing else.
 *
 * It used to be a client component that painted a full-screen spinner, fetched
 * `/api/v1/me`, and — on a 401 — slept 1500ms and fetched again before deciding
 * anything. That sleep existed because the session cookie was sometimes not yet
 * readable by the browser right after sign-in; read on the server from the
 * request's own cookies the race does not exist, so neither does the wait.
 *
 * It also wrote an `edura_state` blob to localStorage. Nothing in either app
 * READS that key — it is written at login too, and everywhere else only removed
 * — so the write is not reproduced here.
 */
export default async function DashboardIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(await resolvePortalEntry(locale));
}
