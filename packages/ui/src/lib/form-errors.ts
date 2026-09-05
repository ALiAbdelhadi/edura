import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

/**
 * The `fields` map a 422 carries — `{ "email": ["Invalid email"] }` — produced
 * server-side by `parseOrThrow`/`ValidationError` and surfaced on the client as
 * `LocalizedApiError.fields`.
 */
export type ServerFieldErrors = Record<string, string[]>;

function firstMessage(messages: string[] | undefined): string | undefined {
  return messages?.find((m) => typeof m === "string" && m.trim() !== "");
}

/**
 * Puts a 422's field map onto the inputs it is about.
 *
 * The whole point of the server sending `fields` is that the operator is told
 * WHICH box is wrong; before this it collapsed into one generic toast, so a
 * form with eight inputs said "check the entered data" and nothing else. The
 * message lands on the field via RHF, which is what makes `aria-invalid` and
 * `aria-describedby` correct on the input itself — a screen reader announces
 * the error when focus reaches the box, not only as a toast that has gone.
 *
 * A key the form does not have (the server's `_` bucket, or a path from a
 * schema the dialog only partly renders) is NOT dropped: it goes to the form's
 * root error, so the dialog can render it above the fields. An error nobody can
 * see is the failure mode this replaces.
 *
 * Returns true when at least one message landed on a real field, which is the
 * signal a caller uses to suppress its generic toast.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  fields: ServerFieldErrors | undefined,
): boolean {
  if (!fields) return false;

  const known = new Set(Object.keys(form.getValues() ?? {}));
  const orphans: string[] = [];
  let placed = 0;

  for (const [key, messages] of Object.entries(fields)) {
    const message = firstMessage(messages);
    if (!message) continue;
    // "a.b.c" belongs to the field "a" the dialog renders.
    const head = key.split(".")[0] ?? key;
    if (key !== "_" && known.has(head)) {
      form.setError(key as Path<T>, { type: "server", message }, {
        shouldFocus: placed === 0,
      });
      placed += 1;
    } else {
      orphans.push(message);
    }
  }

  if (orphans.length > 0) {
    form.setError("root.serverError", { type: "server", message: orphans.join(" ") });
  }

  return placed > 0;
}

/** Clears everything {@link applyServerFieldErrors} set, before a resubmit. */
export function clearServerFieldErrors<T extends FieldValues>(form: UseFormReturn<T>): void {
  form.clearErrors("root.serverError");
  for (const name of Object.keys(form.getValues() ?? {})) {
    if (form.getFieldState(name as Path<T>).error?.type === "server") {
      form.clearErrors(name as Path<T>);
    }
  }
}
