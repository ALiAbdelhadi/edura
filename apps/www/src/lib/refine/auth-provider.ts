import { api } from "@/lib/api/client";
import { syncQueuedAttendance } from "@/lib/pwa/attendance-outbox";
import { purgeUserScopedCaches } from "@/lib/pwa/purge-caches";
import type { AuthProvider } from "@refinedev/core";
import { getSession, signIn, signOut } from "next-auth/react";

export type MeResponse = {
  id: string;
  email: string;
  role: "student" | "parent" | "teacher" | "assistant" | "center_admin";
  status: string;
  name: string | null;
  locale: "ar" | "en";
  phone: string | null;
  emailVerified: boolean;
  centerId: string | null;
};

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    if (typeof window !== "undefined") {
      try {
        if (await getSession()) await signOut({ redirect: false });
        localStorage.removeItem("edura_state");
      } catch {}
    }

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
    if (typeof window !== "undefined") {
      try {
        const session = await getSession();
        const teacherId = session?.user?.id;
        if (teacherId) await syncQueuedAttendance(teacherId);
      } catch {}
    }

    await signOut({ redirect: false });

    if (typeof window !== "undefined") {
      localStorage.removeItem("edura_state");
      try {
        if (await getSession()) {
          await signOut({ redirect: false });
        }
      } catch {}
      await purgeUserScopedCaches();
    }
    return {
      success: true,
      redirectTo: "/login",
    };
  },

  check: async () => {
    const onLoginPage =
      typeof window !== "undefined" &&
      window.location.pathname.startsWith("/login");
    try {
      const session = await getSession();
      if (session?.user?.id) {
        return {
          authenticated: true,
        };
      }
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