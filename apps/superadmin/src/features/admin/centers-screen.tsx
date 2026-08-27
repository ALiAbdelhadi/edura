"use client";

import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { Link } from "@/i18n/navigation";
import { amenityLabel } from "@/lib/rooms/amenities";
import { useCustom, useCustomMutation } from "@refinedev/core";
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
import { Num } from "@repo/ui/components/num";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { toast } from "@repo/ui/components/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import type { Locale } from "@repo/ui/lib/format";
import { Eye, Home, Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
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
  onSave: (r: M2Rate) => Promise<void>;
  onClear: () => Promise<void>;
  allowClear?: boolean;
}) {
  const t = useTranslations("centersAdmin");
  const seed = override ?? inherited;
  const [form, setForm] = useState<"fee" | "bp">(seed?.bp != null ? "bp" : "fee");
  const [value, setValue] = useState(
    seed?.bp != null ? bpToPct(seed.bp) : seed?.fee != null ? String(seed.fee / 100) : "",
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = override ?? inherited;
    setForm(s?.bp != null ? "bp" : "fee");
    setValue(s?.bp != null ? bpToPct(s.bp) : s?.fee != null ? String(s.fee / 100) : "");
  }, [override, inherited]);

  const num = Number(value);
  const valid =
    value.trim() !== "" &&
    Number.isFinite(num) &&
    num >= 0 &&
    (form === "bp" ? num <= 100 : true);

  const save = async () => {
    if (!valid) {
      toast.error(form === "bp" ? t("enterPctRange") : t("enterValidEgp"));
      return;
    }
    setBusy(true);
    try {
      await onSave(
        form === "fee"
          ? { fee: Math.round(num * 100), bp: null }
          : { fee: null, bp: Math.round(num * 100) },
      );
      toast.success(t("rateSaved"));
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("saveRateError"));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await onClear();
      toast.success(t("rateCleared"));
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("clearError"));
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
      <div className="grid grid-cols-2 gap-2">
        <div className="text-xs">
          <Label htmlFor="rate-form" className="text-xs font-normal">{t("rateForm")}</Label>
          <Select value={form} onValueChange={(v) => setForm(v as "fee" | "bp")}>
            <SelectTrigger id="rate-form" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fee">{t("egpPerStudent")}</SelectItem>
              <SelectItem value="bp">{t("pctOfLessonPerStudent")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="text-xs">
          {form === "fee" ? t("unitEgpPerStudent") : t("unitPctPerStudent")}
          <Input
            type="number"
            min={0}
            max={form === "bp" ? 100 : undefined}
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy || !valid}>
          {busy ? <Spinner /> : null}
          {t("saveRate")}
        </Button>
        {allowClear && override ? (
          <Button size="sm" variant="outline" onClick={clear} disabled={busy}>{t("clearOverride")}</Button>
        ) : null}
      </div>
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
  onSave: (m: PricingMethod[]) => Promise<void>;
}) {
  const t = useTranslations("centersAdmin");
  const [sel, setSel] = useState<PricingMethod[]>(methods);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSel(methods), [methods]);

  const toggle = (m: PricingMethod) =>
    setSel((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  const save = async () => {
    if (sel.length === 0) {
      toast.error(t("needOneMethod"));
      return;
    }
    setBusy(true);
    try {
      await onSave(sel);
      toast.success(t("methodsSaved"));
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("saveMethodsError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-medium">{t("allowedPricingMethods")}</span>
      {(Object.keys(METHOD_LABEL_KEYS) as PricingMethod[]).map((m) => (
        <div key={m} className="flex items-center gap-1.5 text-xs">
          <Checkbox
            id={`pricing-method-${m}`}
            checked={sel.includes(m)}
            onCheckedChange={() => toggle(m)}
          />
          <Label htmlFor={`pricing-method-${m}`} className="text-xs font-normal">
            {t(asKey(METHOD_LABEL_KEYS[m]))}
          </Label>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={save} disabled={busy || sel.length === 0}>
        {busy ? <Spinner /> : null}
        {t("saveMethods")}
      </Button>
    </div>
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
  onSave: (s: Split) => Promise<void>;
  onClear: () => Promise<void>;
  allowClear?: boolean;
}) {
  const t = useTranslations("centersAdmin");
  const seed = override ?? inherited;
  const [platform, setPlatform] = useState(seed ? bpToPct(seed.platformShareBp) : "");
  const [teacher, setTeacher] = useState(seed ? bpToPct(seed.teacherShareBp) : "");
  const [center, setCenter] = useState(seed ? bpToPct(seed.centerShareBp) : "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = override ?? inherited;
    if (s) {
      setPlatform(bpToPct(s.platformShareBp));
      setTeacher(bpToPct(s.teacherShareBp));
      setCenter(bpToPct(s.centerShareBp));
    }
  }, [override, inherited]);

  const nums = [Number(platform), Number(teacher), Number(center)];
  const sum = nums.reduce((a, b) => a + (Number.isFinite(b) ? b : NaN), 0);
  const valid = nums.every((n) => Number.isFinite(n) && n >= 0 && n <= 100) && Math.round(sum * 100) === 10000;

  const save = async () => {
    if (!valid) {
      toast.error(t("splitError"));
      return;
    }
    setBusy(true);
    try {
      await onSave({
        platformShareBp: Math.round(nums[0] * 100),
        teacherShareBp: Math.round(nums[1] * 100),
        centerShareBp: Math.round(nums[2] * 100),
      });
      toast.success(t("splitSaved"));
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("saveSplitError"));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await onClear();
      toast.success(t("overrideCleared"));
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("clearError"));
    } finally {
      setBusy(false);
    }
  };

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
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs">{t("platformPct")}<Input type="number" min={0} max={100} step="0.01" value={platform} onChange={(e) => setPlatform(e.target.value)} />
        </label>
        <label className="text-xs">{t("teacherPct")}<Input type="number" min={0} max={100} step="0.01" value={teacher} onChange={(e) => setTeacher(e.target.value)} />
        </label>
        <label className="text-xs">{t("centerPct")}<Input type="number" min={0} max={100} step="0.01" value={center} onChange={(e) => setCenter(e.target.value)} />
        </label>
      </div>
      <div className={`text-xs ${valid ? "text-ink-2" : "text-red"}`}>
        {t("sumLabel")}: {Number.isFinite(sum) ? sum : "—"}% {valid ? "" : t("mustEqual100")}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy || !valid}>
          {busy ? <Spinner /> : null}
          {t("save")}
        </Button>
        {allowClear && override ? (
          <Button size="sm" variant="outline" onClick={clear} disabled={busy}>{t("clearOverride")}</Button>
        ) : null}
      </div>
    </div>
  );
}

function CenterDetailDialog({ centerId, open, onOpenChange }: { centerId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("centersAdmin");
  const locale = useLocale() as Locale;
  const { mutateAsync: mutate } = useCustomMutation();

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

  const saveAffiliationShare = async (affiliationId: string, egp: string) => {
    const centerShare = egp.trim() === "" ? 0 : Math.round(Number(egp) * 100);
    if (!Number.isFinite(centerShare) || centerShare < 0) {
      toast.error(t("invalidAmount"));
      return;
    }
    try {
      await mutate({
        url: `admin/centers/${centerId}/affiliations/${affiliationId}`,
        method: "put",
        values: { centerShare },
      });
      toast.success(t("shareUpdated"));
      refetchAll();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("updateShareError"));
    }
  };

  const saveCenterSplit = async (s: Split) => {
    await mutate({ url: `admin/centers/${centerId}/split`, method: "put", values: s });
    refetchAll();
  };
  const clearCenterSplit = async () => {
    await mutate({ url: `admin/centers/${centerId}/split`, method: "delete", values: {} });
    refetchAll();
  };
  const saveRoomSplit = async (roomId: string, s: Split) => {
    await mutate({ url: `admin/centers/${centerId}/rooms/${roomId}/split`, method: "put", values: s });
    refetchAll();
  };
  const clearRoomSplit = async (roomId: string) => {
    await mutate({ url: `admin/centers/${centerId}/rooms/${roomId}/split`, method: "delete", values: {} });
    refetchAll();
  };
  const saveCenterM2Rate = async (r: M2Rate) => {
    await mutate({ url: `admin/centers/${centerId}/per-student-rate`, method: "put", values: r });
    refetchAll();
  };
  const clearCenterM2Rate = async () => {
    await mutate({ url: `admin/centers/${centerId}/per-student-rate`, method: "delete", values: {} });
    refetchAll();
  };
  const saveRoomM2Rate = async (roomId: string, r: M2Rate) => {
    await mutate({
      url: `admin/centers/${centerId}/rooms/${roomId}/per-student-rate`,
      method: "put",
      values: r,
    });
    refetchAll();
  };
  const clearRoomM2Rate = async (roomId: string) => {
    await mutate({
      url: `admin/centers/${centerId}/rooms/${roomId}/per-student-rate`,
      method: "delete",
      values: {},
    });
    refetchAll();
  };
  const saveRoomMethods = async (roomId: string, methods: PricingMethod[]) => {
    await mutate({
      url: `admin/centers/${centerId}/rooms/${roomId}`,
      method: "patch",
      values: { allowedPricingMethods: methods },
    });
    refetchAll();
  };
  const saveRoomPrice = async (roomId: string, priceEgp: string) => {
    const price = priceEgp.trim() === "" ? null : Math.round(Number(priceEgp) * 100);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      toast.error(t("invalidPrice"));
      return;
    }
    try {
      await mutate({ url: `admin/centers/${centerId}/rooms/${roomId}`, method: "patch", values: { price } });
      toast.success(t("priceUpdated"));
      refetchAll();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("updatePriceError"));
    }
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
  const { mutateAsync: mutate } = useCustomMutation();
  const req = useCustom({ url: "admin/revenue-split", method: "get" });
  const data = req.result?.data as { split: Split | null; m2Rate?: M2Rate | null } | undefined;

  const save = async (s: Split) => {
    await mutate({ url: "admin/revenue-split", method: "put", values: s });
    req.query.refetch();
  };
  const saveM2 = async (r: M2Rate) => {
    await mutate({ url: "admin/revenue-split/per-student-rate", method: "put", values: r });
    req.query.refetch();
  };
  const clearM2 = async () => {
    await mutate({ url: "admin/revenue-split/per-student-rate", method: "delete", values: {} });
    req.query.refetch();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("globalSplit")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {req.query.isLoading ? (
          <Spinner />
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

export function CentersScreen() {
  const t = useTranslations("centersAdmin");
  const tStatus = useTranslations("status");
  const [detailId, setDetailId] = useState<string | null>(null);
  const { query, result } = useCustom({ url: "admin/centers", method: "get", config: { query: { take: "100" } } });
  const centers = useMemo(() => asArray<any>(result?.data), [result]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />

      <GlobalSplitCard />
      <Card>
        <CardContent>
          {query.isLoading ? (
            <PageSpinner />
          ) : centers.length === 0 ? (
            <p className="p-4 text-sm text-ink-2">{t("noCenters")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colShortId")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead className="text-end">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {centers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.shortId}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{tStatus(asKey(c.status))}</Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-2">
                        <Button asChild size="sm">
                          <Link href={`/dashboard/superadmin/centers/${c.id}`}>
                            <Eye className="size-4" />{t("oversight")}</Link>
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setDetailId(c.id)}>
                          <Home className="size-4" />
                          {t("roomsAndSplit")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {detailId ? (
        <CenterDetailDialog
          centerId={detailId}
          open={!!detailId}
          onOpenChange={(o) => !o && setDetailId(null)}
        />
      ) : null}
    </div>
  );
}
