"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useCustomMutation } from "@refinedev/core";
import { Handshake } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { toast } from "@repo/ui/components/sonner";
import { Spinner } from "@/components/kit/spinner";
import { useAdminGet } from "./use-oversight";

// ---------------------------------------------------------------------------
// Send a collaboration request AS this center, from the back office.
//
// `roster/teachers/invite` next to this button is shell-account onboarding and
// refuses a teacher who already has an account (409) — Step 5 made the
// collaboration request the one way a REGISTERED teacher joins a center, and
// this is that door. It posts to the center-scoped route, which takes the
// center from the URL, so this dialog cannot aim at another center.
//
// Two things the form deliberately does NOT have:
//   • any money input — every rate is superadmin-only config applied by the
//     kernel (the request carries a forced 0);
//   • a pricing-method picker — on a hall that offers both, the TEACHER picks
//     when accepting. A center-initiated request that pre-picks is refused
//     server-side, so offering the control here would only manufacture errors.
//
// The subject → grade/track pickers are driven by `catalog/offerings`, i.e. the
// catalog's own record of which combinations exist. The kernel re-checks the
// offering anyway; sourcing the options from it means the operator cannot pick
// a pair that check would reject.
// ---------------------------------------------------------------------------

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

/** "HH:mm" slots, 06:00–22:00 in half hours — same range the center portal uses. */
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
  const { mutateAsync } = useCustomMutation();
  const timeOptions = useTimeOptions();

  const [teacherQuery, setTeacherQuery] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [offeringKey, setOfferingKey] = useState("");
  const [roomId, setRoomId] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("18:00");
  const [startDate, setStartDate] = useState("");
  const [expected, setExpected] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Only ACTIVE teachers: the kernel refuses anything else, and a shell account
  // belongs in the invite dialog next door.
  const teachersReq = useAdminGet<TeacherRow[]>("admin/teachers", {
    enabled: open,
    query: { status: "active", limit: "50", ...(teacherQuery.trim() ? { q: teacherQuery.trim() } : {}) },
  });
  const teachers = teachersReq.data ?? [];

  const subjectsReq = useAdminGet<SubjectRow[]>("admin/catalog/subjects", { enabled: open });
  const subjects = subjectsReq.data ?? [];

  const offeringsReq = useAdminGet<OfferingRow[]>("admin/catalog/offerings", {
    enabled: open && !!subjectId,
    query: { subjectId },
  });
  const offerings = (offeringsReq.data ?? []).filter((o) => o.isActive && o.gradeLevel);

  const roomsReq = useAdminGet<{ rooms: RoomRow[] }>(`admin/centers/${centerId}/rooms`, {
    enabled: open,
  });
  const rooms = roomsReq.data?.rooms ?? [];

  // Changing the subject invalidates the grade/track pair chosen under the old one.
  useEffect(() => {
    setOfferingKey("");
  }, [subjectId]);

  const picked = offerings.find((o) => o.id === offeringKey) ?? null;

  const dayNames = [
    t("collabSun"),
    t("collabMon"),
    t("collabTue"),
    t("collabWed"),
    t("collabThu"),
    t("collabFri"),
    t("collabSat"),
  ];

  const reset = () => {
    setTeacherQuery("");
    setTeacherId("");
    setSubjectId("");
    setOfferingKey("");
    setRoomId("");
    setDays([]);
    setStartTime("16:00");
    setEndTime("18:00");
    setStartDate("");
    setExpected("");
    setMessage("");
  };

  const submit = async () => {
    if (!teacherId || !picked || days.length === 0 || !startDate) {
      toast.error(t("collabMissingFields"));
      return;
    }
    if (endTime <= startTime) {
      toast.error(t("collabBadTimes"));
      return;
    }
    setSubmitting(true);
    try {
      await mutateAsync({
        url: `admin/centers/${centerId}/collaboration-requests`,
        method: "post",
        values: {
          teacherId,
          subjectId,
          gradeLevelId: picked.gradeLevelId,
          ...(picked.trackId ? { trackId: picked.trackId } : {}),
          ...(roomId ? { roomId } : {}),
          daysOfWeek: days,
          startTime,
          endTime,
          startDate,
          ...(expected.trim() !== "" ? { expectedStudents: Number(expected) } : {}),
          ...(message.trim() ? { message: message.trim() } : {}),
        },
      });
      toast.success(t("collabSentToast"));
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("collabFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const label = (ar: string, en?: string | null) => (locale === "ar" ? ar : (en ?? ar));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("collabCreateTitle")}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-ink-2">{t("collabCreateNote")}</p>

        <div className="space-y-4">
          <div>
            <div className="mb-1 text-sm font-medium">{t("collabTeacher")}</div>
            <Input
              value={teacherQuery}
              onChange={(e) => setTeacherQuery(e.target.value)}
              placeholder={t("collabTeacherSearch")}
            />
            <div className="mt-2">
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger>
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
          </div>

          <div>
            <div className="mb-1 text-sm font-medium">{t("collabSubject")}</div>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger>
                <SelectValue placeholder={t("collabPickSubject")} />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {label(s.nameAr, s.nameEn)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="mb-1 text-sm font-medium">{t("collabYearTrack")}</div>
            <Select value={offeringKey} onValueChange={setOfferingKey} disabled={!subjectId}>
              <SelectTrigger>
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
          </div>

          <div>
            <div className="mb-1 text-sm font-medium">{t("collabHall")}</div>
            <Select value={roomId || "none"} onValueChange={(v) => setRoomId(v === "none" ? "" : v)}>
              <SelectTrigger>
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
            <p className="mt-1 text-xs text-ink-2">{t("collabHallNote")}</p>
          </div>

          <div>
            <div className="mb-1 text-sm font-medium">{t("collabDays")}</div>
            <div className="flex flex-wrap gap-1">
              {dayNames.map((name, i) => (
                <Button
                  key={i}
                  type="button"
                  size="sm"
                  variant={days.includes(i) ? "default" : "outline"}
                  onClick={() =>
                    setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort()))
                  }
                >
                  {name}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-sm font-medium">{t("collabFrom")}</div>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">{t("collabTo")}</div>
              <Select value={endTime} onValueChange={setEndTime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-sm font-medium">{t("collabStartDate")}</div>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">{t("collabExpected")}</div>
              <Input
                type="number"
                min={1}
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                placeholder={t("collabOptional")}
              />
            </div>
          </div>

          <div>
            <div className="mb-1 text-sm font-medium">{t("collabMessage")}</div>
            <Textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("collabOptional")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Spinner className="size-4" /> : null}
            {t("collabSend")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Button + dialog in one, for the tabs that offer this action. */
export function CollabRequestButton({
  centerId,
  onDone,
}: {
  centerId: string;
  /** Named to match `ControlAction` on the sibling tabs. */
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
