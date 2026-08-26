"use client";

import { createContext, useContext, type ReactNode } from "react";
import styles from "./emulator.module.css";

type Ctx = {
  target: string | null;
  onHit: (id: string) => void;
  onMiss: (id: string) => void;
};

const EmuCtx = createContext<Ctx>({ target: null, onHit: () => {}, onMiss: () => {} });

export function EmuTargetProvider({ value, children }: { value: Ctx; children: ReactNode }) {
  return <EmuCtx.Provider value={value}>{children}</EmuCtx.Provider>;
}

export function EmuTarget({
  id,
  onClick,
  children,
}: {
  id: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const { target, onHit, onMiss } = useContext(EmuCtx);
  const active = target === id;

  return (
    <button
      type="button"
      data-emu={id}
      data-active={active ? "1" : undefined}
      aria-current={active ? "step" : undefined}
      className={`${styles.target} w-full appearance-none bg-transparent p-0 text-start`}
      onClick={() => {
        onClick?.();
        if (active) onHit(id);
        else onMiss(id);
      }}
    >
      {children}
    </button>
  );
}
