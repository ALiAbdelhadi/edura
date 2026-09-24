import { ledgerMono, ledgerShellScope } from "@/components/ledger";
import type { ReactNode } from "react";
import styles from "./landing.module.css";

export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${ledgerMono.variable} ${ledgerShellScope} ${styles.landing} min-h-dvh`}
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      {children}
    </div>
  );
}
