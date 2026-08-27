"use client";

import { useMemo, useState } from "react";
import { useCreate } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { Plus, Clock } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
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
import { toast } from "@repo/ui/components/sonner";
import { Spinner } from "@/components/kit/spinner";

export function TeacherCreateGroupDialog({ onCreated }: { onCreated?: () => void }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [gradeTag, setGradeTag] = useState("");
  const [location, setLocation] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("18:00");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [maxStudents, setMaxStudents] = useState("30");
  const [priceMonth, setPriceMonth] = useState("");
  const [priceSession, setPriceSession] = useState("");

  const { mutate: create, mutation } = useCreate();

  const dayNames = [
    t("studentBrowse.sun"),
    t("studentBrowse.mon"),
    t("studentBrowse.tue"),
    t("studentBrowse.wed"),
    t("studentBrowse.thu"),
    t("studentBrowse.fri"),
    t("studentBrowse.sat"),
  ];

  const timeOptions = useMemo(() => {
    const out: string[] = [];
    for (let h = 6; h <= 22; h++) {
      for (const m of [0, 30]) {
        if (h === 22 && m === 30) break;
        out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return out;
  }, []);

  const monthPiasters = Math.round((parseFloat(priceMonth) || 0) * 100);
  const sessionPiasters = Math.round((parseFloat(priceSession) || 0) * 100);
  const hasPlan = monthPiasters > 0 || sessionPiasters > 0;
  const complete =
    title.trim() &&
    subject.trim() &&
    days.length > 0 &&
    startTime < endTime &&
    startDate &&
    endDate &&
    endDate >= startDate &&
    parseInt(maxStudents, 10) > 0 &&
    hasPlan;

  const reset = () => {
    setTitle("");
    setSubject("");
    setGradeTag("");
    setLocation("");
    setDays([]);
    setStartTime("16:00");
    setEndTime("18:00");
    setStartDate("");
    setEndDate("");
    setMaxStudents("30");
    setPriceMonth("");
    setPriceSession("");
  };

  const submit = () => {
    if (!complete) {
      toast.error(t("teacher.fillRequired"));
      return;
    }
    create(
      {
        resource: "courses",
        values: {
          title: title.trim(),
          subject: subject.trim(),
          ...(gradeTag.trim() ? { gradeTag: gradeTag.trim() } : {}),
          ...(location.trim() ? { location: location.trim() } : {}),
          schedulePattern: {
            daysOfWeek: days,
            startTime,
            endTime,
            startDate,
            endDate,
          },
          maxStudents: parseInt(maxStudents, 10),
          pricePerMonth: monthPiasters > 0 ? monthPiasters : null,
          pricePerSession: sessionPiasters > 0 ? sessionPiasters : null,
        },
      },
      {
        onSuccess: (res: any) => {
          const count = res?.data?.sessionsGenerated;
          toast.success(
            count
              ? t("teacher.groupCreatedSessions", { count })
              : t("teacher.groupCreated"),
          );
          setOpen(false);
          reset();
          onCreated?.();
        },
        onError: (err: any) => {
          toast.error(err?.message || t("teacher.createFailed"));
        },
      },
    );
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {t("teacher.createGroup")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("teacher.createGroup")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-sm font-medium">{t("teacher.groupName")}</div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("teacher.groupNamePlaceholder")}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-sm font-medium">{t("teacher.subject")}</div>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 text-sm font-medium">{t("teacher.gradeOptional")}</div>
                <Input value={gradeTag} onChange={(e) => setGradeTag(e.target.value)} />
              </div>
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">{t("teacher.locationOptional")}</div>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t("teacher.locationPlaceholder")}
              />
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">{t("shared.collab.days")}</div>
              <div className="flex flex-wrap gap-1">
                {dayNames.map((d, i) => (
                  <Button
                    key={i}
                    type="button"
                    size="sm"
                    variant={days.includes(i) ? "default" : "outline"}
                    onClick={() =>
                      setDays((cur) =>
                        cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort(),
                      )
                    }
                  >
                    {d}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-sm font-medium">{t("shared.collab.from")}</div>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger className="w-full">
                    <Clock className="size-4 shrink-0 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {timeOptions.map((tm) => (
                      <SelectItem key={tm} value={tm}>
                        <span dir="ltr">{tm}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="mb-1 text-sm font-medium">{t("shared.collab.to")}</div>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger className="w-full">
                    <Clock className="size-4 shrink-0 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {timeOptions.map((tm) => (
                      <SelectItem key={tm} value={tm}>
                        <span dir="ltr">{tm}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-sm font-medium">{t("shared.collab.startDate")}</div>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <div className="mb-1 text-sm font-medium">{t("teacher.endDate")}</div>
                <Input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <div className="mb-1 text-sm font-medium">{t("teacher.maxStudents")}</div>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={maxStudents}
                  onChange={(e) => setMaxStudents(e.target.value)}
                />
              </div>
              <div>
                <div className="mb-1 text-sm font-medium">{t("teacher.priceMonth")}</div>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={priceMonth}
                  onChange={(e) => setPriceMonth(e.target.value)}
                />
              </div>
              <div>
                <div className="mb-1 text-sm font-medium">{t("teacher.priceSession")}</div>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={priceSession}
                  onChange={(e) => setPriceSession(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("teacher.planNote")}</p>
            <Button className="w-full" disabled={mutation.isPending} onClick={submit}>
              {mutation.isPending ? <Spinner /> : <Plus className="size-4" />}
              {t("teacher.createGroup")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
