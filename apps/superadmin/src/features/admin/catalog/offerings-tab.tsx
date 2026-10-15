"use client";

import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { Spinner } from "@/components/kit/spinner";
import { StatusBadge } from "@/components/kit/status-badge";
import { TableSkeleton } from "@/components/ui/skeletons";
import { useCustom } from "@refinedev/core";
import { QUERY_FRESHNESS } from "@repo/client-core/refine/freshness";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { Plus, RefreshCcw, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { GradeRow, OfferingRow, SubjectRow } from "./types";
import { useAction } from "@/lib/api/use-action";

const ALL = "__all__";

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}


export function OfferingsTab() {
  const t = useTranslations();
  const queryStrings = useQueryStrings();
  const { run, busy, busyKey } = useAction();
  const [subjectFilter, setSubjectFilter] = useState<string>(ALL);
  const [gradeFilter, setGradeFilter] = useState<string>(ALL);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<{ subjectId?: string; gradeLevelId?: string; trackId?: string }>({});

  const subjectsQ = useCustom<SubjectRow[]>({
    url: "admin/catalog/subjects",
    method: "get",
    queryOptions: QUERY_FRESHNESS.reference,
  });
  const gradesQ = useCustom<GradeRow[]>({ url: "admin/catalog/grade-levels", method: "get" });
  const query: Record<string, string> = {};
  if (subjectFilter !== ALL) query.subjectId = subjectFilter;
  if (gradeFilter !== ALL) query.gradeLevelId = gradeFilter;
  const offeringsQ = useCustom<OfferingRow[]>({
    url: "admin/catalog/offerings",
    method: "get",
    config: { query },
  });

  const subjects = asArray<SubjectRow>(subjectsQ.result?.data);
  const grades = asArray<GradeRow>(gradesQ.result?.data);
  const offerings = asArray<OfferingRow>(offeringsQ.result?.data);

  const gradeLabel = (g: GradeRow) => `${g.stage.system.nameAr} · ${g.nameAr}`;

  const draftGrade = useMemo(
    () => grades.find((g) => g.id === draft.gradeLevelId),
    [grades, draft.gradeLevelId],
  );

  async function submitAdd() {
    if (!draft.subjectId || !draft.gradeLevelId) return;
    const res = await run({
      url: "admin/catalog/offerings",
      values: {
        subjectId: draft.subjectId,
        gradeLevelId: draft.gradeLevelId,
        trackId: draft.trackId && draft.trackId !== ALL ? draft.trackId : null,
      },
      successMsg: t("catalog.toasts.created"),
    });
    if (res.ok) {
      setAddOpen(false);
      setDraft({});
      void offeringsQ.query.refetch();
    }
  }

  async function toggleActive(row: OfferingRow) {
    const res = await run({
      url: `admin/catalog/offerings/${row.id}`,
      method: "patch",
      values: { isActive: !row.isActive },
      successMsg: t("catalog.toasts.updated"),
    });
    if (res.ok) void offeringsQ.query.refetch();
  }

  async function remove(row: OfferingRow) {
    const res = await run({
      url: `admin/catalog/offerings/${row.id}`,
      method: "delete",
      successMsg: t("catalog.toasts.deleted"),
    });
    // run() has already toasted the failure; REJECTING is what keeps the
    // confirm dialog open on the row that failed instead of closing over it.
    if (!res.ok) throw res.error;
    void offeringsQ.query.refetch();
  }

  const columns: ColumnDef<OfferingRow, unknown>[] = [
    {
      accessorKey: "subject.nameAr",
      header: t("catalog.offerings.subject"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.subject.nameAr}</span>
          {row.original.subject.isAzhari ? (
            <Badge variant="secondary">{t("catalog.subjects.azhari")}</Badge>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "gradeLevel.nameAr",
      header: t("catalog.offerings.gradeLevel"),
      cell: ({ row }) => (
        <span>
          {row.original.gradeLevel.stage.system.nameAr} · {row.original.gradeLevel.nameAr}
        </span>
      ),
    },
    {
      accessorKey: "track.nameAr",
      header: t("catalog.offerings.track"),
      cell: ({ row }) =>
        row.original.track ? (
          <Badge variant="outline">{row.original.track.nameAr}</Badge>
        ) : (
          <span className="text-ink-2">{t("catalog.offerings.allTracks")}</span>
        ),
    },
    {
      accessorKey: "isActive",
      header: t("catalog.fields.isActive"),
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => void toggleActive(row.original)}
          disabled={busyKey === row.original.id}
        >
          {row.original.isActive ? (
            <StatusBadge tone="success">{t("status.active")}</StatusBadge>
          ) : (
            <StatusBadge tone="warning">{t("status.suspended")}</StatusBadge>
          )}
        </button>
      ),
    },
    {
      id: "actions",
      header: t("common.colActions"),
      cell: ({ row }) => (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon" className="size-7 text-red">
              <Trash2 className="size-3.5" />
            </Button>
          }
          title={t("catalog.offerings.deleteTitle")}
          description={t("catalog.offerings.deleteBody")}
          confirmText={t("actions.delete")}
          cancelText={t("actions.cancel")}
          onConfirm={() => remove(row.original)}
        />
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="w-56" aria-label={t("catalog.offerings.filterSubject")}>
            <SelectValue placeholder={t("catalog.offerings.filterSubject")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("catalog.offerings.filterSubject")}</SelectItem>
            {subjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nameAr}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-64" aria-label={t("catalog.offerings.filterGrade")}>
            <SelectValue placeholder={t("catalog.offerings.filterGrade")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("catalog.offerings.filterGrade")}</SelectItem>
            {grades.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {gradeLabel(g)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ms-auto">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            {t("catalog.offerings.add")}
          </Button>
        </div>
      </div>

      {offeringsQ.query.isLoading ? (
        <TableSkeleton rows={6} />
      ) : offeringsQ.query.isError ? (
        (() => {
          const denied =
            (offeringsQ.query.error as { statusCode?: number } | null)?.statusCode === 403;
          return (
            <EmptyState
              tone={denied ? "denied" : "error"}
              icon={TriangleAlert}
              title={denied ? queryStrings.denied : queryStrings.loadFailed}
              action={
                denied ? undefined : (
                  <Button variant="outline" onClick={() => void offeringsQ.query.refetch()}>
                    <RefreshCcw className="size-4" aria-hidden="true" />
                    {queryStrings.retry}
                  </Button>
                )
              }
            />
          );
        })()
      ) : offerings.length === 0 ? (
        <EmptyState title={t("common.noData")} description={t("catalog.offerings.emptyHint")} />
      ) : (
        <DataTable columns={columns} data={offerings} />
      )}

      <Dialog open={addOpen} onOpenChange={(o) => !o && setAddOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("catalog.offerings.add")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="offering-subject">{t("catalog.offerings.subject")}</Label>
              <Select
                value={draft.subjectId ?? ""}
                onValueChange={(v) => setDraft((d) => ({ ...d, subjectId: v }))}
              >
                <SelectTrigger id="offering-subject">
                  <SelectValue placeholder={t("catalog.offerings.subject")} />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="offering-grade">{t("catalog.offerings.gradeLevel")}</Label>
              <Select
                value={draft.gradeLevelId ?? ""}
                onValueChange={(v) => setDraft((d) => ({ ...d, gradeLevelId: v, trackId: ALL }))}
              >
                <SelectTrigger id="offering-grade">
                  <SelectValue placeholder={t("catalog.offerings.gradeLevel")} />
                </SelectTrigger>
                <SelectContent>
                  {grades.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {gradeLabel(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="offering-track">{t("catalog.offerings.track")}</Label>
              <Select
                value={draft.trackId ?? ALL}
                onValueChange={(v) => setDraft((d) => ({ ...d, trackId: v }))}
              >
                <SelectTrigger id="offering-track">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("catalog.offerings.allTracks")}</SelectItem>
                  {(draftGrade?.gradeTracks ?? []).map((gt) => (
                    <SelectItem key={gt.track.id} value={gt.track.id}>
                      {gt.track.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={busy}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={() => void submitAdd()} disabled={busy || !draft.subjectId || !draft.gradeLevelId}>
              {busy ? <Spinner /> : null}
              {t("actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
