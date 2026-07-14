"use client";

import * as React from "react";
import { Direction } from "radix-ui";

/**
 * Feeds `dir` into every Radix primitive (Select, DropdownMenu, Tabs, Slider,
 * Popover, Tooltip, Sheet…) so they mirror positioning + keyboard nav in Arabic.
 * shadcn does NOT add this — Radix defaults to LTR without it. Wrap the app tree
 * once, driven by the active locale.
 */
export function DirectionProvider({
  dir,
  children,
}: {
  dir: "ltr" | "rtl";
  children: React.ReactNode;
}) {
  return (
    <Direction.DirectionProvider dir={dir}>
      {children}
    </Direction.DirectionProvider>
  );
}
