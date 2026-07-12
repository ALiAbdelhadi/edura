import type { DefaultSession } from "next-auth";
import type { Role } from "@repo/database";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      centerId?: string;
      locale: "ar" | "en";
      name?: string | null;
      email?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: Role;
    centerId?: string;
    locale: "ar" | "en";
    email?: string | null;
    name?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    role: Role;
    centerId?: string;
    locale: "ar" | "en";
  }
}
