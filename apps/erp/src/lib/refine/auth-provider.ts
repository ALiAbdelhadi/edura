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

async function currentSession() {
  const { data } = await authClient.getSession();
  return data;
}

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    if (typeof window !== "undefined") {
      try {
        if (await currentSession()) await authClient.signOut();
        localStorage.removeItem("edura_state");
      } catch {}
    }

    const { error } = await authClient.signIn.email({ email, password });

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
    if (typeof window !== "undefined") {
      try {
        const session = await currentSession();
        const teacherId = session?.user?.id;
        if (teacherId) await syncQueuedAttendance(teacherId);
      } catch {}
    }

    // ONE sign-out. It used to be called again if a session survived the first
    // — a workaround for better-auth revoking only the credential it resolves,
    // which is why a jar holding two of them needed several presses and
    // reported success every time. The server side now revokes every session
    // the request presented (app/api/auth/[...all]/route.ts), so the retry is
    // covering a hole that is closed, and a second call on the way to /login
    // only races the first. See docs/reports/session-identity-mismatch.md.
    try {
      await authClient.signOut();
    } catch {}

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
