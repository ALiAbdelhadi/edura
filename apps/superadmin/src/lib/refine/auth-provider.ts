import type { AuthProvider } from "@refinedev/core";
import { authClient } from "@/lib/auth/client";
import { api } from "@/lib/api/client";

export type MeResponse = {
  id: string;
  email: string;
  role: "super_admin" | "accountant";
  status: string;
  name: string | null;
  locale: "ar" | "en";
  phone: string | null;
  emailVerified: boolean;
};

async function currentSession() {
  const { data } = await authClient.getSession();
  return data;
}

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    const { data, error } = await authClient.signIn.email({ email, password });

    if (error) {
      return {
        success: false,
        error: {
          message: error.message ?? "Invalid credentials",
          statusCode: error.status ?? 401,
        },
      };
    }

    // Password correct + TOTP enrolled: hand off to the second-factor screen.
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      return { success: true, redirectTo: "/two-factor" };
    }

    return {
      success: true,
      redirectTo: "/dashboard",
    };
  },

  logout: async () => {
    try {
      await authClient.signOut();
    } catch {}
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
