import type { AuthProvider } from "@refinedev/core";
import { signIn, signOut, getSession } from "next-auth/react";
import { api } from "@/lib/api/client";

export type MeResponse = {
  id: string;
  email: string;
  role: "student" | "parent" | "teacher" | "center_admin";
  status: string;
  name: string | null;
  locale: "ar" | "en";
  phone: string | null;
  emailVerified: boolean;
  centerId: string | null;
};

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      return {
        success: false,
        error: {
          message: result.error,
          statusCode: 401,
        },
      };
    }

    return {
      success: true,
      redirectTo: "/dashboard",
    };
  },

  logout: async () => {
    await signOut({ redirect: false });
    if (typeof window !== "undefined") {
      localStorage.removeItem("edura_state");
    }
    return {
      success: true,
      redirectTo: "/login",
    };
  },

  check: async () => {
    const onLoginPage =
      typeof window !== "undefined" && window.location.pathname.startsWith("/login");
    try {
      const session = await getSession();
      if (session?.user?.id) {
        return {
          authenticated: true,
        };
      }
      // Fallback to direct API call if session not in memory yet
      const me = await api.get("me").json<{ data: MeResponse }>();
      if (me.data?.id) {
        return {
          authenticated: true,
        };
      }
      return onLoginPage
        ? { authenticated: false }
        : { authenticated: false, redirectTo: "/login" };
    } catch {
      return onLoginPage
        ? { authenticated: false }
        : { authenticated: false, redirectTo: "/login" };
    }
  },

  onError: async (error: any) => {
    if (error?.statusCode === 401 || error?.status === 401) {
      return {
        redirectTo: "/login",
        logout: true,
      };
    }
    return {};
  },

  getPermissions: async () => {
    const session = await getSession();
    return session?.user?.role ?? null;
  },

  getIdentity: async () => {
    try {
      const response = await api.get("me").json<{ data: MeResponse }>();
      return response.data;
    } catch {
      return null;
    }
  },
};
