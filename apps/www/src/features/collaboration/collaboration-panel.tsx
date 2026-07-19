"use client";

import { useMemo, useState } from "react";
import { useCustom, useCustomMutation, useList } from "@refinedev/core";
import { Handshake, Plus, Check, X as XIcon, Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
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

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  accepted: "success",
  rejected: "danger",
  cancelled: "danger",
  pending: "warning",
  expired: "neutral",
};

type CollabRow = {
  id: string;
  initiator: "teacher" | "center";
  teacherId: string;
  centerId: string;
  teacherName: string | null;
  centerName: string | null;
  subjectName: { nameAr: string; nameEn: string | null } | null;
  gradeName: { nameAr: string; nameEn: string | null } | null;
  roomName: string | null;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  startDate: string;
  expectedStudents: number | null;
  proposedCenterShare: number;
  message: string | null;
  status: string;
  responseNote: string | null;
  createdAt: string;
};

type GradeOption = { id: string; nameEn: string; trackOptions: { id: string; nameEn: string }[] };

// useCustom result shapes differ between envelope/raw payloads — extract
// arrays tolerantly (same trick as the useOne envelope tolerance).
function asArray(res: unknown): any[] {
  const d = (res as any)?.data ?? res;
  if (Array.isArray(d)) return d;
  if (Array.isArray((d as any)?.data)) return (d as any).data;
  return [];
}

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

  const rows = asArray(result) as CollabRow[];

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

  const decide = async (r: CollabRow, action: "accept" | "reject" | "cancel") => {
    setBusyId(r.id);
    try {
      await act({ url: `collaboration-requests/${r.id}/${action}`, method: "post", values: {} });
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
                    {formatEGP(r.proposedCenterShare)}
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
    </Card>
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
  const { locale } = useFormatters();
  const { mutateAsync: create } = useCustomMutation();

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
  const [shareEgp, setShareEgp] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Target directory: teachers search centers, centers search teachers.
  const { result: targetsRes } = useCustom({
    url: role === "teacher" ? "search/centers" : "search/teachers",
    method: "get",
    config: { query: targetQuery ? { q: targetQuery } : {} },
    queryOptions: { enabled: open },
  });
  const targets = asArray(targetsRes);

  const { result: subjectsRes } = useCustom({
    url: "catalog/subjects",
    method: "get",
    config: { query: { all: "1" } },
    queryOptions: { enabled: open },
  });
  const subjects = asArray(subjectsRes);

  const { result: treeRes } = useCustom({
    url: "catalog/tree",
    method: "get",
    queryOptions: { enabled: open },
  });
  const grades: GradeOption[] = useMemo(() => {
    const out: GradeOption[] = [];
    for (const sys of asArray(treeRes)) {
      for (const stage of sys.stages ?? []) {
        for (const g of stage.gradeLevels ?? []) {
          out.push({ id: g.id, nameEn: g.nameEn ?? g.nameAr, trackOptions: g.trackOptions ?? [] });
        }
      }
    }
    return out;
  }, [treeRes]);
  const trackOptions = grades.find((g) => g.id === gradeId)?.trackOptions ?? [];

  // Halls: only the center side can pick one of ITS rooms.
  const { result: roomsRes } = useList({
    resource: "rooms",
    pagination: { mode: "off" },
    queryOptions: { enabled: open && role === "center" },
  });
  const rooms = (roomsRes?.data ?? []) as any[];

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
    setShareEgp("");
    setMessage("");
  };

  const submit = async () => {
    if (!targetId || !subjectId || !gradeId || days.length === 0 || !startDate) {
      toast.error(t("shared.collab.missingFields"));
      return;
    }
    const share = shareEgp.trim() === "" ? 0 : Math.round(Number(shareEgp) * 100);
    if (!Number.isFinite(share) || share < 0) {
      toast.error(t("shared.collab.invalidShare"));
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
        proposedCenterShare: share,
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
            <Input
              placeholder={t("actions.search")}
              value={targetQuery}
              onChange={(e) => setTargetQuery(e.target.value)}
              className="mb-2"
            />
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
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-sm font-medium">{t("shared.collab.subject")}</div>
              <Combobox
                options={subjects.map((s: any) => ({
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
              <Combobox
                options={grades.map((g) => ({ value: g.id, label: g.nameEn }))}
                value={gradeId}
                onChange={(v) => {
                  setGradeId(v ?? "");
                  setTrackId("");
                }}
                placeholder={t("shared.collab.grade")}
                searchPlaceholder={t("actions.search")}
                emptyText={t("common.noData")}
              />
            </div>
          </div>

          {trackOptions.length > 0 ? (
            <div>
              <div className="mb-1 text-sm font-medium">{t("shared.collab.track")}</div>
              <Combobox
                options={[
                  { value: "", label: t("shared.collab.allTracks") },
                  ...trackOptions.map((tr) => ({ value: tr.id, label: tr.nameEn })),
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

          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="mb-1 text-sm font-medium">{t("shared.collab.from")}</div>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">{t("shared.collab.to")}</div>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">{t("shared.collab.startDate")}</div>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
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
            <div>
              <div className="mb-1 text-sm font-medium">{t("shared.collab.shareEgp")}</div>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={shareEgp}
                onChange={(e) => setShareEgp(e.target.value)}
              />
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
