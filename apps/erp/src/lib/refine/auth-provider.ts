import { api } from "@/lib/api/client";
import { authClient } from "@/lib/auth/client";
import { syncQueuedAttendance } from "@/lib/pwa/attendance-outbox";
import { purgeUserScopedCaches } from "@/lib/pwa/purge-caches";
import type { AuthProvider } from "@refinedev/core";

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

let sessionInflight: ReturnType<typeof authClient.getSession> | null = null;
let sessionAt = 0;
const SESSION_REUSE_MS = 2000;

export function resetSessionMemo() {
  sessionInflight = null;
  sessionAt = 0;
}

export async function currentSession() {
  const now = Date.now();
  if (!sessionInflight || now - sessionAt > SESSION_REUSE_MS) {
    sessionAt = now;
    sessionInflight = authClient.getSession();
  }
  const { data } = await sessionInflight;
  return data;
}

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    resetSessionMemo();
    if (typeof window !== "undefined") {
      try {
        if (await currentSession()) await authClient.signOut();
        localStorage.removeItem("edura_state");
      } catch {}
    }

    const { error } = await authClient.signIn.email({ email, password });
    resetSessionMemo();

    if (error) {
      return {
        success: false,
        error: {
          message: error.message ?? "Invalid credentials",
          statusCode: error.status ?? 401,
        },
      };
    }

    return {
      success: true,
      redirectTo: "/dashboard",
    };
  },

  logout: async () => {
    resetSessionMemo();
    if (typeof window !== "undefined") {
      try {
        const session = await currentSession();
        const teacherId = session?.user?.id;
        if (teacherId) await syncQueuedAttendance(teacherId);
      } catch {}
    }

    try {
      await authClient.signOut();
    } catch {}
    resetSessionMemo();

    if (typeof window !== "undefined") {
      localStorage.removeItem("edura_state");
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
      const session = await currentSession();
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
    const session = await currentSession();
    return (session?.user as { role?: string } | undefined)?.role ?? null;
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
