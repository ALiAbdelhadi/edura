/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import CopyableText from "@/components/ui/copyable-text";
import FilterBar from "@/components/ui/filter-bar";
import StudentLink from "@/components/ui/student-link";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCustomMutation, useInvalidate, useList, useUpdate } from "@refinedev/core";
import { track } from "@/lib/track";
import { ANALYTICS_EVENTS } from "@repo/observability";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { Ban, Bell, FileUp, UserPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { StudentImportDialog } from "./student-import-dialog";
import {
  Badge,
  BlacklistCascadePanel,
  DataTable,
  EmptyState,
  MetricCard,
  Num,
  PageHead,
  RowIdentity,
  Sheet,
  type BadgeTone,
  type Column,
} from "./ledger";

export function AdminStudentsScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const { query, result } = useList({ resource: "students" });
  const { result: pendingRequestsResult } = useList({
    resource: "enrollment-requests",
    filters: [{ field: "status", operator: "eq", value: "pending" }],
    pagination: { mode: "off" },
  });
  const { mutate: updateStudent, mutation: updateMutation } = useUpdate();
  const { mutate: invite, mutation: inviteMutation } = useCustomMutation();
  const invalidate = useInvalidate();

  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  // The student whose blacklist decision panel is open. Selecting a row does not
  // open it — only the explicit action does; blacklisting is not a browse action.
  const [cascadeFor, setCascadeFor] = useState<{ id: string; name: string } | null>(null);

  const inviteSchema = z.object({
    email: z
      .string()
      .min(1, t("adminHome.students_emailRequired"))
      .email(t("adminHome.students_invalidEmail")),
    name: z.string().optional(),
  });
  const inviteForm = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", name: "" },
  });

  const students = (result?.data ?? []) as any[];

  const searchTerm = filterValues.q || "";
  const statusFilter = filterValues.status || "";
  const filtered = students.filter((s: any) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        (s.name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    if (statusFilter) {
      if (statusFilter === "blacklisted") return s.blacklisted;
      return !s.blacklisted && (s.status || "active") === statusFilter;
    }
    return true;
  });

  const handleUnblacklist = (id: string) => {
    updateStudent(
      { resource: "students", id, values: { blacklisted: false } },
      {
        onSuccess: () => toast.success(t("adminHome.students_unblacklistSuccess")),
        onError: (err) =>
          toast.error((err as any)?.message || t("adminHome.students_unblacklistFailed")),
      },
    );
  };

  const handleBlacklist = (id: string, reason: string) => {
    updateStudent(
      { resource: "students", id, values: { blacklisted: true, blacklistReason: reason } },
      {
        onSuccess: () => {
          toast.success(t("adminHome.students_blacklistSuccess"));
          setCascadeFor(null);
        },
        onError: (err) =>
          toast.error((err as any)?.message || t("adminHome.students_blacklistFailed")),
      },
    );
  };

  const handleInvite = (values: { email: string; name?: string }) => {
    invite(
      { url: "roster/students/invite", method: "post", values },
      {
        onSuccess: () => {
          toast.success(`${t("adminHome.students_inviteSent")} ${values.email}`);
          inviteForm.reset();
          setIsInviteOpen(false);
          invalidate({ resource: "students", invalidates: ["list"] });
        },
        onError: (err) => {
          toast.error((err as { message?: string })?.message || t("adminHome.students_inviteFailed"));
        },
      },
    );
  };

  const totalStudents = students.length;
  const blacklistedCount = students.filter((s: any) => s.blacklisted).length;
  const pendingRequestsCount =
    pendingRequestsResult?.total ?? pendingRequestsResult?.data?.length ?? 0;

  const columns: Column<any>[] = [
    {
      id: "name",
      header: t("adminHome.students_colStudent"),
      cell: (r) => {
        const id = String(r.studentId || r.id || r._id || "");
        const name = r.name || r.user?.name || "—";
        return (
          <RowIdentity
            name={<StudentLink studentId={id} name={name} />}
            initialsFrom={name}
            meta={r.email || r.user?.email}
          />
        );
      },
    },
    {
      // The printable student code, not the internal UUID: the code is what
      // the card, the counter and the receipt all speak.
      id: "studentCode",
      header: t("adminHome.students_colCode"),
      cell: (r) =>
        r.studentCode ? (
          <CopyableText value={r.studentCode} label={t("adminHome.students_colCode")} />
        ) : (
          <span className="text-[13px] text-[var(--ink-3)]">—</span>
        ),
    },
    {
      id: "coursesCount",
      // Active ENROLLMENTS at this center (the roster link), not subscriptions.
      header: t("adminHome.students_colCourses"),
      numeric: true,
      cell: (r) => <Num className="text-[13px] text-[var(--ink)]">{r.coursesCount || 0}</Num>,
    },
    {
      id: "status",
      header: t("adminHome.students_status"),
      cell: (r) => {
        if (r.blacklisted) return <Badge tone="failed">{t("status.blacklisted")}</Badge>;
        const status = r.status || "active";
        const toneMap: Record<string, BadgeTone> = {
          active: "done",
          shell: "neutral",
          suspended: "pending",
        };
        const labelMap: Record<string, string> = {
          active: t("status.active"),
          shell: t("adminHome.students_statusShell"),
          suspended: t("status.suspended"),
        };
        return (
          <Badge tone={toneMap[status] || "neutral"}>
            {labelMap[status] || status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        );
      },
    },
    {
      id: "joined",
      header: t("adminHome.students_colJoined"),
      cell: (r) => {
        const dateStr = r.createdAt || r.addedAt;
        if (!dateStr)
          return <span className="text-xs text-[var(--ink-3)]">{t("adminHome.students_notAvailable")}</span>;
        try {
          return (
            <Num className="text-xs text-[var(--ink-3)]">
              {formatDate(dateStr, { month: "short", year: "numeric" })}
            </Num>
          );
        } catch {
          return <span className="text-xs text-[var(--ink-3)]">{t("adminHome.students_notAvailable")}</span>;
        }
      },
    },
    {
      id: "actions",
      header: t("adminHome.students_colActions"),
      srOnly: true,
      numeric: true,
      cell: (r) => {
        const id = r.id || r._id;
        const name = r.name || r.user?.name || "—";
        if (r.blacklisted) {
          return (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm" className="text-[var(--teal)]">
                  {t("adminHome.students_unblacklist")}
                </Button>
              }
              title={`${t("adminHome.students_unblacklist")} ${name}?`}
              confirmText={t("adminHome.students_unblacklist")}
              cancelText={t("actions.cancel")}
              onConfirm={() => handleUnblacklist(id)}
            />
          );
        }
        return (
          <Button
            variant="ghost"
            size="sm"
            className="text-[var(--red)]"
            onClick={() => setCascadeFor({ id, name })}
          >
            {t("actions.blacklist")}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={t("nav.students")}
        actions={
          <>
            <Suspense fallback={null}>
              <FilterBar
                searchField={{ key: "q", placeholder: t("adminHome.students_searchPlaceholder") }}
                facets={[
                  {
                    key: "status",
                    placeholder: t("adminHome.students_status"),
                    options: [
                      { label: t("status.active"), value: "active" },
                      { label: t("adminHome.students_statusShell"), value: "shell" },
                      { label: t("status.blacklisted"), value: "blacklisted" },
                    ],
                  },
                ]}
                onFilterChange={setFilterValues}
              />
            </Suspense>
            <Button variant="outline" onClick={() => setIsImportOpen(true)}>
              <FileUp className="size-4" />
              {t("adminHome.students_import")}
            </Button>
            <Button onClick={() => setIsInviteOpen(true)}>
              <UserPlus className="size-4" />
              {t("adminHome.students_addStudent")}
            </Button>
          </>
        }
      />

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          href="/dashboard/admin/students"
          label={t("adminHome.students_totalStudents")}
          icon={<Users className="size-[15px]" />}
          tone="indigo"
          count={totalStudents}
        />
        <MetricCard
          href="/dashboard/admin/enrollment-requests"
          label={t("adminHome.students_pendingRequests")}
          icon={<Bell className="size-[15px]" />}
          tone="amber"
          count={pendingRequestsCount}
        />
        <MetricCard
          href="/dashboard/admin/students"
          label={t("status.blacklisted")}
          icon={<Ban className="size-[15px]" />}
          tone="red"
          count={blacklistedCount}
        />
      </div>

      <div className={cascadeFor ? "grid gap-4 xl:grid-cols-[1fr_396px]" : undefined}>
        {query.isLoading ? (
          <PageSpinner />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(r) => String(r.id ?? r._id ?? r.studentId)}
            selectedKey={cascadeFor?.id ?? null}
            caption={t("nav.students")}
            empty={
              /* Only offered when the roster is genuinely empty rather than
                 filtered to nothing — `filtered` is the search result, so this
                 branch also covers "no matches". The CTA is still the right
                 next step in both cases: register the student you're looking
                 for. */
              <EmptyState
                icon={<Users className="size-6" />}
                title={t("activation.empty.students.title")}
                hint={t("activation.empty.students.body")}
                action={
                  <Button
                    onClick={() => {
                      track(ANALYTICS_EVENTS.EMPTY_STATE_CTA_CLICKED, { list: "students" });
                      setIsInviteOpen(true);
                    }}
                  >
                    {t("activation.empty.students.cta")}
                  </Button>
                }
              />
            }
          />
        )}

        {cascadeFor ? (
          <Sheet className="h-fit p-4">
            <BlacklistCascadePanel
              studentId={cascadeFor.id}
              studentName={cascadeFor.name}
              busy={updateMutation.isPending}
              onCommit={(reason) => handleBlacklist(cascadeFor.id, reason)}
            />
            <Button
              variant="ghost"
              className="mt-2 w-full text-[13px] text-[var(--ink-2)]"
              onClick={() => setCascadeFor(null)}
            >
              {t("actions.cancel")}
            </Button>
          </Sheet>
        ) : null}
      </div>

      <StudentImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImported={() => invalidate({ resource: "students", invalidates: ["list"] })}
      />

      <Dialog
        open={isInviteOpen}
        onOpenChange={(open) => {
          setIsInviteOpen(open);
          if (!open) inviteForm.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminHome.students_inviteStudent")}</DialogTitle>
            <DialogDescription>{t("adminHome.students_inviteHint")}</DialogDescription>
          </DialogHeader>
          <Form {...inviteForm}>
            <form
              id="invite-student-form"
              onSubmit={inviteForm.handleSubmit(handleInvite)}
              className="flex flex-col gap-4"
            >
              <FormField
                control={inviteForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.email")}</FormLabel>
                    <FormControl>
                      <Input dir="ltr" className="num" placeholder="student@example.com" autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={inviteForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminHome.students_nameOptional")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("adminHome.students_fullName")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button type="submit" form="invite-student-form" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? <Spinner /> : null}
              {t("actions.sendInvite")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
