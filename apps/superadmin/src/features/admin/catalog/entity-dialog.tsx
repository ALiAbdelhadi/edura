"use client";

import { Spinner } from "@/components/kit/spinner";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export type FieldValue = string | number | boolean;

export type FieldSpec = {
  name: string;
  label: string;
  type: "text" | "number" | "checkbox";
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  dir?: "ltr" | "rtl";
};

export function EntityDialog({
  open,
  onOpenChange,
  title,
  fields,
  initial,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: FieldSpec[];
  initial?: Record<string, unknown>;
  busy: boolean;
  onSubmit: (values: Record<string, FieldValue>) => void | Promise<void>;
}) {
  const t = useTranslations();
  const [values, setValues] = useState<Record<string, FieldValue>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, FieldValue> = {};
    for (const f of fields) {
      const v = initial?.[f.name];
      next[f.name] =
        typeof v === "string" || typeof v === "number" || typeof v === "boolean"
          ? v
          : f.type === "checkbox"
            ? false
            : f.type === "number"
              ? 0
              : "";
    }
    setValues(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (name: string, v: FieldValue) => setValues((prev) => ({ ...prev, [name]: v }));

  const missingRequired = fields.some(
    (f) => f.required && f.type !== "checkbox" && String(values[f.name] ?? "").trim() === "",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {fields.map((f) =>
            f.type === "checkbox" ? (
              <div key={f.name} className="flex items-center gap-2">
                <Checkbox
                  id={`fld-${f.name}`}
                  checked={Boolean(values[f.name])}
                  disabled={f.disabled}
                  onCheckedChange={(c) => set(f.name, c === true)}
                />
                <Label htmlFor={`fld-${f.name}`}>{f.label}</Label>
              </div>
            ) : (
              <div key={f.name} className="grid gap-1.5">
                <Label htmlFor={`fld-${f.name}`}>{f.label}</Label>
                <Input
                  id={`fld-${f.name}`}
                  type={f.type === "number" ? "number" : "text"}
                  dir={f.dir}
                  value={String(values[f.name] ?? "")}
                  placeholder={f.placeholder}
                  disabled={f.disabled}
                  onChange={(e) =>
                    set(f.name, f.type === "number" ? Number(e.target.value) : e.target.value)
                  }
                />
                {f.hint ? <p className="text-xs text-muted-foreground">{f.hint}</p> : null}
              </div>
            ),
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={() => void onSubmit(values)} disabled={busy || missingRequired}>
            {busy ? <Spinner /> : null}
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
