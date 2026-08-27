import type { Role } from "@repo/database";

export type SessionUser = {
  id: string;
  role: Role;
  centerId?: string;
  locale: "ar" | "en";
  name?: string | null;
  email?: string | null;
};
