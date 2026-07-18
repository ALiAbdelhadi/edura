"use client";

import * as React from "react";
import { Direction } from "radix-ui";

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
