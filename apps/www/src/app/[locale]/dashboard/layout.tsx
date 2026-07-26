/**
 * This layout renders nothing but its children, and every page beneath it is a
 * client component (or a thin wrapper around one) that fetches its own data
 * from /api/v1/** after hydration. No server data is read anywhere in this
 * subtree, so the prerendered HTML is a shell: fonts, theme bootstrap, i18n
 * messages and a loading skeleton. It contains no session, no identity and no
 * user data.
 *
 * It therefore carries NO route segment config. It previously had
 * `export const dynamic = "force-dynamic"`, which forced a per-request server
 * render of ~73 shells that contain nothing request-specific — pure cost, no
 * benefit. (Removed 2026-07-26; see docs/reports/rendering-optimization-plan.md
 * §4.2 for the proof that no prerendered shell leaks user data.)
 *
 * IMPORTANT — this is not an authorization boundary and never was.
 * `force-dynamic` granted no protection: access control lives in the client
 * `RoleGuard` in each role layout and, authoritatively, in the auth gate on
 * every /api/v1/** handler (all of which remain force-dynamic). If you ever
 * add a server component under this layout that reads cookies(), headers() or
 * a session, Next will fail the build rather than leak — do not "fix" that by
 * restoring force-dynamic here; scope the dynamic behaviour to that segment.
 */
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";

/**
 * It also mounts the full message dictionary. The root layout ships only the
 * base namespaces so that public pages (login especially) stop carrying the
 * admin/teacher/parent/student blocks. Everything under /dashboard keeps the
 * COMPLETE dictionary, so no dashboard screen's translations change — the
 * per-role split is deliberately left as a follow-up, because `staff/layout.tsx`
 * uses hooks and could not host a provider without refactoring the center-staff
 * delegation boundary.
 */
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Next's generated LayoutProps types `locale` as string; narrow with
  // next-intl's own guard rather than casting. An invalid locale is already
  // notFound()-ed by the root layout, so the else branch is unreachable.
  if (hasLocale(routing.locales, locale)) setRequestLocale(locale);
  return (
    <NextIntlClientProvider messages={await getMessages()}>
      {children}
    </NextIntlClientProvider>
  );
}
