/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { CollaborationPanel } from "@/features/collaboration/collaboration-panel";
import { asKey } from "@/lib/i18n/keys";
import { track } from "@/lib/track";
import { ANALYTICS_EVENTS } from "@repo/observability";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCustomMutation, useDelete, useList } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
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
import {
  Badge,
  DataTable,
  EmptyState,
  Num,
  PageHead,
  RowIdentity,
  type BadgeTone,
  type Column,
} from "./ledger";

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

  const columns: Column<Teacher>[] = [
    {
      id: "teacher",
      header: t("roles.teacher"),
      // Row identity: initials tile + name + the email as a mono ltr second line.
      cell: (r) => <RowIdentity name={r.name ?? "—"} meta={r.email} />,
    },
    {
      id: "subjects",
      header: t("adminHome.teachers_subjects"),
      cell: (r) => (
        <span className="text-[13px] text-[var(--ink-2)]">
          {(r.subjects as string[])?.join(", ") || "—"}
        </span>
      ),
    },
    {
      id: "coursesCount",
      header: t("nav.courses"),
      numeric: true,
      cell: (r) => <Num className="text-[13px] text-[var(--ink)]">{r.coursesCount || 0}</Num>,
    },
    {
      id: "rating",
      header: t("adminHome.teachers_rating"),
      numeric: true,
      cell: (r) =>
        r.rating && r.rating > 0 ? (
          <Num className="text-[13px] text-[var(--ink)]">
            {r.rating.toFixed(1)} ({r.reviewsCount || 0})
          </Num>
        ) : (
          <span className="text-xs text-[var(--ink-3)]">{t("adminHome.teachers_noReviews")}</span>
        ),
    },
    {
      id: "status",
      header: t("adminHome.teachers_status"),
      cell: (r) => {
        // An OFF-SYSTEM teacher is not "pending an invite" — nobody is waiting
        // for them to accept anything. Reading their shell account as a stalled
        // invite is exactly the confusion this badge exists to prevent, so it
        // is checked first and wins.
        if (r.systemStatus === "external") {
          return <Badge tone="neutral">{t("externalTeachers.badge")}</Badge>;
        }
        const affiliationStatus = r.affiliation?.status;
        const status = affiliationStatus || r.status || "active";
        const pending = status === "pending" || r.status === "shell";
        const tone: BadgeTone = status === "active" ? "done" : pending ? "pending" : "neutral";
        const label = pending
          ? t("adminHome.teachers_pendingInvite")
          : t(asKey(`status.${status}`));
        return <Badge tone={tone}>{label}</Badge>;
      },
    },
    {
      id: "actions",
      header: t("adminHome.teachers_actions"),
      // Header text is kept for assistive tech even though the column reads as
      // a bare action strip — a column with no accessible name is a defect.
      srOnly: true,
      numeric: true,
      cell: (r) => {
        const canRemove =
          r.affiliation?.status === "active" ||
          r.affiliation?.status === "pending" ||
          r.status === "active" ||
          r.status === "shell";
        const canReinvite = r.affiliation?.status === "pending" || r.status === "shell";
        return (
          <div className="flex items-center justify-end gap-1">
            {canReinvite && (
              <Button
                variant="ghost"
                size="sm"
                className="text-[var(--indigo)]"
                onClick={() => {
                  inviteForm.reset({ email: r.email, name: r.name });
                  setIsInviteOpen(true);
                }}
              >
                {t("adminHome.teachers_reinvite")}
              </Button>
            )}
            {canRemove && (
              // Removal is destructive, so it is never a filled twin of a safe
              // action — a bordered, text-weight control that still confirms.
              <ConfirmDialog
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[var(--red)]"
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="size-4" />
                    {t("actions.remove")}
                  </Button>
                }
                title={`${t("actions.remove")} ${r.name}?`}
                confirmText={t("actions.remove")}
                cancelText={t("actions.cancel")}
                destructive
                onConfirm={() => handleRemove(r.id || r._id)}
              />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={t("nav.teachers")}
        actions={
          <Button onClick={() => setIsInviteOpen(true)}>
            <Plus className="size-4" />
            {t("adminHome.teachers_inviteTeacher")}
          </Button>
        }
      />

      <CollaborationPanel role="center" />

      {query.isLoading ? (
        <PageSpinner />
      ) : (
        <DataTable
          columns={columns}
          rows={teachers}
          rowKey={(r) => String(r.id ?? r._id)}
          caption={t("nav.teachers")}
          empty={
            /* An empty list with no way out reads as a broken screen. The
               action here is the same one the toolbar offers, so a first-time
               owner never has to go looking for it. */
            <EmptyState
              icon={<GraduationCap className="size-6" />}
              title={t("activation.empty.teachers.title")}
              hint={t("activation.empty.teachers.body")}
              action={
                <Button
                  onClick={() => {
                    track(ANALYTICS_EVENTS.EMPTY_STATE_CTA_CLICKED, { list: "teachers" });
                    setIsInviteOpen(true);
                  }}
                >
                  {t("activation.empty.teachers.cta")}
                </Button>
              }
            />
          }
        />
      )}

      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminHome.teachers_inviteTeacher")}</DialogTitle>
          </DialogHeader>
          <Form {...inviteForm}>
            <form onSubmit={inviteForm.handleSubmit(handleInvite)} className="flex flex-col gap-4">
              <FormField
                control={inviteForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.email")}</FormLabel>
                    <FormControl>
                      <Input dir="ltr" className="num" placeholder="teacher@example.com" {...field} />
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
                      <Input placeholder={t("adminHome.teachers_teacherNamePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsInviteOpen(false)}>
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
