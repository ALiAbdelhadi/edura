"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/i18n/navigation";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    fetch("/api/v1/me/onboarding")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.data && j.data.onboardingCompleted === false) router.replace("/onboarding");
      })
      .catch(() => {
      });
  }, [router]);

  return <>{children}</>;
}
