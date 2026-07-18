"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const ROLE_TO_PORTAL: Record<string, string> = {
  admin: "/dashboard/admin",
  center_admin: "/dashboard/admin",
  super_admin: "/dashboard/superadmin",
  accountant: "/dashboard/finance",
  teacher: "/dashboard/teacher",
  assistant: "/dashboard/assistant",
  student: "/dashboard/student",
  parent: "/dashboard/parent",
};

export default function DashboardIndexPage() {
  const router = useRouter();

  useEffect(() => {
    let cached: string | null = null;
    try {
      const s = JSON.parse(localStorage.getItem("edura_state") || "{}");
      if (s.role && ROLE_TO_PORTAL[s.role]) {
        router.replace(ROLE_TO_PORTAL[s.role]);
        return;
      }
      cached = s.role ?? null;
    } catch {}

    const verifySession = async () => {
      let r = await fetch("/api/v1/me");
      if (r.status === 401) {
        await new Promise((res) => setTimeout(res, 1500));
        r = await fetch("/api/v1/me");
      }
      if (r.status === 401) {
        try {
          localStorage.removeItem("edura_state");
        } catch {}
        router.replace("/login");
        return;
      }
      try {
        const json = await r.json();
        if (!json?.data) return;
        const role = json.data.role;
        const target = ROLE_TO_PORTAL[role];
        if (!target) {
          router.replace("/login");
          return;
        }
        try {
          const s = JSON.parse(localStorage.getItem("edura_state") || "{}");
          localStorage.setItem(
            "edura_state",
            JSON.stringify({
              ...s,
              role: role === "center_admin" ? "admin" : role,
              name: json.data.name,
              email: json.data.email,
            }),
          );
        } catch {}
        router.replace(target);
      } catch {
        if (cached && ROLE_TO_PORTAL[cached])
          router.replace(ROLE_TO_PORTAL[cached]);
        else router.replace("/login");
      }
    };
    verifySession();
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
