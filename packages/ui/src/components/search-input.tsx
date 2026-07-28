"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import { Spinner } from "@repo/ui/components/spinner";
import { cn } from "@repo/ui/lib/utils";
import { Search, X } from "lucide-react";
import * as React from "react";

/* <SearchInput> — every search field in the product.
   ══════════════════════════════════════════════════════════════════════════════

   Replaces a composition that was hand-assembled in ELEVEN places:

     <div className="relative">
       <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 …" />
       <Input className="ps-9 pe-9" />
       <button className="absolute end-2 top-1/2 -translate-y-1/2">…</button>
     </div>
     <Button>Search</Button>

   Four things were wrong with that, and none of them are cosmetic:

   1. THE ICON WAS ABSOLUTELY POSITIONED, and the input compensated with a manual
      `ps-9`. Two numbers that must agree, written separately, eleven times — and they
      had already drifted (the offsets were `inset-inline-start-3`, a class Tailwind
      does not generate, so the icons sat flush against the edge).
   2. THE ACTION BUTTON WAS A SEPARATE ELEMENT with `gap-2` between them, so a search
      field and its Search button read as two detached boxes rather than one control.
   3. FOCUS WAS ON THE INPUT ALONE. The ring drew around the middle of the group while
      the icon and button sat outside it.
   4. The clear button was a bare `<button>` with no `type="button"`, so inside a form
      it submitted.

   `InputGroup` — which shadcn already ships and `PasswordInput` already used — solves
   all four: one bordered control, addons laid out by flex rather than absolute
   positioning, and a focus ring on the whole group via `has-[…:focus-visible]`. */

export function SearchInput({
  value,
  onValueChange,
  placeholder,
  /** Enter, and the action button if there is one. */
  onSubmit,
  /** Renders a clear affordance while the field is non-empty. */
  onClear,
  clearLabel,
  /** Trailing action inside the group, e.g. an explicit Search button. */
  action,
  /** `touch` is the counter: 48px group, 16px type. See CONSTITUTION §4. */
  density = "default",
  autoFocus,
  inputMode,
  name,
  id,
  className,
  dir,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  onClear?: () => void;
  clearLabel?: string;
  action?: { label: React.ReactNode; onClick: () => void; busy?: boolean; disabled?: boolean };
  density?: "default" | "touch";
  autoFocus?: boolean;
  inputMode?: React.ComponentProps<"input">["inputMode"];
  name?: string;
  id?: string;
  className?: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <InputGroup
      className={cn(density === "touch" && "h-12", className)}
      dir={dir}
    >
      <InputGroupAddon align="inline-start">
        <Search className={cn(density === "touch" && "size-5")} aria-hidden="true" />
      </InputGroupAddon>

      <InputGroupInput
        id={id}
        name={name}
        type="search"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        inputMode={inputMode}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className={cn(density === "touch" && "text-base")}
      />

      {onClear && value ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={onClear}
            aria-label={clearLabel}
            title={clearLabel}
          >
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}

      {action ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="button"
            onClick={action.onClick}
            disabled={action.disabled || action.busy}
            size={density === "touch" ? "sm" : "xs"}
            variant="default"
          >
            {action.busy ? <Spinner className="size-4" /> : null}
            {action.label}
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
