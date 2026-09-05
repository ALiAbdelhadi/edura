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
export function SearchInput({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  onSubmit,
  onClear,
  clearLabel,
  action,
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
  ariaLabel?: string;
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
        aria-label={ariaLabel ?? placeholder}
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
