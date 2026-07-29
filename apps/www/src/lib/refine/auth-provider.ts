import type { AuthProvider } from "@refinedev/core";
import { signIn, signOut, getSession } from "next-auth/react";
import { api } from "@/lib/api/client";
import { purgeUserScopedCaches } from "@/lib/pwa/purge-caches";
import { syncQueuedAttendance } from "@/lib/pwa/attendance-outbox";

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
    // Same rule as the login screen: never mint a session on top of a live one.
    // "/dashboard" resolves the portal from the server session, so a stale
    // client-side role can no longer steer the redirect.
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
      // Best-effort: give any offline-queued attendance a last chance to sync
      // before the session goes away. Everything the outbox exposes is
      // filtered by teacherId, so anything left unsynced (still offline) is
      // simply invisible to whichever account signs in next — no need to
      // block logout on it or discard it outright.
      //
      // Wrapped: a failure here (IndexedDB unavailable, sync throwing) must
      // never leave the user signed in. Clearing the session is the one part
      // of logout that is not optional.
      try {
        const session = await getSession();
        const teacherId = session?.user?.id;
        if (teacherId) await syncQueuedAttendance(teacherId);
      } catch {}
    }

    await signOut({ redirect: false });

    if (typeof window !== "undefined") {
      localStorage.removeItem("edura_state");
      // Confirm the session is really gone before handing the user to /login.
      // Landing on /login while still authenticated is what let the next
      // sign-in start from a stale identity on a shared device.
      try {
        if (await getSession()) {
          await signOut({ redirect: false });
        }
      } catch {}
      // Cached /api and page/RSC responses are scoped to the signed-out user —
      // must not leak to the next account on a shared device.
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
