/* <DirectionalIcon> — the icon mirroring rule, as a component rather than a list.
   ══════════════════════════════════════════════════════════════════════════════

   Portal sessions will add icons this file has never heard of, so what they need is
   the RULE, not an enumeration.

   THE RULE: an icon flips if it points along the reading axis. It does not flip if it
   depicts an object.

     FLIPS — it means "back", "next", "onward", "in this direction":
       chevrons and arrows of every kind, back/next/previous, breadcrumb separators,
       progress and stepper connectors, table sort carets that imply order, the
       sidebar collapse/expand caret, "reply", indent/outdent, undo/redo.

     DOES NOT FLIP — it is a picture of a thing, and a thing does not mirror:
       lock, shield, clock, calendar, search (the handle is part of the object),
       bell, user, home, wallet, banknote, file, the Edura mark, and every logo.

   Two edge cases worth stating because both get argued:
     · A CLOCK does not flip. Time is not read along the text axis and a mirrored clock
       face reads as broken.
     · The SEAL does not flip. `rotate(-6deg)` is a physical metaphor — a stamp pressed
       slightly askew — and a stamp does not mirror when you turn the page around.

   Mechanism is `rtl:-scale-x-100`, matching what the app already does. Using this
   component instead of the raw class is preferred because the choice is then explicit
   and greppable: `<DirectionalIcon icon={ChevronLeft} />` states an intent that a bare
   className does not. */

import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@repo/ui/lib/utils";

export function DirectionalIcon({
  icon: Icon,
  className,
  ...props
}: { icon: LucideIcon } & React.ComponentProps<LucideIcon>) {
  return <Icon className={cn("rtl:-scale-x-100", className)} {...props} />;
}
