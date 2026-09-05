"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShieldBan } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { IdentityCell, initialsOf } from "@repo/ui/components/identity-cell";
import { Num } from "@repo/ui/components/num";
import { StatusBadge } from "@repo/ui/components/status-badge";
import type { Locale } from "@repo/ui/lib/format";

import type { ColumnDef } from "@/components/kit/data-table";
import { ListFilter, ListShell } from "@/components/kit/list-shell";
import { ReasonDialog } from "@/components/kit/reason-dialog";
import { useAction } from "@/lib/api/use-action";
import { useListScreen } from "@/lib/api/use-list-screen";
import { asKey } from "@/lib/i18n/keys";

type Party = { id: string; name: string | null; email: string | null; role: string } | null;

type Entry = {
  id: string;
  level: "platform" | "center" | "teacher";
  reason: string;
  isActive: boolean;
  createdAt: string;
  removedAt: string | null;
  target: Party;
  imposedBy: Party;
  removedByUser: Party;
};

const LEVELS = ["platform", "center", "teacher"] as const;
const ACTIVE = ["true", "false"] as const;

export function BlacklistScreen() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [lifting, setLifting] = useState<Entry | null>(null);

  const list = useListScreen<Entry>({
    resource: "admin/blacklist",
    initialFilters: { active: "true" },
  });

  const columns: ColumnDef<Entry, unknown>[] = [
    {
      id: "target",
      header: t("blacklist.colTarget"),
      cell: ({ row }) => (
        <IdentityCell
          initials={initialsOf(row.original.target?.name ?? "—")}
          name={row.original.target?.name ?? row.original.target?.email ?? "—"}
          meta={
            row.original.target?.role ? (
              <span>{t(asKey(`roles.${row.original.target.role}`))}</span>
            ) : undefined
          }
        />
      ),
    },
    {
      id: "level",
      header: t("blacklist.colLevel"),
      cell: ({ row }) => (
        <StatusBadge tone={row.original.level === "platform" ? "rejected" : "warning"}>
          {t(asKey(`blacklist.level_${row.original.level}`))}
        </StatusBadge>
      ),
    },
    {
      id: "reason",
      header: t("blacklist.colReason"),
      cell: ({ row }) => <span className="text-[13px]">{row.original.reason}</span>,
    },
    {
      id: "imposedBy",
      header: t("blacklist.colImposedBy"),
      cell: ({ row }) => (
        <span className="text-[13px] text-ink-2">{row.original.imposedBy?.name ?? "—"}</span>
      ),
    },
    {
      id: "when",
      header: t("blacklist.colWhen"),
      cell: ({ row }) => (
        <Num.Date value={row.original.createdAt} locale={locale} className="text-[11px] text-ink-3" />
      ),
    },
    {
      id: "state",
      header: t("blacklist.colState"),
      cell: ({ row }) =>
        row.original.isActive ? (
          <Button size="sm" variant="outline" onClick={() => setLifting(row.original)}>
            {t("blacklist.lift")}
          </Button>
        ) : (
          <span className="text-[11px] text-ink-3">
            {t("blacklist.lifted")}
            {row.original.removedByUser?.name ? ` · ${row.original.removedByUser.name}` : ""}
          </span>
        ),
    },
  ];

  return (
    <>
      <ListShell
        list={list}
        title={t("blacklist.title")}
        description={t("blacklist.description")}
        columns={columns}
        toolbar={
          <>
            <ListFilter
              list={list}
              name="level"
              anyLabel={t("blacklist.anyLevel")}
              options={LEVELS}
              render={(l) => t(asKey(`blacklist.level_${l}`))}
            />
            <ListFilter
              list={list}
              name="active"
              anyLabel={t("blacklist.anyState")}
              options={ACTIVE}
              render={(a) => (a === "true" ? t("blacklist.stateActive") : t("blacklist.stateLifted"))}
            />
          </>
        }
        loadingLabel={t("common.loading")}
        emptyIcon={ShieldBan}
        emptyTitle={t("blacklist.empty")}
        emptyDescription={t("blacklist.emptyBody")}
        errorTitle={t("blacklist.loadError")}
        errorDescription={t("blacklist.loadErrorBody")}
        deniedTitle={t("blacklist.deniedTitle")}
        deniedDescription={t("blacklist.deniedBody")}
      />

      <LiftDialog
        entry={lifting}
        onClose={() => setLifting(null)}
        onDone={() => {
          setLifting(null);
          list.query.refetch();
        }}
      />
    </>
  );
}

function LiftDialog({
  entry,
  onClose,
  onDone,
}: {
  entry: Entry | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations();
  const { run } = useAction();

  // The shared reason dialog: a lift is audited and the reason IS the audit,
  // so this is the same contract as every other reasoned commit — including
  // rejecting on failure, which keeps the box open with what was typed.
  return (
    <ReasonDialog
      open={!!entry}
      onOpenChange={(o) => !o && onClose()}
      title={t("blacklist.liftTitle")}
      description={t("blacklist.liftBody")}
      confirmText={t("blacklist.lift")}
      destructive={false}
      onConfirm={async (reason) => {
        if (!entry) return;
        const res = await run({
          url: `admin/blacklist/${entry.id}/remove`,
          values: { reason },
          successMsg: t("blacklist.liftedToast"),
        });
        if (!res.ok) throw res.error;
        onDone();
      }}
    />
  );
}
