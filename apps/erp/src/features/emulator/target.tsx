"use client";

/**
 * A control inside a simulation — SHARED by every role's emulator.
 *
 * The engine needs three things from every control and gets them all here, so
 * no screen has to know how highlighting works:
 *
 *  1. an id it can point a step at (`data-emu`);
 *  2. a highlight when it IS the current step's target;
 *  3. a refusal when it is not — pressing the wrong thing must say "not that
 *     one, this one" rather than silently doing nothing, which reads as a
 *     broken app and is exactly what a nervous first-time user concludes.
 *
 * It moved here from `features/student/emulator/` when the teacher emulator was
 * built; the student folder keeps a re-export shim, so every existing import
 * path and behaviour is unchanged.
 */

import { createContext, useContext, type ReactNode } from "react";
import styles from "./emulator.module.css";

type Ctx = {
  /** The id the current step wants pressed, if any. */
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
        // The action runs either way — refusing it would make the simulation
        // feel dead. What a miss changes is that the STEP does not advance,
        // and the learner is told where to press instead.
        onClick?.();
        if (active) onHit(id);
        else onMiss(id);
      }}
    >
      {children}
    </button>
  );
}
