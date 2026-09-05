"use client";

import { Direction } from "radix-ui";

// Kit primitives render inside an Arabic-first app but sit BELOW next-intl and
// cannot read its messages. Direction is the one locale signal that reaches
// this layer -- the same source `useQueryStrings` reads, kept deliberately to
// the handful of strings a primitive emits on its own (screen-reader labels
// and the close affordance), never app copy.
const STRINGS = {
  ar: {
    loading: "جارٍ التحميل",
    close: "إغلاق",
    selectRow: "تحديد الصف",
    selectAll: "تحديد كل الصفوف",
  },
  en: {
    loading: "Loading",
    close: "Close",
    selectRow: "Select row",
    selectAll: "Select all rows",
  },
} as const;

export type KitStrings = Record<keyof (typeof STRINGS)["en"], string>;

export function useKitStrings(): KitStrings {
  return STRINGS[Direction.useDirection() === "rtl" ? "ar" : "en"];
}
