"use client";

import { useRouter } from "@/i18n/navigation";
import { portalForRole, uiRoleForRole } from "@/lib/auth/portal";
import { useEffect } from "react";

export default function DashboardIndexPage() {
  const router = useRouter();

  useEffect(() => {
    const resolvePortal = async () => {
      let r = await fetch("/api/v1/me", { cache: "no-store" });
      if (r.status === 401) {
        await new Promise((res) => setTimeout(res, 1500));
        r = await fetch("/api/v1/me", { cache: "no-store" });
      }

      const json = r.ok ? await r.json().catch(() => null) : null;
      const user = json?.data;
      const target = portalForRole(user?.role);
      if (!target) {
        // Signed out, unreadable, or a role www does not host — never guess.
        try {
          localStorage.removeItem("edura_state");
        } catch {}
        router.replace("/login");
        return;
      }

      try {
        localStorage.setItem(
          "edura_state",
          JSON.stringify({
            role: uiRoleForRole(user.role),
            screen: "dashboard",
            name: user.name,
            email: user.email,
          }),
        );
      } catch {}

      router.replace(target);
    };

    resolvePortal().catch(() => router.replace("/login"));
  }, [router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f5f7",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          border: "3px solid #e0e2e8",
          borderTopColor: "#0fa5e9",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
