"use client";

import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { CollaborationPanel } from "@/features/collaboration/collaboration-panel";
import { asKey } from "@/lib/i18n/keys";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCustomMutation, useDelete, useList } from "@refinedev/core";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
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
import { GraduationCap, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type Teacher = Record<string, any>;

export function AdminTeachersScreen() {
  const t = useTranslations();
  const { query, result } = useList({ resource: "teachers" });
  const { mutate: deleteTeacher, mutation: deleteMutation } = useDelete();
  const { mutate: inviteTeacher, mutation: inviteMutation } = useCustomMutation();

  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const inviteSchema = z.object({
    email: z.string().email({ message: t("adminHome.teachers_invalidEmail") }),
    name: z.string().optional(),
  });
  type InviteValues = z.infer<typeof inviteSchema>;

  const inviteForm = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", name: "" },
  });

  const teachers = (result?.data ?? []) as Teacher[];

  const handleInvite = (values: { email: string; name?: string }) => {
    inviteTeacher(
      {
        url: "roster/teachers/invite",
        method: "post",
        values: { email: values.email, name: values.name || values.email.split("@")[0], createShell: true },
      },
      {
        onSuccess: () => {
          setIsInviteOpen(false);
          inviteForm.reset();
          toast.success(t("adminHome.teachers_inviteSent"));
          query.refetch();
        },
        onError: (err: any) => toast.error(err?.message || t("adminHome.teachers_inviteFailed")),
      }
    );
  };

  const handleRemove = (id: string) => {
    deleteTeacher(
      { resource: "teachers", id },
      {
        onSuccess: () => {
          toast.success(t("adminHome.teachers_removed"));
          query.refetch();
        },
        onError: (err: any) => toast.error(err?.message || t("adminHome.teachers_removeFailed")),
      },
    );
  };

  const columns: ColumnDef<Teacher>[] = [
    {
      id: "teacher",
      header: t("roles.teacher"),
      cell: ({ row }) => {
        const record = row.original;
        return (
          <div className="flex items-center gap-2">
            <Avatar className="size-8">
              <AvatarFallback className="bg-info/15 text-info">
                {record.name?.charAt(0)?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span>{record.name}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "email",
      header: t("auth.email"),
    },
    {
      id: "subjects",
      header: t("adminHome.teachers_subjects"),
      cell: ({ row }) => (row.original.subjects as string[])?.join(", ") || "—",
    },
    {
      id: "coursesCount",
      header: t("nav.courses"),
      cell: ({ row }) => row.original.coursesCount || 0,
    },
    {
      id: "rating",
      header: t("adminHome.teachers_rating"),
      cell: ({ row }) => {
        const record = row.original;
        return record.rating && record.rating > 0
          ? `${record.rating.toFixed(1)} (${record.reviewsCount || 0})`
          : t("adminHome.teachers_noReviews");
      },
    },
    {
      id: "status",
      header: t("adminHome.teachers_status"),
      cell: ({ row }) => {
        const record = row.original;
        const affiliationStatus = record.affiliation?.status;
        const status = affiliationStatus || record.status || "active";
        const tone: StatusTone =
          status === "active"
            ? "success"
            : status === "pending" || record.status === "shell"
              ? "warning"
              : "neutral";
        const label =
          status === "pending" || record.status === "shell"
            ? t("adminHome.teachers_pendingInvite")
            : t(asKey(`status.${status}`));
        return <StatusBadge tone={tone}>{label}</StatusBadge>;
      },
    },
    {
      id: "actions",
      header: t("adminHome.teachers_actions"),
      cell: ({ row }) => {
        const record = row.original;
        const canRemove =
          record.affiliation?.status === "active" ||
          record.affiliation?.status === "pending" ||
          record.status === "active" ||
          record.status === "shell";
        const canReinvite = record.affiliation?.status === "pending" || record.status === "shell";
        return (
          <div className="flex items-center gap-1">
            {canRemove && (
              <ConfirmDialog
                trigger={
                  <Button
                    variant="link"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="size-4" />
                    {t("actions.remove")}
                  </Button>
                }
                title={`${t("actions.remove")} ${record.name}?`}
                confirmText={t("actions.remove")}
                cancelText={t("actions.cancel")}
                destructive
                onConfirm={() => handleRemove(record.id || record._id)}
              />
            )}
            {canReinvite && (
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  inviteForm.reset({ email: record.email, name: record.name });
                  setIsInviteOpen(true);
                }}
              >
                {t("adminHome.teachers_reinvite")}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.teachers")}
        actions={
          <Button onClick={() => setIsInviteOpen(true)}>
            <Plus className="size-4" />
            {t("adminHome.teachers_inviteTeacher")}
          </Button>
        }
      />

      <CollaborationPanel role="center" />

      <Card>
        <CardContent>
          {query.isLoading ? (
            <PageSpinner />
          ) : (
            <DataTable
              columns={columns}
              data={teachers}
              pageSize={10}
              emptyState={
                <EmptyState icon={GraduationCap} title={t("adminHome.teachers_emptyText")} />
              }
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminHome.teachers_inviteTeacher")}</DialogTitle>
          </DialogHeader>
          <Form {...inviteForm}>
            <form
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
                      <Input placeholder="teacher@example.com" {...field} />
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
                    <FormLabel>{t("adminHome.teachers_nameOptional")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("adminHome.teachers_teacherNamePlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsInviteOpen(false)}
                >
                  {t("actions.cancel")}
                </Button>
                <Button type="submit" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? <Spinner /> : null}
                  {t("actions.sendInvite")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
