"use client";

import { Spinner } from "@/components/kit/spinner";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";
import type { LocalizedApiError } from "@repo/ui/lib/api-error";
import { applyServerFieldErrors, clearServerFieldErrors } from "@repo/ui/lib/form-errors";
import { useTranslations } from "next-intl";
import type * as React from "react";
import { useEffect, useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";

export type FieldValue = string | number | boolean | readonly (string | number)[];

type Values = Record<string, FieldValue>;

export type FieldSpec = {
  name: string;
  label: string;
  type: FieldKind;
  /** `select` only. Order is the order shown. */
  options?: { value: string; label: string }[];
  /** `textarea` only. */
  rows?: number;
  /** `number` only. A money box that must be positive passes 0.01. */
  min?: number;
  /** `number` only. A percentage box passes 100. */
  max?: number;
  /**
   * `custom` only. Renders the control itself, still wrapped in the shared
   * label / message frame. For a control the field kinds cannot express — a
   * picker that has to show a retry when its own fetch failed, say.
   */
  render?: (field: {
    name: string;
    value: FieldValue;
    onChange: (value: unknown) => void;
    onBlur: () => void;
  }) => React.ReactNode;
  hint?: string;
  required?: boolean;
  /**
   * Required only in some states — e.g. a course picker that matters only
   * when the broadcast is scoped to one course. Checked across the whole
   * value set, so the message still lands on this field.
   */
  requiredWhen?: (values: Values) => boolean;
  /**
   * A cross-field rule, returning the message when it fails. "End must be
   * after start" belongs to the end-time box, not to a toast that names
   * neither. Runs after the per-field checks, only when this field is filled.
   */
  validate?: (values: Values) => string | undefined;
  disabled?: boolean;
  placeholder?: string;
  /** Passed to the control, as it was before: the browser stops the typing. */
  maxLength?: number;
  /** The one field a single-field dialog should land in. */
  autoFocus?: boolean;
  dir?: "ltr" | "rtl";
};

type FieldKind =
  | "text"
  | "email"
  | "number"
  | "checkbox"
  | "textarea"
  | "select"
  | "date"
  | "time"
  | "custom";

const INPUT_TYPE: Record<string, string> = {
  text: "text",
  email: "email",
  number: "number",
  date: "date",
  time: "time",
};


/**
 * What `onSubmit` may hand back. `useAction` already returns exactly this on
 * failure, so a caller wires field-level validation by returning its result
 * instead of swallowing it.
 */
export type SubmitOutcome = { ok: boolean; error?: LocalizedApiError } | void;

/** "" , undefined, null and an empty set all mean the operator entered nothing. */
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === "";
}

function defaultsFor(fields: FieldSpec[], initial?: Record<string, unknown>): Values {
  const next: Values = {};
  for (const f of fields) {
    const v = initial?.[f.name];
    next[f.name] =
      typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? v
        : Array.isArray(v)
          ? (v as readonly (string | number)[])
          : f.type === "checkbox"
            ? false
            : "";
  }
  return next;
}

/**
 * The validation half of {@link EntityDialog}, without its chrome.
 *
 * A dialog that cannot be a plain field list — one that interleaves a derived
 * alert between inputs, or swaps its confirm button to destructive — still
 * wants the same three things: required-ness that lands on the field, a reset
 * when the dialog reopens, and a server 422 pinned to the input that caused
 * it. Re-deriving those per dialog is exactly the duplication M-11 is about,
 * so they live here and both kinds of dialog call the same code.
 */
export function useFieldForm({
  fields,
  initial,
  open = true,
  resetKey,
  onSubmit,
}: {
  fields: FieldSpec[];
  initial?: Record<string, unknown>;
  /** Dialogs pass their open flag; the form re-seeds each time it opens. */
  open?: boolean;
  /**
   * Inline editors have no open flag — they re-seed when the row they edit
   * changes. Pass anything that identifies the current subject.
   */
  resetKey?: string | number;
  onSubmit: (values: Values) => SubmitOutcome | Promise<SubmitOutcome>;
}) {
  const t = useTranslations();

  // Required-ness was re-implemented here as a `missingRequired` scan that
  // disabled Save and never said which box was empty. It is a schema now, so
  // the message lands on the field and the button stays reachable.
  const schema = useMemo(
    () => buildFieldSchema(fields, t as unknown as FieldMessages),
    [fields, t],
  );

  const form = useForm<Values>({
    // The shape is built from `fields` at runtime, so zod infers
    // Record<string, unknown> and cannot narrow to Values on its own.
    resolver: zodResolver(schema) as Resolver<Values>,
    defaultValues: defaultsFor(fields, initial),
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!open) return;
    form.reset(defaultsFor(fields, initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resetKey]);

  const submit = form.handleSubmit(async (values) => {
    // The resolver replaces field errors on every submit, but a root error the
    // server set is invisible to it — without this, a failure the operator has
    // since fixed keeps its banner on the next attempt.
    clearServerFieldErrors(form);
    const outcome = await onSubmit(values);
    if (outcome && outcome.ok === false) {
      // The server said which field it rejected; without this it reached the
      // operator only as a toast with no way back to the offending input.
      applyServerFieldErrors(form, outcome.error?.fields);
    }
  });

  const rootError = form.formState.errors.root?.serverError?.message;

  return { form, submit, rootError };
}

/** A server error that belongs to the form as a whole, not to one input. */
export function FormRootError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-red/40 bg-red-soft/40 p-3 text-[13px] text-red"
    >
      {message}
    </p>
  );
}

/**
 * Renders a slice of the field list. A bespoke dialog calls it more than once
 * to put its own content between two groups of inputs.
 */
export function FieldControls({
  fields,
  form,
  className = "grid gap-4 py-2",
}: {
  fields: FieldSpec[];
  form: ReturnType<typeof useFieldForm>["form"];
  /** Override to lay a group out in columns — the inline rate editors do. */
  className?: string;
}) {
  return (
    <div className={className}>
      {fields.map((f) => (
        <FormField
          key={f.name}
          control={form.control}
          name={f.name}
          render={({ field }) => {
            if (f.type === "checkbox") {
              return (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={Boolean(field.value)}
                      disabled={f.disabled}
                      onCheckedChange={(c) => field.onChange(c === true)}
                    />
                  </FormControl>
                  <FormLabel>{f.label}</FormLabel>
                  <FormMessage />
                </FormItem>
              );
            }

            let control: React.ReactNode;
            if (f.type === "custom") {
              control = f.render?.({
                name: field.name,
                value: field.value,
                onChange: field.onChange,
                onBlur: field.onBlur,
              });
            } else if (f.type === "select") {
              control = (
                <Select
                  value={String(field.value ?? "")}
                  disabled={f.disabled}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={f.placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {(f.options ?? []).map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          } else if (f.type === "textarea") {
            control = (
              <Textarea
                rows={f.rows ?? 3}
                maxLength={f.maxLength}
                autoFocus={f.autoFocus}
                dir={f.dir}
                placeholder={f.placeholder}
                disabled={f.disabled}
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={String(field.value ?? "")}
                onChange={(e) => field.onChange(e.target.value)}
              />
            );
          } else {
            control = (
              <Input
                type={INPUT_TYPE[f.type] ?? "text"}
                maxLength={f.maxLength}
                autoFocus={f.autoFocus}
                // Money and counts are entered to two decimals; the
                // browser rejects a fractional value under step=1.
                step={f.type === "number" ? "any" : undefined}
                dir={f.dir}
                placeholder={f.placeholder}
                disabled={f.disabled}
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={String(field.value ?? "")}
                onChange={(e) =>
                  field.onChange(
                    f.type === "number" && e.target.value !== ""
                      ? Number(e.target.value)
                      : e.target.value,
                  )
                }
              />
            );
          }

          return (
            <FormItem className="gap-1.5">
              <FormLabel>{f.label}</FormLabel>
              <FormControl>{control}</FormControl>
              {f.hint ? (
                <FormDescription className="text-xs text-ink-2">{f.hint}</FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          );
        }}
        />
      ))}
    </div>
  );
}

export function EntityDialog({
  open,
  onOpenChange,
  title,
  note,
  fields,
  initial,
  busy,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Explanatory text above the fields. */
  note?: React.ReactNode;
  fields: FieldSpec[];
  initial?: Record<string, unknown>;
  busy: boolean;
  /** Defaults to the generic Save. */
  submitLabel?: React.ReactNode;
  onSubmit: (values: Values) => SubmitOutcome | Promise<SubmitOutcome>;
}) {
  const t = useTranslations();
  const { form, submit, rootError } = useFieldForm({ fields, initial, open, onSubmit });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <Form {...form}>
          <DialogForm onSubmit={() => void submit()}>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>

            <FormRootError message={rootError} />
            {note ? <div className="text-xs text-ink-2">{note}</div> : null}

            <FieldControls fields={fields} form={form} />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                {t("actions.cancel")}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner /> : null}
                {submitLabel ?? t("actions.save")}
              </Button>
            </DialogFooter>
          </DialogForm>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The zod schema a field list implies. Exported so the rules that matter —
 * required-ness, the email format, a money box that may not be zero, and a
 * field required only in one mode — are testable without rendering a dialog.
 */
/** Just the three messages the schema needs, so a test can pass plain strings. */
export type FieldMessages = (
  key:
    | "common.fieldRequired"
    | "common.invalidEmail"
    | "common.minValue"
    | "common.maxValue",
  values?: Record<string, string | number>,
) => string;

export function buildFieldSchema(fields: FieldSpec[], t: FieldMessages) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const f of fields) {
      if (f.type === "checkbox") {
        shape[f.name] = z.boolean();
        continue;
      }
      if (f.type === "number") {
        let n = z.number({
          error: (issue) =>
            issue.input === undefined
              ? t("common.fieldRequired", { field: f.label })
              : undefined,
        });
        if (f.min !== undefined) {
          n = n.min(f.min, t("common.minValue", { field: f.label, min: f.min }));
        }
        if (f.max !== undefined) {
          n = n.max(f.max, t("common.maxValue", { field: f.label, max: f.max }));
        }
        // An amount box opens empty rather than pre-filled with 0, so "" has
        // to reach the schema as "nothing entered" and not as the number zero.
        // An optional number left blank stays blank -- a payout with no amount
        // means "the whole balance", not a missing answer.
        shape[f.name] = z.preprocess(
          (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
          f.required ? n : n.optional(),
        );
        continue;
      }
      if (f.type === "custom") {
        // A custom control may hold a string, a number or a set; the shared
        // required check below is what gives it meaning, not a string schema.
        shape[f.name] = z.any();
        continue;
      }
      let s = z.string().trim();
      // `abort` so an empty required box says "required" and stops, instead of
      // also complaining that "" is not a valid email address.
      if (f.required) {
        s = s.min(1, {
          error: t("common.fieldRequired", { field: f.label }),
          abort: true,
        });
      }
      // A typo caught here says which box is wrong; the same typo caught by the
      // server arrives as a toast with no way back to the input.
      if (f.type === "email") {
        s = f.required
          ? s.email(t("common.invalidEmail"))
          : (s.or(z.literal("")) as unknown as typeof s);
      }
      shape[f.name] = s;
    }

    const object = z.object(shape);
    const crossField = fields.filter(
      (f) => f.requiredWhen || f.validate || (f.required && f.type === "custom"),
    );
    if (crossField.length === 0) return object;

    return object.superRefine((raw, ctx) => {
      const values = raw as Values;
      for (const f of crossField) {
        const fail = (message: string) =>
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [f.name], message });

        if (isEmpty(values[f.name])) {
          if (f.required || f.requiredWhen?.(values)) {
            fail(t("common.fieldRequired", { field: f.label }));
          }
          // A rule like "end after start" has nothing to say about a box that
          // is still empty; the required message above already covers it.
          continue;
        }
        const message = f.validate?.(values);
        if (message) fail(message);
      }
    });
}
