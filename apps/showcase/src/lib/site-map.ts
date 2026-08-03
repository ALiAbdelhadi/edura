/**
 * The showcase's OWN pages, in one place.
 *
 * Header, footer, the home page's role cards and `app/sitemap.ts` all read this
 * — the same discipline `MARKETING_LINKS` enforces in apps/www, and for the same
 * reason: a page that exists but is unreachable from the chrome, or reachable
 * but missing from the sitemap, is the drift that mechanism was built to stop.
 *
 * `navKey` is a key under the `nav` namespace, typed as a union so a typo is a
 * compile error rather than a raw "nav.teachrs" rendered on the page.
 */
export type RolePageKey = "owners" | "teachers" | "students" | "parents" | "trust";

export type RolePage = {
  href: `/${RolePageKey}`;
  navKey: RolePageKey;
  /** The token that colours this role's tab on the 3D notebook and its card. */
  token: string;
};

export const ROLE_PAGES: readonly RolePage[] = [
  { href: "/owners", navKey: "owners", token: "--indigo" },
  { href: "/teachers", navKey: "teachers", token: "--teal" },
  { href: "/students", navKey: "students", token: "--amber" },
  { href: "/parents", navKey: "parents", token: "--red" },
  { href: "/trust", navKey: "trust", token: "--ink-2" },
] as const;
