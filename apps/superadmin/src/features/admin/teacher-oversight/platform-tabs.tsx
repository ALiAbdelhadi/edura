"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShieldAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Num } from "@repo/ui/components/num";
import type { Locale } from "@repo/ui/lib/format";

import { Link } from "@/i18n/navigation";
import { OversightTable, type Col } from "./oversight-table";
import { useTeacherOversight, type Paged } from "./use-teacher-oversight";

type Row = Record<string, unknown>;

/**
 * Everything the platform has done TO this teacher. The audit table is
 * append-only, so this is the record, not a summary of one — which is why a
 * row opens its own before/after rather than being flattened into a sentence.
 */
export function AuditTab({ teacherId, enabled }: { teacherId: string; enabled: boolean }) {
  const t = useTranslations("teacherOversight");
  const locale = useLocale() as Locale;
  const [entry, setEntry] = useState<Row | null>(null);
  const req = useTeacherOversight<Paged<Row>>(teacherId, "audit", {
    enabled,
    query: { limit: "100" },
  });
  if (!enabled) return null;

  const columns: Col[] = [
    {
      key: "action",
      label: t("colAction"),
      render: (r) => <Badge variant="secondary">{String(r.action)}</Badge>,
    },
    {
      key: "actorName",
      label: t("colActor"),
      render: (r) =>
        r.actorId ? (
          <Link
            className="focus-ledger underline underline-offset-2"
            href={`/dashboard/superadmin/users/${String(r.actorId)}`}
          >
            {(r.actorName as string) ?? String(r.actorId).slice(0, 8)}
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "targetType", label: t("colTargetType") },
    { key: "createdAt", label: t("colWhen"), date: true },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Alert>
        <ShieldAlert className="size-4" />
        <AlertTitle>{t("auditTitle")}</AlertTitle>
        <AlertDescription>{t("auditBody")}</AlertDescription>
      </Alert>

      <OversightTable
        locale={locale}
        loading={req.isLoading}
        failed={req.isError}
        onRetry={req.refetch}
        rows={req.data?.data ?? []}
        total={req.data?.total ?? 0}
        columns={columns}
        emptyText={t("noAudit")}
        onRowClick={(r) => setEntry(r)}
        rowLabel={(r) => String(r.action)}
      />

      <Dialog open={!!entry} onOpenChange={(o) => !o && setEntry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{entry ? String(entry.action) : ""}</DialogTitle>
          </DialogHeader>
          {entry ? (
            <div className="grid gap-3">
              <p className="text-xs text-ink-2">
                <Num.Date
                  value={String(entry.createdAt)}
                  locale={locale}
                  options={{ dateStyle: "medium", timeStyle: "short" }}
                />
              </p>
              <section>
                <h4 className="pb-1 text-xs font-semibold text-ink-2">{t("before")}</h4>
                <pre className="overflow-x-auto rounded-md bg-field p-3 text-xs whitespace-pre-wrap">
                  {JSON.stringify(entry.beforeState ?? null, null, 2)}
                </pre>
              </section>
              <section>
                <h4 className="pb-1 text-xs font-semibold text-ink-2">{t("after")}</h4>
                <pre className="overflow-x-auto rounded-md bg-field p-3 text-xs whitespace-pre-wrap">
                  {JSON.stringify(entry.afterState ?? null, null, 2)}
                </pre>
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
