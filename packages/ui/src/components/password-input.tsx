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

/* A password is typed in Latin characters, so the field is LTR by default —
   and the direction sits on the GROUP, never on the `<input>` alone.

   Two reasons, both measured on `/ar/login`:

   1. WITHOUT IT the password field inherits the page's RTL while the email
      field above it carries `dir="ltr"`, so two fields in the same form put
      their caret and placeholder on opposite sides. The email field has said
      `dir="ltr"` since it was written; the password field lost the same
      attribute in f9a19d8 when the parallel workstreams were consolidated.

   2. ON THE GROUP, NOT THE FIELD, for the reason the register page already
      documents about its icon wrappers: the reveal button is placed with
      `order-last` and logical padding (`pe-3`, and the group's
      `[&>input]:pe-2`). An LTR input inside an RTL group puts the text at the
      left edge and the button at the left edge with it, while the padding cut
      for the button is reserved on the right. Turning the whole group LTR keeps
      the button and the space made for it on the same side. The input inherits
      the direction, so it carries no `dir` of its own. */
export function PasswordInput({
  className,
  dir = "ltr",
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
    <InputGroup dir={dir}>
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
