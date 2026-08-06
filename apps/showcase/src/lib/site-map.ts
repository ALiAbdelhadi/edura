export type RolePageKey = "owners" | "teachers" | "students" | "parents" | "trust";

export type RolePage = {
  href: `/${RolePageKey}`;
  navKey: RolePageKey;
  token: string;
};

export const ROLE_PAGES: readonly RolePage[] = [
  { href: "/owners", navKey: "owners", token: "--indigo" },
  { href: "/teachers", navKey: "teachers", token: "--teal" },
  { href: "/students", navKey: "students", token: "--amber" },
  { href: "/parents", navKey: "parents", token: "--red" },
  { href: "/trust", navKey: "trust", token: "--ink-2" },
] as const;
