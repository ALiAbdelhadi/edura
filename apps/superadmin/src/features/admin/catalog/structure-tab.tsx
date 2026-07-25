"use client";

import { EmptyState } from "@/components/kit/empty-state";
import { StatusBadge } from "@/components/kit/status-badge";
import { TableSkeleton } from "@/components/ui/skeletons";
import { useCustom } from "@refinedev/core";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import { Pencil, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EntityDialog, type FieldSpec, type FieldValue } from "./entity-dialog";
import type { GradeRow, StageRow, SystemRow, TrackRow } from "./types";
import { useCatalogMutation } from "./use-catalog-mutation";

type DialogState =
  | { kind: "system"; row?: SystemRow }
  | { kind: "stage"; row?: StageRow }
  | { kind: "grade"; row?: GradeRow }
  | { kind: "track"; row?: TrackRow }
  | null;


function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

const ENDPOINT: Record<NonNullable<DialogState>["kind"], string> = {
  system: "admin/catalog/systems",
  stage: "admin/catalog/stages",
  grade: "admin/catalog/grade-levels",
  track: "admin/catalog/tracks",
};

export function StructureTab() {
  const t = useTranslations();
  const { mutate, busy } = useCatalogMutation();
  const [systemId, setSystemId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);

  const systemsQ = useCustom<SystemRow[]>({ url: "admin/catalog/systems", method: "get" });
  const stagesQ = useCustom<StageRow[]>({
    url: "admin/catalog/stages",
    method: "get",
    config: { query: systemId ? { systemId } : {} },
    queryOptions: { enabled: !!systemId },
  });
  const gradesQ = useCustom<GradeRow[]>({
    url: "admin/catalog/grade-levels",
    method: "get",
    config: { query: stageId ? { stageId } : {} },
    queryOptions: { enabled: !!stageId },
  });
  const tracksQ = useCustom<TrackRow[]>({
    url: "admin/catalog/tracks",
    method: "get",
    config: { query: stageId ? { stageId } : {} },
    queryOptions: { enabled: !!stageId },
  });

  const systems = asArray<SystemRow>(systemsQ.result?.data);
  const stages = asArray<StageRow>(stagesQ.result?.data);
  const grades = asArray<GradeRow>(gradesQ.result?.data);
  const tracks = asArray<TrackRow>(tracksQ.result?.data);

  const refreshAll = () => {
    void systemsQ.query.refetch();
    if (systemId) void stagesQ.query.refetch();
    if (stageId) {
      void gradesQ.query.refetch();
      void tracksQ.query.refetch();
    }
  };

  const baseFields = (row?: { code: string } | undefined): FieldSpec[] => [
    {
      name: "code",
      label: t("catalog.fields.code"),
      type: "text",
      required: true,
      disabled: !!row,
      hint: t("catalog.fields.codeHint"),
      dir: "ltr",
      placeholder: "my-code",
    },
    { name: "nameAr", label: t("catalog.fields.nameAr"), type: "text", required: true, dir: "rtl" },
    { name: "nameEn", label: t("catalog.fields.nameEn"), type: "text", dir: "ltr" },
    { name: "sortOrder", label: t("catalog.fields.sortOrder"), type: "number" },
    { name: "isActive", label: t("catalog.fields.isActive"), type: "checkbox" },
  ];

  const fieldsFor = (d: NonNullable<DialogState>): FieldSpec[] => {
    const base = baseFields(d.row);
    if (d.kind === "system")
      return [...base, { name: "iconKey", label: t("catalog.fields.iconKey"), type: "text", dir: "ltr" }];
    if (d.kind === "stage")
      return [...base, { name: "hasSecondLanguage", label: t("catalog.fields.hasSecondLanguage"), type: "checkbox" }];
    if (d.kind === "grade")
      return [
        ...base.slice(0, 3),
        { name: "level", label: t("catalog.fields.level"), type: "number", required: true },
        ...base.slice(3),
      ];
    return base;
  };

  async function submitDialog(values: Record<string, FieldValue>) {
    if (!dialog) return;
    const { kind, row } = dialog;
    const endpoint = ENDPOINT[kind];

    const payload: Record<string, unknown> = { ...values };
    if (payload.nameEn === "") delete payload.nameEn;
    if (payload.iconKey === "") delete payload.iconKey;
    if (row) delete payload.code;
    if (!row) {
      if (kind === "stage") payload.educationSystemId = systemId;
      if (kind === "grade" || kind === "track") payload.stageId = stageId;
    }

    const okRes = await mutate(row ? `${endpoint}/${row.id}` : endpoint, row ? "PATCH" : "POST", payload);
    if (okRes) {
      toast.success(row ? t("catalog.toasts.updated") : t("catalog.toasts.created"));
      setDialog(null);
      refreshAll();
    }
  }

  async function linkTrack(gradeLevelId: string, trackId: string) {
    const okRes = await mutate("admin/catalog/grade-tracks", "POST", { gradeLevelId, trackId });
    if (okRes) {
      toast.success(t("catalog.toasts.created"));
      refreshAll();
    }
  }

  async function unlinkTrack(linkId: string) {
    const okRes = await mutate(`admin/catalog/grade-tracks/${linkId}`, "DELETE");
    if (okRes) {
      toast.success(t("catalog.toasts.deleted"));
      refreshAll();
    }
  }

  const rowShell = (selected: boolean) =>
    cn(
      "w-full rounded-md border p-3 text-start transition-colors",
      selected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
    );

  const nameAndCode = (r: { nameAr: string; code: string; isActive: boolean }) => (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate font-medium">{r.nameAr}</span>
      <code className="shrink-0 text-xs text-muted-foreground" dir="ltr">
        {r.code}
      </code>
      {!r.isActive ? <StatusBadge tone="warning">{t("status.suspended")}</StatusBadge> : null}
    </div>
  );

  const editBtn = (onClick: () => void) => (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Pencil className="size-3.5" />
    </Button>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t("catalog.structure.systems")}</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "system" })}>
            <Plus className="size-4" />
            {t("catalog.structure.addSystem")}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-2">
          {systemsQ.query.isLoading ? (
            <TableSkeleton rows={3} />
          ) : (
            systems.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                className={cn(rowShell(systemId === s.id), "flex items-center justify-between gap-2")}
                onClick={() => {
                  setSystemId(s.id);
                  setStageId(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && (setSystemId(s.id), setStageId(null))}
              >
                {nameAndCode(s)}
                {editBtn(() => setDialog({ kind: "system", row: s }))}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t("catalog.structure.stages")}</CardTitle>
          <Button size="sm" variant="outline" disabled={!systemId} onClick={() => setDialog({ kind: "stage" })}>
            <Plus className="size-4" />
            {t("catalog.structure.addStage")}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-2">
          {!systemId ? (
            <EmptyState title={t("catalog.structure.selectSystemFirst")} />
          ) : stagesQ.query.isLoading ? (
            <TableSkeleton rows={3} />
          ) : (
            stages.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                className={cn(rowShell(stageId === s.id), "flex items-center justify-between gap-2")}
                onClick={() => setStageId(s.id)}
                onKeyDown={(e) => e.key === "Enter" && setStageId(s.id)}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {nameAndCode(s)}
                  {s.hasSecondLanguage ? (
                    <Badge variant="secondary">{t("catalog.structure.secondLanguageBadge")}</Badge>
                  ) : null}
                </div>
                {editBtn(() => setDialog({ kind: "stage", row: s }))}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {}
      <div className="grid gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("catalog.structure.gradeLevels")}</CardTitle>
            <Button size="sm" variant="outline" disabled={!stageId} onClick={() => setDialog({ kind: "grade" })}>
              <Plus className="size-4" />
              {t("catalog.structure.addGrade")}
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            {!stageId ? (
              <EmptyState title={t("catalog.structure.selectStageFirst")} />
            ) : gradesQ.query.isLoading ? (
              <TableSkeleton rows={3} />
            ) : grades.length === 0 ? (
              <EmptyState title={t("catalog.structure.noGrades")} />
            ) : (
              grades.map((g) => {
                const linkedTrackIds = new Set(g.gradeTracks.map((gt) => gt.track.id));
                const linkable = tracks.filter((tr) => tr.isActive && !linkedTrackIds.has(tr.id));
                return (
                  <div key={g.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      {nameAndCode(g)}
                      {editBtn(() => setDialog({ kind: "grade", row: g }))}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {t("catalog.structure.tracksForGrade")}:
                      </span>
                      {g.gradeTracks.map((gt) => (
                        <Badge key={gt.id} variant="secondary" className="gap-1">
                          {gt.track.nameAr}
                          <button
                            type="button"
                            aria-label={t("catalog.structure.unlinkTrack")}
                            onClick={() => void unlinkTrack(gt.id)}
                            className="hover:text-destructive"
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                      {linkable.length > 0 ? (
                        <Select value="" onValueChange={(trackId) => void linkTrack(g.id, trackId)}>
                          <SelectTrigger size="sm" className="h-7 w-auto text-xs">
                            <SelectValue placeholder={t("catalog.structure.linkTrack")} />
                          </SelectTrigger>
                          <SelectContent>
                            {linkable.map((tr) => (
                              <SelectItem key={tr.id} value={tr.id}>
                                {tr.nameAr}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("catalog.structure.tracks")}</CardTitle>
            <Button size="sm" variant="outline" disabled={!stageId} onClick={() => setDialog({ kind: "track" })}>
              <Plus className="size-4" />
              {t("catalog.structure.addTrack")}
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            {!stageId ? (
              <EmptyState title={t("catalog.structure.selectStageFirst")} />
            ) : tracksQ.query.isLoading ? (
              <TableSkeleton rows={2} />
            ) : tracks.length === 0 ? (
              <EmptyState title={t("catalog.structure.noTracks")} />
            ) : (
              tracks.map((tr) => (
                <div key={tr.id} className={cn(rowShell(false), "flex items-center justify-between gap-2")}>
                  {nameAndCode(tr)}
                  {editBtn(() => setDialog({ kind: "track", row: tr }))}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {dialog ? (
        <EntityDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={
            dialog.row
              ? t(`catalog.structure.edit${dialog.kind === "system" ? "System" : dialog.kind === "stage" ? "Stage" : dialog.kind === "grade" ? "Grade" : "Track"}` as Parameters<typeof t>[0])
              : t(`catalog.structure.add${dialog.kind === "system" ? "System" : dialog.kind === "stage" ? "Stage" : dialog.kind === "grade" ? "Grade" : "Track"}` as Parameters<typeof t>[0])
          }
          fields={fieldsFor(dialog)}
          initial={dialog.row ? { ...dialog.row, isActive: dialog.row.isActive } : { isActive: true, sortOrder: 0 }}
          busy={busy}
          onSubmit={submitDialog}
        />
      ) : null}
    </div>
  );
}
