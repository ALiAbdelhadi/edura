"use client";

import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { StatCard } from "@/components/kit/stat-card";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import CopyableText from "@/components/ui/copyable-text";
import FilterBar from "@/components/ui/filter-bar";
import StudentLink from "@/components/ui/student-link";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useCustomMutation,
  useInvalidate,
  useList,
  useUpdate,
} from "@refinedev/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
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
import { cn } from "@repo/ui/lib/utils";
import { Ban, Bell, UserPlus, UserRound, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

function StudentRowActions({
  record,
  onBlacklist,
  onUnblacklist,
  pending,
}: {
  record: any;
  onBlacklist: (id: string, reason: string) => void;
  onUnblacklist: (id: string) => void;
  pending: boolean;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const id = record.id || record._id;
  const name = record.name || record.user?.name;

  if (record.blacklisted) {
    return (
      <ConfirmDialog
        trigger={
          <Button variant="link" size="sm" className="h-auto p-0 text-success">
            {t("adminHome.students_unblacklist")}
          </Button>
        }
        title={`${t("adminHome.students_unblacklist")} ${name}?`}
        confirmText={t("adminHome.students_unblacklist")}
        cancelText={t("actions.cancel")}
        onConfirm={() => onUnblacklist(id)}
      />
    );
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setReason("");
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-destructive"
        >
          {t("actions.blacklist")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`${t("actions.blacklist")} ${name}?`}</AlertDialogTitle>
        </AlertDialogHeader>
        <Input
          placeholder={t("adminHome.students_reasonRequired")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-2"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "destructive" }))}
            disabled={!reason || pending}
            onClick={() => onBlacklist(id, reason)}
          >
            {pending ? <Spinner /> : null}
            {t("actions.blacklist")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

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
        (s.name || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q);
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
        onSuccess: () =>
          toast.success(t("adminHome.students_unblacklistSuccess")),
        onError: (err) =>
          toast.error(
            (err as any)?.message || t("adminHome.students_unblacklistFailed"),
          ),
      },
    );
  };

  const handleBlacklist = (id: string, reason: string) => {
    updateStudent(
      {
        resource: "students",
        id,
        values: { blacklisted: true, blacklistReason: reason },
      },
      {
        onSuccess: () =>
          toast.success(t("adminHome.students_blacklistSuccess")),
        onError: (err) =>
          toast.error(
            (err as any)?.message || t("adminHome.students_blacklistFailed"),
          ),
      },
    );
  };

  const handleInvite = (values: { email: string; name?: string }) => {
    invite(
      { url: "roster/students/invite", method: "post", values },
      {
        onSuccess: () => {
          toast.success(
            `${t("adminHome.students_inviteSent")} ${values.email}`,
          );
          inviteForm.reset();
          setIsInviteOpen(false);
          invalidate({ resource: "students", invalidates: ["list"] });
        },
        onError: (err) => {
          toast.error(
            (err as { message?: string })?.message ||
              t("adminHome.students_inviteFailed"),
          );
        },
      },
    );
  };

  const totalStudents = students.length;
  const blacklistedCount = students.filter((s: any) => s.blacklisted).length;
  const pendingRequestsCount =
    pendingRequestsResult?.total ?? pendingRequestsResult?.data?.length ?? 0;

  const columns: ColumnDef<any>[] = [
    {
      id: "name",
      header: t("adminHome.students_colStudent"),
      cell: ({ row }) => {
        const record = row.original;
        const id = String(record.studentId || record.id || record._id || "");
        return (
          <div className="flex items-center gap-2">
            <UserRound className="size-4 text-muted-foreground" />
            <StudentLink
              studentId={id}
              name={record.name || record.user?.name}
            />
          </div>
        );
      },
    },
    {
      id: "userId",
      header: t("adminHome.students_colUserId"),
      cell: ({ row }) => (
        <CopyableText
          value={row.original.studentId || row.original.id || row.original._id}
          label="User ID"
        />
      ),
    },
    {
      id: "email",
      header: t("auth.email"),
      cell: ({ row }) => row.original.email || row.original.user?.email,
    },
    {
      id: "coursesCount",
      header: t("nav.courses"),
      cell: ({ row }) => row.original.coursesCount || 0,
    },
    {
      id: "status",
      header: t("adminHome.students_status"),
      cell: ({ row }) => {
        const record = row.original;
        if (record.blacklisted) {
          return (
            <StatusBadge tone="danger">{t("status.blacklisted")}</StatusBadge>
          );
        }
        const status = record.status || "active";
        const toneMap: Record<string, StatusTone> = {
          active: "success",
          shell: "neutral",
          suspended: "warning",
        };
        const labelMap: Record<string, string> = {
          active: t("status.active"),
          shell: t("adminHome.students_statusShell"),
          suspended: t("status.suspended"),
        };
        return (
          <StatusBadge tone={toneMap[status] || "neutral"}>
            {labelMap[status] ||
              status.charAt(0).toUpperCase() + status.slice(1)}
          </StatusBadge>
        );
      },
    },
    {
      id: "joined",
      header: t("adminHome.students_colJoined"),
      cell: ({ row }) => {
        const record = row.original;
        const dateStr = record.createdAt || record.addedAt;
        if (!dateStr) return t("adminHome.students_notAvailable");
        try {
          return formatDate(dateStr, { month: "short", year: "numeric" });
        } catch {
          return t("adminHome.students_notAvailable");
        }
      },
    },
    {
      id: "actions",
      header: t("adminHome.students_colActions"),
      cell: ({ row }) => (
        <StudentRowActions
          record={row.original}
          onBlacklist={handleBlacklist}
          onUnblacklist={handleUnblacklist}
          pending={updateMutation.isPending}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.students")}
        actions={
          <>
            <Suspense fallback={null}>
              <FilterBar
                searchField={{
                  key: "q",
                  placeholder: t("adminHome.students_searchPlaceholder"),
                }}
                facets={[
                  {
                    key: "status",
                    placeholder: t("adminHome.students_status"),
                    options: [
                      { label: t("status.active"), value: "active" },
                      {
                        label: t("adminHome.students_statusShell"),
                        value: "shell",
                      },
                      { label: t("status.blacklisted"), value: "blacklisted" },
                    ],
                  },
                ]}
                onFilterChange={setFilterValues}
              />
            </Suspense>
            <Button onClick={() => setIsInviteOpen(true)}>
              <UserPlus className="size-4" />
              {t("adminHome.students_addStudent")}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label={t("adminHome.students_totalStudents")}
          value={totalStudents}
          icon={Users}
          accent
        />
        <StatCard
          label={t("adminHome.students_pendingRequests")}
          value={pendingRequestsCount}
          icon={Bell}
        />
        <StatCard
          label={t("status.blacklisted")}
          value={<span className="text-destructive">{blacklistedCount}</span>}
          icon={Ban}
        />
      </div>

      <Card>
        <CardContent>
          {query.isLoading ? (
            <PageSpinner />
          ) : (
            <DataTable
              columns={columns}
              data={filtered}
              emptyState={
                <EmptyState
                  icon={Users}
                  title={t("adminHome.students_noStudents")}
                />
              }
            />
          )}
        </CardContent>
      </Card>

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
            <DialogDescription>
              {t("adminHome.students_inviteHint")}
            </DialogDescription>
          </DialogHeader>
          <Form {...inviteForm}>
            <form
              id="invite-student-form"
              onSubmit={inviteForm.handleSubmit(handleInvite)}
              className="space-y-4"
            >
              <FormField
                control={inviteForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.email")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="student@example.com"
                        autoFocus
                        {...field}
                      />
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
                    <FormLabel>
                      {t("adminHome.students_nameOptional")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("adminHome.students_fullName")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button
              type="submit"
              form="invite-student-form"
              disabled={inviteMutation.isPending}
            >
              {inviteMutation.isPending ? <Spinner /> : null}
              {t("actions.sendInvite")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
