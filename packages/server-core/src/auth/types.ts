import type { Role } from "@repo/database";

// Canonical session-user shape shared by every Edura app. Each app's own
// NextAuth glue (getSessionUser/requireSession) narrows to this type.
export type SessionUser = {
  id: string;
  role: Role;
  centerId?: string;
  locale: "ar" | "en";
  name?: string | null;
  email?: string | null;
};
