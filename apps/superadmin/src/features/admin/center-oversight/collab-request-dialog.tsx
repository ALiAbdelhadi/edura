"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Handshake } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Form } from "@repo/ui/components/form";
import { Spinner } from "@/components/kit/spinner";
import {
  FieldControls,
  FormRootError,
  useFieldForm,
  type FieldSpec,
} from "@/features/admin/catalog/entity-dialog";
import { useAction } from "@/lib/api/use-action";
import { useAdminGet } from "./use-oversight";

type TeacherRow = { id: string; name: string | null; email: string | null; status: string };
type SubjectRow = { id: string; nameAr: string; nameEn?: string | null };
type OfferingRow = {
  id: string;
  gradeLevelId: string;
  trackId: string | null;
  isActive: boolean;
  gradeLevel: { id: string; nameAr: string; stage?: { nameAr?: string | null } | null } | null;
  track: { id: string; nameAr: string } | null;
};
type RoomRow = { id: string; name: string };

function useTimeOptions() {
  return useMemo(() => {
    const out: string[] = [];
    for (let h = 6; h <= 22; h++) {
      for (const m of [0, 30]) {
        if (h === 22 && m === 30) break;
        out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return out;
  }, []);
}

export function CollabRequestDialog({
  centerId,
  open,
  onOpenChange,
  onCreated,
}: {
  centerId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations("oversight");
  const locale = useLocale();
  const { run, busy: submitting } = useAction({
    url: `admin/centers/${centerId}/collaboration-requests`,
    successMsg: t("collabSentToast"),
    onSuccess: () => onCreated(),
  });
  const timeOptions = useTimeOptions();

  // Search text is UI state, not an answer: it filters the teacher list and is
  // never submitted, so it stays outside the form.
  const [teacherQuery, setTeacherQuery] = useState("");

  const teachersReq = useAdminGet<TeacherRow[]>("admin/teachers", {
    enabled: open,
    query: { status: "active", limit: "50", ...(teacherQuery.trim() ? { q: teacherQuery.trim() } : {}) },
  });
  const teachers = teachersReq.data ?? [];

  const subjectsReq = useAdminGet<SubjectRow[]>("admin/catalog/subjects", { enabled: open });
  const subjects = subjectsReq.data ?? [];

  const label = (ar: string, en?: string | null) => (locale === "ar" ? ar : (en ?? ar));

  const dayNames = [
    t("collabSun"),
    t("collabMon"),
    t("collabTue"),
    t("collabWed"),
    t("collabThu"),
    t("collabFri"),
    t("collabSat"),
  ];

  const fields: FieldSpec[] = [
    {
      name: "teacherId",
      label: t("collabTeacher"),
      type: "custom",
      required: true,
      render: (field) => (
        <>
          <Input
            value={teacherQuery}
            onChange={(e) => setTeacherQuery(e.target.value)}
            placeholder={t("collabTeacherSearch")}
            aria-label={t("collabTeacherSearch")}
          />
          <div className="mt-2">
            <Select value={String(field.value ?? "")} onValueChange={field.onChange}>
              <SelectTrigger className="w-full" aria-label={t("collabPickTeacher")}>
                <SelectValue placeholder={t("collabPickTeacher")} />
              </SelectTrigger>
              <SelectContent>
                {teachers.map((tr) => (
                  <SelectItem key={tr.id} value={tr.id}>
                    {tr.name ?? tr.email ?? tr.id}
                    {tr.email ? ` · ${tr.email}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!teachersReq.isLoading && teachers.length === 0 ? (
              <p className="mt-1 text-xs text-ink-2">{t("collabNoTeachers")}</p>
            ) : null}
          </div>
        </>
      ),
    },
    {
      name: "subjectId",
      label: t("collabSubject"),
      type: "select",
      required: true,
      placeholder: t("collabPickSubject"),
      options: subjects.map((s) => ({ value: s.id, label: label(s.nameAr, s.nameEn) })),
    },
    { name: "offeringId", label: t("collabYearTrack"), type: "custom", required: true },
    { name: "roomId", label: t("collabHall"), type: "custom", hint: t("collabHallNote") },
    { name: "days", label: t("collabDays"), type: "custom", required: true },
    {
      name: "startTime",
      label: t("collabFrom"),
      type: "select",
      required: true,
      options: timeOptions.map((v) => ({ value: v, label: v })),
    },
    {
      name: "endTime",
      label: t("collabTo"),
      type: "select",
      required: true,
      options: timeOptions.map((v) => ({ value: v, label: v })),
      // Was a toast that named neither box; now it lands on the end time.
      validate: (v) =>
        String(v.endTime) <= String(v.startTime) ? t("collabBadTimes") : undefined,
    },
    { name: "startDate", label: t("collabStartDate"), type: "date", required: true },
    {
      name: "expectedStudents",
      label: t("collabExpected"),
      type: "number",
      min: 1,
      placeholder: t("collabOptional"),
    },
    {
      name: "message",
      label: t("collabMessage"),
      type: "textarea",
      rows: 3,
      placeholder: t("collabOptional"),
    },
  ];

  const { form, submit, rootError } = useFieldForm({
    fields,
    open,
    initial: { startTime: "16:00", endTime: "18:00", days: [] },
    onSubmit: async (v) => {
      const picked = offerings.find((o) => o.id === v.offeringId);
      if (!picked) return;
      const message = String(v.message ?? "").trim();
      const expected = Number(v.expectedStudents);
      const res = await run({
        values: {
          teacherId: v.teacherId,
          subjectId: v.subjectId,
          gradeLevelId: picked.gradeLevelId,
          ...(picked.trackId ? { trackId: picked.trackId } : {}),
          ...(v.roomId ? { roomId: v.roomId } : {}),
          daysOfWeek: v.days,
          startTime: v.startTime,
          endTime: v.endTime,
          startDate: v.startDate,
          ...(Number.isFinite(expected) && expected > 0 ? { expectedStudents: expected } : {}),
          ...(message ? { message } : {}),
        },
      });
      if (res.ok) onOpenChange(false);
      return res;
    },
  });

  const subjectId = String(form.watch("subjectId") ?? "");
  const offeringsReq = useAdminGet<OfferingRow[]>("admin/catalog/offerings", {
    enabled: open && !!subjectId,
    query: { subjectId },
  });
  const offerings = (offeringsReq.data ?? []).filter((o) => o.isActive && o.gradeLevel);

  const roomsReq = useAdminGet<{ rooms: RoomRow[] }>(`admin/centers/${centerId}/rooms`, {
    enabled: open,
  });
  const rooms = roomsReq.data?.rooms ?? [];

  // A year/track only means something under a subject, so changing the subject
  // clears it rather than leaving a stale pairing that would submit.
  useEffect(() => {
    form.setValue("offeringId", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const withRenderers: FieldSpec[] = fields.map((f) => {
    if (f.name === "offeringId") {
      return {
        ...f,
        render: (field) => (
          <>
            <Select
              value={String(field.value ?? "")}
              onValueChange={field.onChange}
              disabled={!subjectId}
            >
              <SelectTrigger className="w-full" aria-label={t("collabYearTrack")}>
                <SelectValue
                  placeholder={subjectId ? t("collabPickYear") : t("collabPickSubjectFirst")}
                />
              </SelectTrigger>
              <SelectContent>
                {offerings.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.gradeLevel?.nameAr}
                    {o.track ? ` · ${o.track.nameAr}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {subjectId && !offeringsReq.isLoading && offerings.length === 0 ? (
              <p className="mt-1 text-xs text-destructive">{t("collabNoOfferings")}</p>
            ) : null}
          </>
        ),
      };
    }
    if (f.name === "roomId") {
      return {
        ...f,
        render: (field) => (
          <Select
            value={String(field.value ?? "") || "none"}
            onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
          >
            <SelectTrigger className="w-full" aria-label={t("collabHall")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("collabNoHall")}</SelectItem>
              {rooms.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      };
    }
    if (f.name === "days") {
      return {
        ...f,
        render: (field) => {
          const days = (field.value as number[] | undefined) ?? [];
          return (
            <div role="group" className="flex flex-wrap gap-1">
              {dayNames.map((name, i) => (
                <Button
                  key={i}
                  type="button"
                  size="sm"
                  aria-pressed={days.includes(i)}
                  variant={days.includes(i) ? "default" : "outline"}
                  onClick={() =>
                    field.onChange(
                      days.includes(i)
                        ? days.filter((x) => x !== i)
                        : [...days, i].sort((a, b) => a - b),
                    )
                  }
                >
                  {name}
                </Button>
              ))}
            </div>
          );
        },
      };
    }
    return f;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <Form {...form}>
          <DialogForm onSubmit={() => void submit()}>
            <DialogHeader>
              <DialogTitle>{t("collabCreateTitle")}</DialogTitle>
            </DialogHeader>

            <FormRootError message={rootError} />
            <p className="text-xs text-ink-2">{t("collabCreateNote")}</p>

            <FieldControls fields={withRenderers} form={form} />

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Spinner className="size-4" /> : null}
                {t("collabSend")}
              </Button>
            </DialogFooter>
          </DialogForm>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function CollabRequestButton({
  centerId,
  onDone,
}: {
  centerId: string;
  onDone: () => void;
}) {
  const t = useTranslations("oversight");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Handshake className="size-4" />
        {t("collabCreateCta")}
      </Button>
      <CollabRequestDialog
        centerId={centerId}
        open={open}
        onOpenChange={setOpen}
        onCreated={onDone}
      />
    </>
  );
}
