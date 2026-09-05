"use client";

import { PageSpinner, Spinner } from "@/components/kit/spinner";
import {
  FieldControls,
  FormRootError,
  useFieldForm,
  type FieldSpec,
} from "@/features/admin/catalog/entity-dialog";
import { Form } from "@repo/ui/components/form";
import { useAction } from "@/lib/api/use-action";
import type { ColumnDef } from "@/components/kit/data-table";
import { ListShell } from "@/components/kit/list-shell";
import { useCustomListScreen } from "@/lib/api/use-list-screen";
import { StatusBadge, statusTone } from "@repo/ui/components/status-badge";
import { Link } from "@/i18n/navigation";
import { amenityLabel } from "@/lib/rooms/amenities";
import { useCustom } from "@refinedev/core";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Num } from "@repo/ui/components/num";
import { toast } from "@repo/ui/components/sonner";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import type { Locale } from "@repo/ui/lib/format";
import { Building2, Eye, Home, Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { asArray } from "@/lib/refine/as-array";
import { asKey } from "@/lib/i18n/keys";

type Split = { platformShareBp: number; teacherShareBp: number; centerShareBp: number };
type ResolvedSplit = (Split & { source: "room" | "center" | "global" }) | null;
type M2Rate = { fee: number | null; bp: number | null };
type ResolvedM2Rate = (M2Rate & { source?: "room" | "center" | "global" }) | null;
type PricingMethod = "whole_room_percent" | "per_attending_student";

function bpToPct(bp: number) {
  return String(Math.round((bp / 100) * 100) / 100);
}

function M2RateEditor({
  label,
  override,
  inherited,
  onSave,
  onClear,
  allowClear = true,
}: {
  label: string;
  override: M2Rate | null;
  inherited: ResolvedM2Rate;
  onSave: (r: M2Rate) => Promise<unknown>;
  onClear: () => Promise<unknown>;
  allowClear?: boolean;
}) {
  const t = useTranslations("centersAdmin");
  const [busy, setBusy] = useState(false);
  const seed = override ?? inherited;

  // The unit is a display toggle rather than an answer -- it decides which key
  // is sent, and it has to be known BEFORE the schema is built so the label in
  // a validation message matches the unit on screen.
  const [mode, setMode] = useState<"fee" | "bp">(seed?.bp != null ? "bp" : "fee");
  const unitLabel = mode === "fee" ? t("unitEgpPerStudent") : t("unitPctPerStudent");

  const fields: FieldSpec[] = [
    {
      name: "value",
      label: unitLabel,
      type: "number",
      required: true,
      min: 0,
      // A percentage cannot exceed 100; an EGP-per-student fee has no ceiling.
      ...(mode === "bp" ? { max: 100 } : {}),
    },
  ];

  const { form, submit, rootError } = useFieldForm({
    fields,
    resetKey: `${mode}|${override?.fee ?? ""}|${override?.bp ?? ""}|${inherited?.fee ?? ""}|${inherited?.bp ?? ""}`,
    initial: {
      value: seed?.bp != null ? Number(bpToPct(seed.bp)) : seed?.fee != null ? seed.fee / 100 : "",
    },
    onSubmit: async (v) => {
      const num = Number(v.value);
      setBusy(true);
      try {
        await onSave(
          mode === "fee"
            ? { fee: Math.round(num * 100), bp: null }
            : { fee: null, bp: Math.round(num * 100) },
        );
      } finally {
        setBusy(false);
      }
    },
  });

  const clear = async () => {
    setBusy(true);
    try {
      await onClear();
    } finally {
      setBusy(false);
    }
  };

  const describe = (r: M2Rate) =>
    r.fee != null
      ? `${(r.fee / 100).toFixed(2)} ${t("perStudentUnitEgp")}`
      : `${(r.bp ?? 0) / 100}${t("perStudentUnitPct")}`;

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {override ? (
          <Badge variant="default">{allowClear ? t("overrideActive") : t("defaultBadge")}</Badge>
        ) : inherited ? (
          <Badge variant="secondary">
            {t("inheriting")}
            {inherited.source ? ` (${inherited.source})` : ""}: {describe(inherited)}
          </Badge>
        ) : (
          <Badge variant="outline">{t("notConfigured")}</Badge>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-2">
          <FormRootError message={rootError} />
          <div className="grid grid-cols-2 gap-2">
            <div className="text-xs">
              <Label htmlFor="rate-form" className="text-xs font-normal">{t("rateForm")}</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as "fee" | "bp")}>
                <SelectTrigger id="rate-form" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fee">{t("egpPerStudent")}</SelectItem>
                  <SelectItem value="bp">{t("pctOfLessonPerStudent")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <FieldControls className="" fields={fields} form={form} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy}>
              {busy ? <Spinner /> : null}
              {t("saveRate")}
            </Button>
            {allowClear && override ? (
              <Button size="sm" type="button" variant="outline" onClick={clear} disabled={busy}>
                {t("clearOverride")}
              </Button>
            ) : null}
          </div>
        </form>
      </Form>
    </div>
  );
}

const METHOD_LABEL_KEYS: Record<PricingMethod, string> = {
  whole_room_percent: "methodWholeRoom",
  per_attending_student: "methodPerStudent",
};

function RoomMethodsRow({
  methods,
  onSave,
}: {
  methods: PricingMethod[];
  onSave: (m: PricingMethod[]) => Promise<unknown>;
}) {
  const t = useTranslations("centersAdmin");
  const [busy, setBusy] = useState(false);

  // A set-valued field: "at least one method" is the shared empty check, so
  // the message lands on the group instead of on a toast.
  const fields: FieldSpec[] = [
    {
      name: "methods",
      label: t("allowedPricingMethods"),
      type: "custom",
      required: true,
      render: (field) => {
        const sel = (field.value as PricingMethod[] | undefined) ?? [];
        return (
          <div className="flex flex-wrap items-center gap-3">
            {(Object.keys(METHOD_LABEL_KEYS) as PricingMethod[]).map((m) => (
              <div key={m} className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  id={`pricing-method-${m}`}
                  checked={sel.includes(m)}
                  onCheckedChange={() =>
                    field.onChange(
                      sel.includes(m) ? sel.filter((x) => x !== m) : [...sel, m],
                    )
                  }
                />
                <Label htmlFor={`pricing-method-${m}`} className="text-xs font-normal">
                  {t(asKey(METHOD_LABEL_KEYS[m]))}
                </Label>
              </div>
            ))}
          </div>
        );
      },
    },
  ];

  const { form, submit, rootError } = useFieldForm({
    fields,
    resetKey: methods.join("|"),
    initial: { methods },
    onSubmit: async (v) => {
      setBusy(true);
      try {
        await onSave(v.methods as PricingMethod[]);
      } finally {
        setBusy(false);
      }
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <FormRootError message={rootError} />
        <FieldControls className="flex-1" fields={fields} form={form} />
        <Button size="sm" type="submit" variant="outline" disabled={busy}>
          {busy ? <Spinner /> : null}
          {t("saveMethods")}
        </Button>
      </form>
    </Form>
  );
}

function SplitEditor({
  label,
  override,
  inherited,
  onSave,
  onClear,
  allowClear = true,
}: {
  label: string;
  override: Split | null;
  inherited: ResolvedSplit;
  onSave: (s: Split) => Promise<unknown>;
  onClear: () => Promise<unknown>;
  allowClear?: boolean;
}) {
  const t = useTranslations("centersAdmin");
  const [busy, setBusy] = useState(false);
  const seed = override ?? inherited;

  const SHARES = ["platformShareBp", "teacherShareBp", "centerShareBp"] as const;
  const sumOf = (v: Record<string, unknown>) =>
    SHARES.reduce((total, k) => total + Number(v[k]), 0);

  // The three shares must land on 100%. The rule belongs to the split, not to
  // any one box, so it is attached to the last one and reported there — the
  // running total below still shows how far off it is.
  const fields: FieldSpec[] = [
    { name: "platformShareBp", label: t("platformPct"), type: "number", required: true, min: 0, max: 100 },
    { name: "teacherShareBp", label: t("teacherPct"), type: "number", required: true, min: 0, max: 100 },
    {
      name: "centerShareBp",
      label: t("centerPct"),
      type: "number",
      required: true,
      min: 0,
      max: 100,
      validate: (v) =>
        SHARES.every((k) => Number.isFinite(Number(v[k]))) &&
        Math.round(sumOf(v) * 100) !== 10000
          ? t("splitError")
          : undefined,
    },
  ];

  const { form, submit, rootError } = useFieldForm({
    fields,
    resetKey: SHARES.map((k) => (override ?? inherited)?.[k] ?? "").join("|"),
    initial: seed
      ? {
          platformShareBp: Number(bpToPct(seed.platformShareBp)),
          teacherShareBp: Number(bpToPct(seed.teacherShareBp)),
          centerShareBp: Number(bpToPct(seed.centerShareBp)),
        }
      : undefined,
    onSubmit: async (v) => {
      setBusy(true);
      try {
        await onSave({
          platformShareBp: Math.round(Number(v.platformShareBp) * 100),
          teacherShareBp: Math.round(Number(v.teacherShareBp) * 100),
          centerShareBp: Math.round(Number(v.centerShareBp) * 100),
        });
      } finally {
        setBusy(false);
      }
    },
  });

  const clear = async () => {
    setBusy(true);
    try {
      await onClear();
    } finally {
      setBusy(false);
    }
  };

  const watched = form.watch();
  const sum = sumOf(watched);
  const onTarget = Math.round(sum * 100) === 10000;

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {override ? (
          <Badge variant="default">{allowClear ? t("overrideActive") : t("defaultBadge")}</Badge>
        ) : inherited ? (
          <Badge variant="secondary">
            {t("inheriting")} ({inherited.source})
          </Badge>
        ) : null}
      </div>

      <Form {...form}>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-2">
          <FormRootError message={rootError} />
          <FieldControls className="grid grid-cols-3 gap-2" fields={fields} form={form} />
          <div className={`text-xs ${onTarget ? "text-ink-2" : "text-red"}`}>
            {t("sumLabel")}: {Number.isFinite(sum) ? sum : "—"}% {onTarget ? "" : t("mustEqual100")}
          </div>
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy}>
              {busy ? <Spinner /> : null}
              {t("save")}
            </Button>
            {allowClear && override ? (
              <Button size="sm" type="button" variant="outline" onClick={clear} disabled={busy}>
                {t("clearOverride")}
              </Button>
            ) : null}
          </div>
        </form>
      </Form>
    </div>
  );
}

function CenterDetailDialog({ centerId, open, onOpenChange }: { centerId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("centersAdmin");
  const locale = useLocale() as Locale;
  const splitReq = useCustom({
    url: `admin/centers/${centerId}/split`,
    method: "get",
    queryOptions: { enabled: open },
  });
  const roomsReq = useCustom({
    url: `admin/centers/${centerId}/rooms`,
    method: "get",
    queryOptions: { enabled: open },
  });
  const affReq = useCustom({
    url: `admin/centers/${centerId}/affiliations`,
    method: "get",
    queryOptions: { enabled: open },
  });

  const splitData = splitReq.result?.data as
    | {
        center: any;
        override: Split | null;
        global: Split | null;
        resolved: ResolvedSplit;
        m2Rate?: { override: M2Rate | null; global: M2Rate | null; resolved: ResolvedM2Rate };
      }
    | undefined;
  const roomsData = roomsReq.result?.data as
    | { center: any; centerSplit: ResolvedSplit; centerM2Rate?: ResolvedM2Rate; rooms: any[] }
    | undefined;

  const affData = affReq.result?.data as { affiliations: any[] } | undefined;

  const refetchAll = () => {
    splitReq.query.refetch();
    roomsReq.query.refetch();
    affReq.query.refetch();
  };

  // Every write in this dialog: one toast, one refetch. The editor components
  // below keep only their own field validation and their own busy spinner.
  const { run } = useAction({ onSuccess: refetchAll });

  const saveAffiliationShare = async (affiliationId: string, egp: string) => {
    const centerShare = egp.trim() === "" ? 0 : Math.round(Number(egp) * 100);
    if (!Number.isFinite(centerShare) || centerShare < 0) {
      toast.error(t("invalidAmount"));
      return;
    }
    await run({
      url: `admin/centers/${centerId}/affiliations/${affiliationId}`,
      method: "put",
      values: { centerShare },
      successMsg: t("shareUpdated"),
    });
  };

  const saveCenterSplit = async (s: Split) => {
    await run({
      url: `admin/centers/${centerId}/split`,
      method: "put",
      values: s,
      successMsg: t("splitSaved"),
    });
  };
  const clearCenterSplit = async () => {
    await run({
      url: `admin/centers/${centerId}/split`,
      method: "delete",
      values: {},
      successMsg: t("overrideCleared"),
    });
  };
  const saveRoomSplit = async (roomId: string, s: Split) => {
    await run({
      url: `admin/centers/${centerId}/rooms/${roomId}/split`,
      method: "put",
      values: s,
      successMsg: t("splitSaved"),
    });
  };
  const clearRoomSplit = async (roomId: string) => {
    await run({
      url: `admin/centers/${centerId}/rooms/${roomId}/split`,
      method: "delete",
      values: {},
      successMsg: t("overrideCleared"),
    });
  };
  const saveCenterM2Rate = async (r: M2Rate) => {
    await run({
      url: `admin/centers/${centerId}/per-student-rate`,
      method: "put",
      values: r,
      successMsg: t("rateSaved"),
    });
  };
  const clearCenterM2Rate = async () => {
    await run({
      url: `admin/centers/${centerId}/per-student-rate`,
      method: "delete",
      values: {},
      successMsg: t("rateCleared"),
    });
  };
  const saveRoomM2Rate = async (roomId: string, r: M2Rate) => {
    await run({
      url: `admin/centers/${centerId}/rooms/${roomId}/per-student-rate`,
      method: "put",
      values: r,
      successMsg: t("rateSaved"),
    });
  };
  const clearRoomM2Rate = async (roomId: string) => {
    await run({
      url: `admin/centers/${centerId}/rooms/${roomId}/per-student-rate`,
      method: "delete",
      values: {},
      successMsg: t("rateCleared"),
    });
  };
  const saveRoomMethods = async (roomId: string, methods: PricingMethod[]) => {
    await run({
      url: `admin/centers/${centerId}/rooms/${roomId}`,
      method: "patch",
      values: { allowedPricingMethods: methods },
      successMsg: t("methodsSaved"),
    });
  };
  const saveRoomPrice = async (roomId: string, priceEgp: string) => {
    const price = priceEgp.trim() === "" ? null : Math.round(Number(priceEgp) * 100);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      toast.error(t("invalidPrice"));
      return;
    }
    await run({
      url: `admin/centers/${centerId}/rooms/${roomId}`,
      method: "patch",
      values: { price },
      successMsg: t("priceUpdated"),
    });
  };

  const loading = splitReq.query.isLoading || roomsReq.query.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{splitData?.center?.name ?? roomsData?.center?.name ?? t("centerFallback")}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <PageSpinner />
        ) : (
          <div className="space-y-6">
            <Alert>
              <Info className="size-4" />
              <AlertTitle>{t("revenueSplit")}</AlertTitle>
              <AlertDescription>
                Resolution: per-room override → per-center override → global default. Editing here only
                affects courses created AFTER the change — existing courses keep the split they were
                created with. The center never sets its own split; it only sets room prices.
              </AlertDescription>
            </Alert>

            <div>
              <div className="mb-2 text-sm font-semibold">{t("centerSplit")}</div>
              <SplitEditor
                label={t("centerSplitHint")}
                override={splitData?.override ?? null}
                inherited={
                  splitData?.override
                    ? null
                    : splitData?.global
                      ? { ...splitData.global, source: "global" }
                      : null
                }
                onSave={saveCenterSplit}
                onClear={clearCenterSplit}
              />
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold">{t("perStudentRate")}</div>
              <M2RateEditor
                label={t("perStudentHint")}
                override={splitData?.m2Rate?.override ?? null}
                inherited={
                  splitData?.m2Rate?.override
                    ? null
                    : splitData?.m2Rate?.global
                      ? { ...splitData.m2Rate.global, source: "global" }
                      : null
                }
                onSave={saveCenterM2Rate}
                onClear={clearCenterM2Rate}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">{t("teacherArrangements")}</div>
              <p className="text-xs text-ink-2">
                Piasters per PRESENT student for a teacher&apos;s courses that book no hall.
                Neither the teacher nor the center can propose this — it is set here only.
                Unlike the hall split, it is read live at settlement, so a change affects
                future sessions of existing no-hall courses (already-settled sessions never
                change).
              </p>
              {(affData?.affiliations ?? []).length === 0 ? (
                <p className="text-sm text-ink-2">{t("noArrangements")}</p>
              ) : (
                (affData?.affiliations ?? []).map((a) => (
                  <AffiliationShareRow
                    key={a.id}
                    name={a.teacherName ?? a.teacherEmail ?? a.teacherId}
                    status={a.status}
                    noRoomCourses={a.noRoomCourses}
                    initial={a.centerShare ? String(a.centerShare / 100) : ""}
                    formatted={<Num.Money piasters={a.centerShare ?? 0} locale={locale} sign={false} />}
                    onSave={(v) => saveAffiliationShare(a.id, v)}
                  />
                ))
              )}
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold">{t("colRooms")}</div>
              {(roomsData?.rooms ?? []).length === 0 ? (
                <p className="text-sm text-ink-2">{t("noRooms")}</p>
              ) : (
                (roomsData?.rooms ?? []).map((room) => (
                  <Card key={room.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between text-base">
                        <span>{room.name}</span>
                        <span className="flex items-center gap-2">
                          {room.capacity != null ? (
                            <Badge variant="outline">{room.capacity} seats</Badge>
                          ) : null}
                          {(room.photos?.length ?? 0) > 0 ? (
                            <Badge variant="outline">{room.photos.length} photos</Badge>
                          ) : null}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {room.facilities?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {room.facilities.map((f: string) => (
                            <Badge key={f} variant="secondary">
                              {amenityLabel(f)}
                            </Badge>
                          ))}
                        </div>
                      ) : null}

                      <RoomMethodsRow
                        methods={(room.allowedPricingMethods ?? ["whole_room_percent"]) as PricingMethod[]}
                        onSave={(m) => saveRoomMethods(room.id, m)}
                      />

                      <RoomPriceRow
                        initial={room.price != null ? String(room.price / 100) : ""}
                        formatted={room.price != null ? <Num.Money piasters={room.price} locale={locale} sign={false} /> : "—"}
                        onSave={(v) => saveRoomPrice(room.id, v)}
                      />

                      <SplitEditor
                        label={t("roomSplitOverride")}
                        override={room.roomSplitOverride ?? null}
                        inherited={room.effectiveSplit ?? roomsData?.centerSplit ?? null}
                        onSave={(s) => saveRoomSplit(room.id, s)}
                        onClear={() => clearRoomSplit(room.id)}
                      />

                      <M2RateEditor
                        label={t("roomPerStudentOverride")}
                        override={room.roomM2Override ?? null}
                        inherited={
                          room.roomM2Override
                            ? null
                            : (room.effectiveM2Rate ?? roomsData?.centerM2Rate ?? null)
                        }
                        onSave={(r) => saveRoomM2Rate(room.id, r)}
                        onClear={() => clearRoomM2Rate(room.id)}
                      />
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AffiliationShareRow({
  name,
  status,
  noRoomCourses,
  initial,
  formatted,
  onSave,
}: {
  name: string;
  status: string;
  noRoomCourses: number;
  initial: string;
  formatted: React.ReactNode;
  onSave: (v: string) => Promise<void> | void;
}) {
  const t = useTranslations("centersAdmin");
  const [val, setVal] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setVal(initial), [initial]);
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
      <div className="min-w-40 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          {name}
          <Badge variant="secondary">{status}</Badge>
          {noRoomCourses === 0 ? (
            <Badge variant="outline">no hall-free courses — inert</Badge>
          ) : (
            <Badge variant="default">{noRoomCourses} hall-free course(s)</Badge>
          )}
        </div>
        <label className="text-xs">
          {t("sharePerStudent")} {formatted}
          <Input
            type="number"
            min={0}
            step="0.01"
            value={val}
            onChange={(e) => setVal(e.target.value)}
          />
        </label>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave(val);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Spinner /> : null}
        Save share
      </Button>
    </div>
  );
}

function RoomPriceRow({
  initial,
  formatted,
  onSave,
}: {
  initial: string;
  formatted: React.ReactNode;
  onSave: (v: string) => Promise<void> | void;
}) {
  const t = useTranslations("centersAdmin");
  const [val, setVal] = useState(initial);
  useEffect(() => setVal(initial), [initial]);
  return (
    <div className="flex items-end gap-2">
      <label className="text-xs">
        {t("hallPriceCurrent")} {formatted}
        <Input type="number" min={0} step="0.01" value={val} onChange={(e) => setVal(e.target.value)} />
      </label>
      <Button size="sm" variant="outline" onClick={() => onSave(val)}>{t("savePrice")}</Button>
    </div>
  );
}

function GlobalSplitCard() {
  const t = useTranslations("centersAdmin");
  const queryStrings = useQueryStrings();
  const req = useCustom({ url: "admin/revenue-split", method: "get" });
  const data = req.result?.data as { split: Split | null; m2Rate?: M2Rate | null } | undefined;

  const { run } = useAction({ onSuccess: () => req.query.refetch() });

  const save = (s: Split) =>
    run({
      url: "admin/revenue-split",
      method: "put",
      values: s,
      successMsg: t("splitSaved"),
    });
  const saveM2 = (r: M2Rate) =>
    run({
      url: "admin/revenue-split/per-student-rate",
      method: "put",
      values: r,
      successMsg: t("rateSaved"),
    });
  const clearM2 = () =>
    run({
      url: "admin/revenue-split/per-student-rate",
      method: "delete",
      values: {},
      successMsg: t("rateCleared"),
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("globalSplit")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {req.query.isLoading ? (
          <Spinner />
        ) : req.query.isError ? (
          <LoadError
            message={queryStrings.loadFailed}
            onRetry={() => req.query.refetch()}
            retryLabel={queryStrings.retry}
          />
        ) : (
          <>
            <SplitEditor
              label={t("globalSplitHint")}
              override={data?.split ?? null}
              inherited={null}
              onSave={save}
              onClear={async () => {}}
              allowClear={false}
            />
            <M2RateEditor
              label={t("globalPerStudent")}
              override={data?.m2Rate ?? null}
              inherited={null}
              onSave={saveM2}
              onClear={clearM2}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

type CenterRow = {
  id: string;
  name: string;
  shortId: string;
  status: string;
};

export function CentersScreen() {
  const t = useTranslations("centersAdmin");
  const tStatus = useTranslations("status");
  const [detailId, setDetailId] = useState<string | null>(null);

  // The endpoint returns the whole set behind `take`, so there is no page to
  // step through — only the load/denied/error/empty branch every list shares.
  const list = useCustomListScreen<CenterRow>({
    url: "admin/centers",
    paginated: false,
    extraQuery: { take: "100" },
    select: (data) => {
      const rows = asArray<CenterRow>(data);
      return { rows, total: rows.length };
    },
  });

  const columns: ColumnDef<CenterRow, unknown>[] = [
    {
      id: "name",
      header: t("colName"),
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: "shortId",
      header: t("colShortId"),
      cell: ({ row }) => row.original.shortId,
    },
    {
      id: "status",
      header: t("colStatus"),
      cell: ({ row }) => (
        <StatusBadge tone={statusTone(row.original.status)}>
          {tStatus(asKey(row.original.status))}
        </StatusBadge>
      ),
    },
    {
      id: "actions",
      header: "",
      meta: { align: "end", srLabel: t("colActions") },
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button asChild size="sm">
            <Link href={`/dashboard/superadmin/centers/${row.original.id}`}>
              <Eye className="size-4" />
              {t("oversight")}
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDetailId(row.original.id)}>
            <Home className="size-4" />
            {t("roomsAndSplit")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <ListShell
      list={list}
      title={t("title")}
      columns={columns}
      notice={<GlobalSplitCard />}
      emptyIcon={Building2}
      emptyTitle={t("noCenters")}
    >
      {detailId ? (
        <CenterDetailDialog
          centerId={detailId}
          open={!!detailId}
          onOpenChange={(o) => !o && setDetailId(null)}
        />
      ) : null}
    </ListShell>
  );
}
