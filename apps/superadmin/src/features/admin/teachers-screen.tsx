"use client";

import { useState } from "react";
import { useList, useCustomMutation } from "@refinedev/core";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { toast } from "@repo/ui/components/sonner";
import { PageHeader } from "@/components/kit/page-header";
import { StatusBadge } from "@/components/kit/status-badge";
import { Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";

type TeacherRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  attendanceMode: "counter_only" | "counter_and_door" | null;
};

const ANY = "__any__";
const MODES = ["counter_only", "counter_and_door"] as const;

/** Superadmin Teachers list — search/filter/paginate + attendance-mode management (Step 6). */
export function TeachersScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { mutateAsync: patch } = useCustomMutation();

  const { query, result } = useList({
    resource: "admin/teachers",
    filters: [
      ...(q ? [{ field: "q", operator: "eq" as const, value: q }] : []),
      ...(status ? [{ field: "status", operator: "eq" as const, value: status }] : []),
      ...(mode ? [{ field: "mode", operator: "eq" as const, value: mode }] : []),
    ],
    pagination: { currentPage: page, pageSize: 20 },
  });

  const rows = (result?.data ?? []) as TeacherRow[];
  const total = (result?.total ?? 0) as number;
  const pageCount = Math.max(1, Math.ceil(total / 20));

  const setTeacherMode = async (row: TeacherRow, next: string) => {
    if (next === row.attendanceMode) return;
    try {
      await patch({
        url: `admin/teachers/${row.id}/attendance-mode`,
        method: "patch",
        values: { mode: next },
      });
      toast.success(t("teachers.modeSaved"));
      query.refetch();
    } catch (err: any) {
      toast.error(err?.message || t("teachers.modeFailed"));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("teachers.title")} description={t("teachers.description")} />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("teachers.searchPlaceholder")}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="ps-9 pe-9"
            />
            {q && (
              <button
                type="button"
                aria-label={t("teachers.clearSearch")}
                onClick={() => setQ("")}
                className="absolute inset-inline-end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <Select
            value={status ?? undefined}
            onValueChange={(v) => {
              setStatus(v === ANY ? null : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t("teachers.statusFilter")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("teachers.any")}</SelectItem>
              {["active", "pending", "suspended"].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={mode ?? undefined}
            onValueChange={(v) => {
              setMode(v === ANY ? null : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t("teachers.modeFilter")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("teachers.any")}</SelectItem>
              {MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`teachers.mode_${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="p-6">
              <Spinner />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{t("teachers.colName")}</TableHead>
                  <TableHead>{t("teachers.colContact")}</TableHead>
                  <TableHead className="text-center">{t("teachers.colStatus")}</TableHead>
                  <TableHead>{t("teachers.colMode")}</TableHead>
                  <TableHead>{t("teachers.colJoined")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      {t("teachers.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden
                            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary"
                          >
                            {r.name ? r.name.trim().charAt(0) : "—"}
                          </span>
                          <span>{r.name ?? "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="block text-sm">{r.email ?? "—"}</span>
                        <span className="block text-xs text-muted-foreground" dir="ltr">
                          {r.phone ?? ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge
                          tone={
                            r.status === "active"
                              ? "success"
                              : r.status === "pending"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {r.status}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        {r.attendanceMode === null ? (
                          <span className="text-xs text-muted-foreground">
                            {t("teachers.noProfile")}
                          </span>
                        ) : (
                          <Select
                            value={r.attendanceMode}
                            onValueChange={(v) => setTeacherMode(r, v)}
                          >
                            <SelectTrigger className="w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MODES.map((m) => (
                                <SelectItem key={m} value={m}>
                                  {t(`teachers.mode_${m}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(r.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
            <span className="text-sm text-muted-foreground">
              {t("teachers.total", { count: total })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t("teachers.prev")}
              </Button>
              <span className="self-center text-sm">
                {page} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("teachers.next")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
