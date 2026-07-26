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
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
