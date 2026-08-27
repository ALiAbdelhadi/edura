import { ROLE_SLUGS } from "@/i18n/roles";

export const NAV_PATHS = ["pricing", "faq", "trust"] as const;
export type NavPath = (typeof NAV_PATHS)[number];

export const LEGAL_PATHS = ["privacy", "terms"] as const;
export type LegalPath = (typeof LEGAL_PATHS)[number];

export function isNavPath(value: string): value is NavPath {
  return (NAV_PATHS as readonly string[]).includes(value);
}

type PublicRoute = {
  path: string;
  priority: number;
  changeFrequency: "weekly" | "monthly" | "yearly";
};

export const PUBLIC_ROUTES: PublicRoute[] = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  ...ROLE_SLUGS.map((role) => ({
    path: `/for/${role}`,
    priority: 0.8,
    changeFrequency: "monthly" as const,
  })),
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.6, changeFrequency: "monthly" },
  { path: "/trust", priority: 0.6, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
];
