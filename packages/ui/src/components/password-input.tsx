"use client";

import { Input } from "@repo/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import { Eye, EyeOff } from "lucide-react";
import * as React from "react";

export function PasswordInput({
  className,
  showLabel = "Show password",
  hideLabel = "Hide password",
  ...props
}: React.ComponentProps<typeof Input> & {
  showLabel?: string;
  hideLabel?: string;
}) {
  const [show, setShow] = React.useState(false);
  const label = show ? hideLabel : showLabel;
  return (
    <InputGroup>
      <InputGroupInput
        type={show ? "text" : "password"}
        className={className}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          type="button"
          size="icon-xs"
          onClick={() => setShow((s) => !s)}
          aria-label={label}
          aria-pressed={show}
          title={label}
        >
          {show ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
