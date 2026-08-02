"use client";

import { useEffect, useMemo, useState } from "react";
import { useCustom, useCustomMutation, useList } from "@refinedev/core";
import dayjs from "dayjs";
import {
  Handshake,
  Plus,
  Check,
  X as XIcon,
  Ban,
  Users,
  ImageOff,
  Clock,
  Calendar as CalendarIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Badge } from "@repo/ui/components/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Calendar } from "@/components/kit/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { toast } from "@repo/ui/components/sonner";
import { Combobox } from "@/components/kit/combobox";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { StatusBadge } from "@/components/kit/status-badge";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { amenityLabel } from "@/lib/rooms/amenities";
import { asArray } from "@/lib/refine/as-array";

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  accepted: "success",
  rejected: "danger",
  cancelled: "danger",
  pending: "warning",
  expired: "neutral",
};

type PricingMethod = "whole_room_percent" | "per_attending_student";

type CollabRow = {
  id: string;
  initiator: "teacher" | "center";
  teacherId: string;
  centerId: string;
  teacherName: string | null;
  centerName: string | null;
  subjectName: { nameAr: string; nameEn: string | null } | null;
  gradeName: { nameAr: string; nameEn: string | null } | null;
  roomId: string | null;
  roomName: string | null;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  startDate: string;
  expectedStudents: number | null;
  proposedCenterShare: number;
  proposedPricingMethod: PricingMethod | null;
  message: string | null;
  status: string;
  responseNote: string | null;
  createdAt: string;
};

type GradeOption = {
  id: string;
  nameAr: string;
  nameEn: string;
  trackOptions: { id: string; nameAr: string; nameEn: string }[];
};
type StageGroup = { key: string; nameAr: string; nameEn: string; grades: GradeOption[] };

/**
 * Shared collaboration-requests panel (Step 5) — replaces ClassroomBooking and
 * the existing-teacher affiliation invite. role decides direction:
 *   teacher → "apply to teach at a center"; center → "invite a teacher".
 */
export function CollaborationPanel({ role }: { role: "teacher" | "center" }) {
  const t = useTranslations();
  const { formatEGP, formatDate, locale } = useFormatters();
  const { query, result } = useCustom({ url: "collaboration-requests", method: "get" });
  const { mutateAsync: act } = useCustomMutation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const rows = asArray<CollabRow>(result?.data);

  const dayNames = [
    t("studentBrowse.sun"),
    t("studentBrowse.mon"),
    t("studentBrowse.tue"),
    t("studentBrowse.wed"),
    t("studentBrowse.thu"),
    t("studentBrowse.fri"),
    t("studentBrowse.sat"),
  ];

  const name = (n: { nameAr: string; nameEn: string | null } | null) =>
    n ? (locale === "ar" ? n.nameAr : (n.nameEn ?? n.nameAr)) : "—";

  // Incoming = the OTHER side initiated and it awaits MY decision.
  const isIncoming = (r: CollabRow) =>
    role === "teacher" ? r.initiator === "center" : r.initiator === "teacher";

  const methodLabel = (m: PricingMethod | null) =>
    m === "per_attending_student"
      ? t("shared.collab.methodPerStudent")
      : m === "whole_room_percent"
        ? t("shared.collab.methodPercent")
        : t("shared.collab.methodPendingChoice");

  // Accepting a center invite on a both-methods hall requires the teacher's
  // method choice — routed through a dedicated dialog instead of the plain
  // confirm.
  const needsMethodChoice = (r: CollabRow) =>
    role === "teacher" &&
    r.initiator === "center" &&
    !!r.roomId &&
    r.proposedPricingMethod == null;
  const [methodChoiceFor, setMethodChoiceFor] = useState<CollabRow | null>(null);

  const decide = async (
    r: CollabRow,
    action: "accept" | "reject" | "cancel",
    pricingMethod?: PricingMethod,
  ) => {
    setBusyId(r.id);
    try {
      await act({
        url: `collaboration-requests/${r.id}/${action}`,
        method: "post",
        values: pricingMethod ? { pricingMethod } : {},
      });
      toast.success(
        action === "accept"
          ? t("shared.collab.acceptedToast")
          : action === "reject"
            ? t("shared.collab.rejectedToast")
            : t("shared.collab.cancelledToast"),
      );
      query.refetch();
    } catch (err: any) {
      toast.error(err?.message || t("shared.collab.actionFailed"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Handshake className="size-4" />
          {t("shared.collab.title")}
        </CardTitle>
        <CardAction>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {role === "teacher" ? t("shared.collab.applyCta") : t("shared.collab.inviteCta")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <PageSpinner label={t("shared.collab.loading")} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Handshake} title={t("shared.collab.empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("shared.collab.counterpart")}</TableHead>
                <TableHead>{t("shared.collab.classCol")}</TableHead>
                <TableHead>{t("shared.collab.scheduleCol")}</TableHead>
                <TableHead>{t("shared.collab.shareCol")}</TableHead>
                <TableHead>{t("shared.collab.statusCol")}</TableHead>
                <TableHead>{t("shared.collab.actionsCol")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">
                      {role === "teacher" ? (r.centerName ?? "—") : (r.teacherName ?? "—")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {isIncoming(r)
                        ? t("shared.collab.incoming")
                        : t("shared.collab.outgoing")}
                    </div>
                  </TableCell>
                  <TableCell>
                    {name(r.subjectName)} · {name(r.gradeName)}
                    {r.roomName ? (
                      <div className="text-xs text-muted-foreground">{r.roomName}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    {dayNames.filter((_, i) => r.daysOfWeek.includes(i)).join(", ")}
                    <div dir="ltr" className="text-muted-foreground">
                      {r.startTime}–{r.endTime} · {formatDate(r.startDate)}
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold">
                    {r.roomId ? (
                      <Badge
                        variant={
                          r.proposedPricingMethod === "per_attending_student"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {methodLabel(r.proposedPricingMethod)}
                      </Badge>
                    ) : (
                      // No-room arrangement: the flat share is platform config,
                      // never a number either side proposed.
                      <Badge variant="outline">{t("shared.collab.byPlatform")}</Badge>
                    )}
                    {r.expectedStudents ? (
                      <div className="text-xs font-normal text-muted-foreground">
                        ~<span dir="ltr">{r.expectedStudents}</span> {t("shared.collab.students")}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</StatusBadge>
                    {r.responseNote ? (
                      <div className="text-xs text-destructive">{r.responseNote}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {r.status === "pending" && isIncoming(r) ? (
                      <div className="flex gap-2">
                        {needsMethodChoice(r) ? (
                          <Button
                            size="sm"
                            disabled={busyId === r.id}
                            onClick={() => setMethodChoiceFor(r)}
                          >
                            {busyId === r.id ? <Spinner /> : <Check className="size-4" />}
                            {t("shared.collab.accept")}
                          </Button>
                        ) : (
                          <ConfirmDialog
                            trigger={
                              <Button size="sm" disabled={busyId === r.id}>
                                {busyId === r.id ? <Spinner /> : <Check className="size-4" />}
                                {t("shared.collab.accept")}
                              </Button>
                            }
                            title={t("shared.collab.acceptTitle")}
                            description={t("shared.collab.acceptDesc")}
                            confirmText={t("shared.collab.accept")}
                            onConfirm={() => decide(r, "accept")}
                          />
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === r.id}
                          onClick={() => decide(r, "reject")}
                        >
                          <XIcon className="size-4" />
                          {t("shared.collab.reject")}
                        </Button>
                      </div>
                    ) : r.status === "pending" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === r.id}
                        onClick={() => decide(r, "cancel")}
                      >
                        <Ban className="size-4" />
                        {t("shared.collab.cancel")}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <CreateCollabDialog
        role={role}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          query.refetch();
        }}
      />

      {methodChoiceFor ? (
        <AcceptMethodDialog
          row={methodChoiceFor}
          onOpenChange={(o) => !o && setMethodChoiceFor(null)}
          onConfirm={async (m) => {
            const r = methodChoiceFor;
            setMethodChoiceFor(null);
            await decide(r, "accept", m);
          }}
        />
      ) : null}
    </Card>
  );
}

// The teacher's pricing-method choice when accepting a center invite on a hall
// that offers both methods. Labels only — the numbers are platform-set.
function AcceptMethodDialog({
  row,
  onOpenChange,
  onConfirm,
}: {
  row: CollabRow;
  onOpenChange: (o: boolean) => void;
  onConfirm: (m: PricingMethod) => Promise<void>;
}) {
  const t = useTranslations();
  const [method, setMethod] = useState<PricingMethod>("whole_room_percent");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("shared.collab.chooseMethodTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("shared.collab.chooseMethodDesc", { hall: row.roomName ?? "" })}
        </p>
        <MethodRadio value={method} onChange={setMethod} />
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(method);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Spinner /> : null}
            {t("shared.collab.accept")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Shared two-option method picker (radio-style buttons, labels only).
function MethodRadio({
  value,
  onChange,
  allowed,
}: {
  value: PricingMethod;
  onChange: (m: PricingMethod) => void;
  allowed?: PricingMethod[];
}) {
  const t = useTranslations();
  const options: { value: PricingMethod; label: string; hint: string }[] = [
    {
      value: "whole_room_percent",
      label: t("shared.collab.methodPercent"),
      hint: t("shared.collab.methodPercentHint"),
    },
    {
      value: "per_attending_student",
      label: t("shared.collab.methodPerStudent"),
      hint: t("shared.collab.methodPerStudentHint"),
    },
  ];
  const visible = allowed ? options.filter((o) => allowed.includes(o.value)) : options;
  return (
    <div className="space-y-2">
      {visible.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`w-full rounded-md border p-2 text-start transition ${
            value === o.value ? "border-primary ring-2 ring-primary/40" : "hover:border-primary/50"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            {value === o.value ? <Check className="size-4 text-primary" /> : null}
            {o.label}
          </div>
          <p className="text-xs text-muted-foreground">{o.hint}</p>
        </button>
      ))}
    </div>
  );
}

function CreateCollabDialog({
  role,
  open,
  onOpenChange,
  onCreated,
}: {
  role: "teacher" | "center";
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations();
  const { locale, formatEGP, formatDate } = useFormatters();
  const { mutateAsync: create } = useCustomMutation();

  // Class-time picker options — 30-minute slots (06:00–22:00). The submitted
  // value is unchanged ("HH:mm" strings); this only replaces the raw <input
  // type=time> with a clear shadcn Select.
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

  const [targetQuery, setTargetQuery] = useState("");
  const [targetId, setTargetId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [trackId, setTrackId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("18:00");
  const [startDate, setStartDate] = useState("");
  const [expected, setExpected] = useState("");
  const [method, setMethod] = useState<PricingMethod>("whole_room_percent");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // The picker types straight into the combobox, so debounce before hitting the
  // API rather than firing a request per keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(targetQuery.trim()), 300);
    return () => clearTimeout(id);
  }, [targetQuery]);

  // Target directory: teachers search centers, centers search teachers.
  // `includeEmpty` is what makes a center with no courses yet appear here — the
  // student-facing default hides those, and a new center is exactly the one a
  // teacher wants to apply to.
  const { result: targetsRes } = useCustom({
    url: role === "teacher" ? "search/centers" : "search/teachers",
    method: "get",
    config: {
      query: {
        ...(debouncedQuery ? { q: debouncedQuery } : {}),
        ...(role === "teacher" ? { includeEmpty: "1" } : {}),
      },
    },
    queryOptions: { enabled: open },
  });
  const targets = asArray<any>(targetsRes?.data);

  const { result: subjectsRes } = useCustom({
    url: "catalog/subjects",
    method: "get",
    config: { query: { all: "1" } },
    queryOptions: { enabled: open },
  });
  const subjects = asArray<any>(subjectsRes?.data);

  const { result: treeRes } = useCustom({
    url: "catalog/tree",
    method: "get",
    queryOptions: { enabled: open },
  });
  // Academic years grouped by stage, with localized names — powers a clear,
  // grouped year picker. `grades` stays a flat list for the track lookup.
  const stageGroups: StageGroup[] = useMemo(() => {
    const out: StageGroup[] = [];
    for (const sys of asArray<any>(treeRes?.data)) {
      for (const stage of sys.stages ?? []) {
        const gs: GradeOption[] = (stage.gradeLevels ?? []).map((g: any) => ({
          id: g.id,
          nameAr: g.nameAr,
          nameEn: g.nameEn ?? g.nameAr,
          trackOptions: g.trackOptions ?? [],
        }));
        if (gs.length) {
          out.push({
            key: stage.id ?? stage.nameEn ?? stage.nameAr,
            nameAr: stage.nameAr,
            nameEn: stage.nameEn ?? stage.nameAr,
            grades: gs,
          });
        }
      }
    }
    return out;
  }, [treeRes]);
  const grades: GradeOption[] = useMemo(
    () => stageGroups.flatMap((s) => s.grades),
    [stageGroups],
  );
  const trackOptions = grades.find((g) => g.id === gradeId)?.trackOptions ?? [];
  const gradeLabel = (g: GradeOption) => (locale === "ar" ? g.nameAr : g.nameEn);

  // Halls: only the center side can pick one of ITS rooms (name-only picker).
  const { result: roomsRes } = useList({
    resource: "rooms",
    pagination: { mode: "off" },
    queryOptions: { enabled: open && role === "center" },
  });
  const rooms = (roomsRes?.data ?? []) as any[];

  // Teacher side: browse the TARGET center's rooms (photos, capacity, features,
  // price, busy times) to pick a hall. Fetched per selected center.
  const { result: centerRoomsRes } = useCustom({
    url: targetId ? `centers/${targetId}/rooms` : "centers/none/rooms",
    method: "get",
    queryOptions: { enabled: open && role === "teacher" && !!targetId },
  });
  const centerRooms = ((centerRoomsRes as any)?.data?.rooms ?? []) as any[];

  // Subject auto-fill: a teacher's picker is scoped to their specialization
  // (TeacherSubject). Falls back to the full catalog if none are recorded.
  const { result: mySubjectsRes } = useCustom({
    url: "me/subjects",
    method: "get",
    queryOptions: { enabled: open && role === "teacher" },
  });
  const mySubjects = asArray<any>(mySubjectsRes?.data);
  const subjectOptions = role === "teacher" && mySubjects.length > 0 ? mySubjects : subjects;

  // Auto-select the sole specialization subject for a teacher.
  useEffect(() => {
    if (role === "teacher" && !subjectId && mySubjects.length === 1) {
      setSubjectId(mySubjects[0].id);
    }
  }, [role, subjectId, mySubjects]);

  // Changing the target center invalidates a previously-picked hall.
  useEffect(() => {
    setRoomId("");
  }, [targetId]);

  // The picked hall's center-set method availability (teacher side reads the
  // target center's rooms; center side its own).
  const pickedRoom =
    role === "teacher"
      ? centerRooms.find((r) => r.id === roomId)
      : rooms.find((r) => r.id === roomId);
  const allowedMethods: PricingMethod[] = roomId
    ? ((pickedRoom?.allowedPricingMethods ?? ["whole_room_percent"]) as PricingMethod[])
    : [];
  const forcedMethod = allowedMethods.length === 1 ? allowedMethods[0] : null;
  // What this request will actually propose (teacher chooses on both-methods
  // halls; the center never pre-picks — the teacher decides at accept time).
  const effectiveMethod: PricingMethod | null = roomId
    ? (forcedMethod ?? (role === "teacher" ? method : null))
    : null;

  // Re-seed the choice whenever the hall changes.
  useEffect(() => {
    setMethod(forcedMethod ?? "whole_room_percent");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const dayNames = [
    t("studentBrowse.sun"),
    t("studentBrowse.mon"),
    t("studentBrowse.tue"),
    t("studentBrowse.wed"),
    t("studentBrowse.thu"),
    t("studentBrowse.fri"),
    t("studentBrowse.sat"),
  ];

  const reset = () => {
    setTargetQuery("");
    setTargetId("");
    setSubjectId("");
    setGradeId("");
    setTrackId("");
    setRoomId("");
    setDays([]);
    setStartTime("16:00");
    setEndTime("18:00");
    setStartDate("");
    setExpected("");
    setMethod("whole_room_percent");
    setMessage("");
  };

  const submit = async () => {
    if (!targetId || !subjectId || !gradeId || days.length === 0 || !startDate) {
      toast.error(t("shared.collab.missingFields"));
      return;
    }
    setSubmitting(true);
    try {
      // The API derives self/target from the session role.
      const values: Record<string, unknown> = {
        ...(role === "teacher" ? { centerId: targetId } : { teacherId: targetId }),
        subjectId,
        gradeLevelId: gradeId,
        ...(trackId ? { trackId } : {}),
        ...(roomId ? { roomId } : {}),
        daysOfWeek: days,
        startTime,
        endTime,
        startDate,
        ...(expected.trim() !== "" ? { expectedStudents: Number(expected) } : {}),
        // NO money field is sent by either side — the server owns every rate.
        // Teacher's method choice for the hall (or its forced method). Center-
        // initiated requests never send one — the teacher picks at accept.
        ...(roomId && role === "teacher" && effectiveMethod
          ? { proposedPricingMethod: effectiveMethod }
          : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
      };
      await create({ url: "collaboration-requests", method: "post", values });
      toast.success(t("shared.collab.sentToast"));
      reset();
      onCreated();
    } catch (err: any) {
      toast.error(err?.message || t("shared.collab.actionFailed"));
    } finally {
      setSubmitting(false);
    }
  };

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
          <DialogTitle>
            {role === "teacher" ? t("shared.collab.applyCta") : t("shared.collab.inviteCta")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-sm font-medium">
              {role === "teacher" ? t("shared.collab.pickCenter") : t("shared.collab.pickTeacher")}
            </div>
            {/* One search box, not two: the combobox's own input IS the server
                query, so typing there can never filter an empty local list. */}
            <Combobox
              options={targets.map((x: any) => ({
                value: String(x.id ?? x.userId),
                label: x.name ?? "—",
              }))}
              value={targetId}
              onChange={(v) => setTargetId(v ?? "")}
              placeholder={
                role === "teacher" ? t("shared.collab.pickCenter") : t("shared.collab.pickTeacher")
              }
              searchPlaceholder={t("actions.search")}
              emptyText={t("common.noData")}
              search={targetQuery}
              onSearchChange={setTargetQuery}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-sm font-medium">{t("shared.collab.subject")}</div>
              <Combobox
                options={subjectOptions.map((s: any) => ({
                  value: s.id,
                  label: locale === "ar" ? s.nameAr : (s.nameEn ?? s.nameAr),
                }))}
                value={subjectId}
                onChange={(v) => setSubjectId(v ?? "")}
                placeholder={t("shared.collab.subject")}
                searchPlaceholder={t("actions.search")}
                emptyText={t("common.noData")}
              />
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">{t("shared.collab.grade")}</div>
              <Select
                value={gradeId}
                onValueChange={(v) => {
                  setGradeId(v);
                  setTrackId("");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("shared.collab.grade")} />
                </SelectTrigger>
                <SelectContent>
                  {stageGroups.map((st) => (
                    <SelectGroup key={st.key}>
                      <SelectLabel>{locale === "ar" ? st.nameAr : st.nameEn}</SelectLabel>
                      {st.grades.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {gradeLabel(g)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {trackOptions.length > 0 ? (
            <div>
              <div className="mb-1 text-sm font-medium">{t("shared.collab.track")}</div>
              <Combobox
                options={[
                  { value: "", label: t("shared.collab.allTracks") },
                  ...trackOptions.map((tr) => ({
                    value: tr.id,
                    label: locale === "ar" ? tr.nameAr : (tr.nameEn ?? tr.nameAr),
                  })),
                ]}
                value={trackId}
                onChange={(v) => setTrackId(v ?? "")}
                placeholder={t("shared.collab.allTracks")}
                searchPlaceholder={t("actions.search")}
                emptyText={t("common.noData")}
              />
            </div>
          ) : null}

          {role === "center" && rooms.length > 0 ? (
            <div>
              <div className="mb-1 text-sm font-medium">{t("shared.collab.hall")}</div>
              <Combobox
                options={[
                  { value: "", label: t("shared.collab.noHall") },
                  ...rooms.map((r: any) => ({ value: r.id, label: r.name })),
                ]}
                value={roomId}
                onChange={(v) => setRoomId(v ?? "")}
                placeholder={t("shared.collab.noHall")}
                searchPlaceholder={t("actions.search")}
                emptyText={t("common.noData")}
              />
              {roomId ? (
                <p className="mt-1 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                  {forcedMethod
                    ? t("shared.collab.forcedMethod", {
                        method:
                          forcedMethod === "per_attending_student"
                            ? t("shared.collab.methodPerStudent")
                            : t("shared.collab.methodPercent"),
                      })
                    : t("shared.collab.teacherPicksAtAccept")}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Teacher-facing hall browser: photos, capacity, features, price. */}
          {role === "teacher" && targetId ? (
            <div>
              <div className="mb-1 text-sm font-medium">{t("shared.collab.chooseHall")}</div>
              {centerRooms.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("shared.collab.noHallsAtCenter")}</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {centerRooms.map((r) => {
                    const selected = roomId === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setRoomId(selected ? "" : r.id)}
                        className={`overflow-hidden rounded-lg border text-start transition ${
                          selected ? "border-primary ring-2 ring-primary/40" : "hover:border-primary/50"
                        }`}
                      >
                        <div className="relative aspect-video w-full bg-muted">
                          {r.photos?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.photos[0]} alt={r.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                              <ImageOff className="size-6" />
                            </div>
                          )}
                          {selected ? (
                            <span className="absolute end-1 top-1 rounded-full bg-primary p-1 text-primary-foreground">
                              <Check className="size-3" />
                            </span>
                          ) : null}
                        </div>
                        <div className="space-y-1 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{r.name}</span>
                            {/* Per-student pricing hides the hall price: the cost
                                depends on attendance (server already nulls it for
                                per-student-only halls). */}
                            {r.price != null &&
                            !(selected && effectiveMethod === "per_attending_student") ? (
                              <span className="text-sm font-semibold text-primary">{formatEGP(r.price)}</span>
                            ) : null}
                          </div>
                          {/* What this hall takes per attending student. Shown
                              on the CARD, not only after picking, because it is
                              what the halls differ by — and because a
                              per-student-only hall has no other price to
                              compare. Left hidden until now, it was a cost the
                              teacher agreed to and first saw at settlement. */}
                          {r.perStudentRate ? (
                            <div className="text-xs font-medium text-[var(--teal)]">
                              {r.perStudentRate.bp != null
                                ? t("shared.collab.perStudentRatePercent", {
                                    value: r.perStudentRate.bp / 100,
                                  })
                                : t("shared.collab.perStudentRateFlat", {
                                    value: formatEGP(r.perStudentRate.fee),
                                  })}
                            </div>
                          ) : null}
                          {r.capacity != null ? (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="size-3" />
                              {t("shared.collab.seats", { count: r.capacity })}
                            </div>
                          ) : null}
                          {r.facilities?.length ? (
                            <div className="flex flex-wrap gap-1">
                              {r.facilities.slice(0, 4).map((f: string) => (
                                <Badge key={f} variant="secondary" className="text-[10px]">
                                  {amenityLabel(f, locale)}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                          {r.busyTimes?.length ? (
                            <p className="text-[10px] text-muted-foreground">
                              {t("shared.collab.busySlots", { count: r.busyTimes.length })}
                            </p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Pricing method for the picked hall: forced → read-only label;
                  both offered → the teacher's choice (labels only, no numbers). */}
              {roomId ? (
                <div className="mt-2">
                  <div className="mb-1 text-sm font-medium">
                    {t("shared.collab.methodLabel")}
                  </div>
                  {forcedMethod ? (
                    <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                      {t("shared.collab.forcedMethod", {
                        method:
                          forcedMethod === "per_attending_student"
                            ? t("shared.collab.methodPerStudent")
                            : t("shared.collab.methodPercent"),
                      })}
                    </p>
                  ) : (
                    <MethodRadio value={method} onChange={setMethod} allowed={allowedMethods} />
                  )}
                  {/* At the moment of choosing, spell out what the method
                      actually costs — the card line is for comparing halls,
                      this one is for agreeing to one. */}
                  {effectiveMethod === "per_attending_student" && pickedRoom?.perStudentRate ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {pickedRoom.perStudentRate.bp != null
                        ? t("shared.collab.perStudentRateNotePercent", {
                            value: pickedRoom.perStudentRate.bp / 100,
                          })
                        : t("shared.collab.perStudentRateNoteFlat", {
                            value: formatEGP(pickedRoom.perStudentRate.fee),
                          })}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            <div>
              <div className="mb-1 text-sm font-medium">{t("shared.collab.startDate")}</div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 font-normal"
                  >
                    <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                    {startDate ? (
                      formatDate(dayjs(startDate).toDate())
                    ) : (
                      <span className="text-muted-foreground">
                        {t("shared.collab.startDate")}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate ? dayjs(startDate).toDate() : undefined}
                    onSelect={(d) => setStartDate(d ? dayjs(d).format("YYYY-MM-DD") : "")}
                    defaultMonth={startDate ? dayjs(startDate).toDate() : undefined}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-sm font-medium">{t("shared.collab.expected")}</div>
              <Input
                type="number"
                min="1"
                placeholder={t("shared.collab.optional")}
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
              />
            </div>
            {/* No money input for EITHER side. Every rate — the hall split,
                the per-student rate, and the flat no-room center share — is
                platform (superadmin) config; the request only carries WHICH
                method a hall uses. */}
            <div>
              <div className="mb-1 text-sm font-medium">{t("shared.collab.revenueSplit")}</div>
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                {!roomId
                  ? t("shared.collab.shareByPlatform")
                  : effectiveMethod === "per_attending_student"
                    ? t("shared.collab.perStudentNote")
                    : t("shared.collab.splitByPlatform")}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-1 text-sm font-medium">{t("shared.collab.message")}</div>
            <Textarea
              rows={2}
              placeholder={t("shared.collab.optional")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Spinner /> : null}
            {t("shared.collab.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
