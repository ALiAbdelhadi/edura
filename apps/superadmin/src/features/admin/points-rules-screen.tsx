"use client";

import { useState } from "react";
import { useCustom } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { Award, Plus, RefreshCcw, Trash2, TriangleAlert } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { StatusBadge } from "@repo/ui/components/status-badge";
import { useQueryStrings } from "@repo/ui/components/query-section";

import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { TableSkeleton } from "@/components/ui/skeletons";
import { EntityDialog } from "@/features/admin/catalog/entity-dialog";
import { useAction } from "@/lib/api/use-action";

type Rule = {
  id: string;
  eventName: string;
  pointsValue: number;
  isActive: boolean;
};

export function PointsRulesScreen() {
  const t = useTranslations();
  const queryStrings = useQueryStrings();
  const [adding, setAdding] = useState(false);

  const rulesQ = useCustom<Rule[]>({ url: "admin/points/rules", method: "get" });
  const rules = (() => {
    const d = rulesQ.result?.data as unknown;
    return Array.isArray(d) ? (d as Rule[]) : [];
  })();

  const { run, busy, busyKey } = useAction({ onSuccess: () => void rulesQ.query.refetch() });

  const toggle = (rule: Rule) =>
    run({
      url: `admin/points/rules/${rule.id}`,
      method: "patch",
      values: { isActive: !rule.isActive },
      key: rule.id,
      successMsg: t("points.saved"),
    });

  const setValue = (rule: Rule, pointsValue: number) =>
    run({
      url: `admin/points/rules/${rule.id}`,
      method: "patch",
      values: { pointsValue },
      key: rule.id,
      successMsg: t("points.saved"),
    });

  const remove = async (rule: Rule) => {
    const res = await run({
      url: `admin/points/rules/${rule.id}`,
      method: "delete",
      key: rule.id,
      successMsg: t("points.deleted"),
    });
    if (!res.ok) throw res.error;
  };

  const columns: ColumnDef<Rule, unknown>[] = [
    {
      id: "eventName",
      header: t("points.colEvent"),
      cell: ({ row }) => (
        <span className="font-mono text-[13px]" dir="ltr">
          {row.original.eventName}
        </span>
      ),
    },
    {
      id: "pointsValue",
      header: t("points.colValue"),
      cell: ({ row }) => (
        <PointsValueInput
          rule={row.original}
          disabled={busyKey === row.original.id}
          onCommit={(v) => void setValue(row.original, v)}
        />
      ),
    },
    {
      id: "isActive",
      header: t("points.colState"),
      cell: ({ row }) => (
        <button
          type="button"
          disabled={busyKey === row.original.id}
          onClick={() => void toggle(row.original)}
        >
          <StatusBadge tone={row.original.isActive ? "success" : "warning"}>
            {t(row.original.isActive ? "status.active" : "status.suspended")}
          </StatusBadge>
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
              <span className="sr-only">{t("actions.delete")}</span>
            </Button>
          }
          destructive
          title={t("points.deleteTitle")}
          description={t("points.deleteBody")}
          confirmText={t("actions.delete")}
          onConfirm={() => remove(row.original)}
        />
      ),
    },
  ];

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={t("points.title")}
        description={t("points.description")}
        rule
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden="true" />
            {t("points.add")}
          </Button>
        }
      />

      {rulesQ.query.isLoading ? (
        <TableSkeleton rows={5} />
      ) : rulesQ.query.isError ? (
        <EmptyState
          tone={
            (rulesQ.query.error as { statusCode?: number } | null)?.statusCode === 403
              ? "denied"
              : "error"
          }
          icon={TriangleAlert}
          title={queryStrings.loadFailed}
          action={
            <Button variant="outline" onClick={() => void rulesQ.query.refetch()}>
              <RefreshCcw className="size-4" aria-hidden="true" />
              {queryStrings.retry}
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={rules}
          emptyState={
            <EmptyState
              tone="empty"
              icon={Award}
              title={t("points.empty")}
              description={t("points.emptyBody")}
            />
          }
        />
      )}

      <AddRuleDialog
        open={adding}
        onOpenChange={setAdding}
        busy={busy}
        onSubmit={async (values) => {
          const res = await run({
            url: "admin/points/rules",
            values,
            successMsg: t("points.created"),
          });
          if (res.ok) setAdding(false);
        }}
      />
    </div>
  );
}

/** Committed on blur or Enter, not per keystroke: one PATCH per decision. */
function PointsValueInput({
  rule,
  disabled,
  onCommit,
}: {
  rule: Rule;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const t = useTranslations();
  const [draft, setDraft] = useState(String(rule.pointsValue));

  const commit = () => {
    const next = Number(draft);
    if (!Number.isInteger(next) || next === rule.pointsValue) {
      setDraft(String(rule.pointsValue));
      return;
    }
    onCommit(next);
  };

  return (
    <Input
      type="number"
      step={1}
      dir="ltr"
      className="h-8 w-24"
      aria-label={`${t("points.colValue")}: ${rule.eventName}`}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

function AddRuleDialog({
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onSubmit: (values: { eventName: string; pointsValue: number }) => Promise<void>;
}) {
  const t = useTranslations();

  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("points.add")}
      busy={busy}
      initial={{ pointsValue: 0 }}
      fields={[
        {
          name: "eventName",
          label: t("points.colEvent"),
          type: "text",
          required: true,
          dir: "ltr",
          placeholder: "session_attended",
          hint: t("points.eventHint"),
        },
        // Save used to sit dead until the name was filled and the value parsed
        // as a whole number, without saying which of the two was the problem.
        { name: "pointsValue", label: t("points.colValue"), type: "number", required: true, dir: "ltr" },
      ]}
      onSubmit={async (v) => {
        await onSubmit({
          eventName: String(v.eventName).trim(),
          pointsValue: Math.round(Number(v.pointsValue)),
        });
      }}
    />
  );
}
