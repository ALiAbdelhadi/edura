"use client";

import { useMemo, useState } from "react";
import { useList, useCreate, useDelete, useCustomMutation } from "@refinedev/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Link2,
  CheckCircle2,
  XCircle,
  Trash2,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@repo/ui/components/tabs";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@repo/ui/components/form";
import { toast } from "@repo/ui/components/sonner";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";

const STATUS_TONES: Record<string, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  revoked: "neutral",
};

type ParentLink = {
  id?: string;
  _id?: string;
  status?: string;
  initiatedBy?: string;
  createdAt?: string;
  studentId?: { name?: string } | null;
};

export function ParentLinkingScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [activeTab, setActiveTab] = useState("code");

  const { query: linksQuery, result: linksResult } = useList({ resource: "parent-links" });
  const { mutate: createLink, mutation: createMutation } = useCreate();
  const { mutate: approveMut, mutation: approveMutation } = useCustomMutation();
  const { mutate: rejectMut, mutation: rejectMutation } = useCustomMutation();
  const { mutate: revokeLink } = useDelete();

  const links = (linksResult?.data ?? []) as ParentLink[];

  const codeSchema = useMemo(
    () => z.object({ code: z.string().min(1, t("parentLinking.enterFamilyCode")) }),
    [t],
  );
  const lookupSchema = useMemo(
    () =>
      z.object({
        email: z
          .string()
          .email(t("parentLinking.invalidEmail"))
          .or(z.literal("")),
      }),
    [t],
  );

  const codeForm = useForm<z.infer<typeof codeSchema>>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });
  const lookupForm = useForm<z.infer<typeof lookupSchema>>({
    resolver: zodResolver(lookupSchema),
    defaultValues: { email: "" },
  });

  const handleLinkByCode = (values: { code: string }) => {
    createLink(
      { resource: "parent-links", values: { code: values.code } },
      {
        onSuccess: () => {
          toast.success(t("parentLinking.linkedSuccess"));
          codeForm.reset({ code: "" });
          linksQuery.refetch();
        },
        onError: (err: any) => toast.error(err?.message || t("parentLinking.failedLink")),
      }
    );
  };

  const handleLinkByLookup = (values: { email?: string; phone?: string }) => {
    const payload = values.email ? { email: values.email } : { phone: values.phone };
    createLink(
      { resource: "parent-links", values: payload },
      {
        onSuccess: () => {
          toast.success(t("parentLinking.linkRequestSent"));
          lookupForm.reset({ email: "" });
          linksQuery.refetch();
        },
        onError: (err: any) => toast.error(err?.message || t("parentLinking.failedSendRequest")),
      }
    );
  };

  const handleApprove = (id: string) => {
    approveMut(
      { url: `parent-links/${id}/approve`, method: "post", values: {} },
      {
        onSuccess: () => {
          toast.success(t("parentLinking.linkApproved"));
          linksQuery.refetch();
        },
        onError: (err: any) => toast.error(err?.message || t("parentLinking.failedApprove")),
      }
    );
  };

  const handleReject = (id: string) => {
    rejectMut(
      { url: `parent-links/${id}/reject`, method: "post", values: {} },
      {
        onSuccess: () => {
          toast.success(t("parentLinking.linkRejected"));
          linksQuery.refetch();
        },
        onError: (err: any) => toast.error(err?.message || t("parentLinking.failedReject")),
      }
    );
  };

  const handleRevoke = (id: string) => {
    revokeLink(
      { resource: "parent-links", id },
      {
        onSuccess: () => {
          toast.success(t("parentLinking.linkRevoked"));
          linksQuery.refetch();
        },
        onError: (err: any) => toast.error(err?.message || t("parentLinking.failedRevoke")),
      }
    );
  };

  const columns: ColumnDef<ParentLink>[] = [
    {
      id: "student",
      header: t("parentLinking.student"),
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <User className="size-4 text-muted-foreground" />
          <span>{row.original.studentId?.name || t("parentLinking.unknown")}</span>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: t("parentLinking.status"),
      enableSorting: false,
      cell: ({ row }) => {
        const v = row.original.status;
        return (
          <StatusBadge tone={(v && STATUS_TONES[v]) || "neutral"}>
            {v === "revoked" ? t("parentLinking.revoked") : v ? t(asKey(`status.${v}`)) : "—"}
          </StatusBadge>
        );
      },
    },
    {
      accessorKey: "initiatedBy",
      header: t("parentLinking.initiatedBy"),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.initiatedBy === "parent"
          ? t("parentLinking.you")
          : t("roles.student"),
    },
    {
      accessorKey: "createdAt",
      header: t("parentLinking.date"),
      enableSorting: false,
      cell: ({ row }) => (row.original.createdAt ? formatDate(row.original.createdAt) : "—"),
    },
    {
      id: "actions",
      header: t("parentLinking.actionsColumn"),
      enableSorting: false,
      cell: ({ row }) => {
        const record = row.original;
        const id = record.id || record._id || "";
        if (record.status === "pending" && record.initiatedBy === "student") {
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleApprove(id)}
                disabled={approveMutation.isPending}
                className="text-success hover:text-success"
              >
                {approveMutation.isPending ? (
                  <Spinner />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {t("actions.approve")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleReject(id)}
                disabled={rejectMutation.isPending}
                className="text-destructive hover:text-destructive"
              >
                {rejectMutation.isPending ? (
                  <Spinner />
                ) : (
                  <XCircle className="size-4" />
                )}
                {t("actions.reject")}
              </Button>
            </div>
          );
        }
        if (record.status === "approved") {
          return (
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                  {t("parentLinking.revoke")}
                </Button>
              }
              title={t("parentLinking.revokeConfirmTitle")}
              description={t("parentLinking.revokeConfirmDesc")}
              confirmText={t("parentLinking.revoke")}
              cancelText={t("actions.cancel")}
              destructive
              onConfirm={() => handleRevoke(id)}
            />
          );
        }
        return <span className="text-muted-foreground">—</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("roles.parent")} title={t("nav.family")} />

      <Card className="border-primary/15">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo text-indigo-ink">
              <Link2 className="size-5" />
            </div>
            <CardTitle>{t("parentLinking.linkChild")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="code">{t("parentLinking.byFamilyCode")}</TabsTrigger>
              <TabsTrigger value="lookup">{t("parentLinking.byEmailOrPhone")}</TabsTrigger>
            </TabsList>

            <TabsContent value="code" className="pt-4">
              <Form {...codeForm}>
                <form
                  onSubmit={codeForm.handleSubmit(handleLinkByCode)}
                  autoComplete="off"
                >
                  <FormField
                    control={codeForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("nav.family")}</FormLabel>
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <FormControl>
                              <Input
                                placeholder={t("parentLinking.enterCode")}
                                className="text-center font-mono text-lg tracking-[0.3em] uppercase"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </div>
                          <Button type="submit" disabled={createMutation.isPending}>
                            {createMutation.isPending ? (
                              <Spinner />
                            ) : (
                              <Link2 className="size-4" />
                            )}
                            {t("parentLinking.linkInstantly")}
                          </Button>
                        </div>
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="lookup" className="pt-4">
              <Form {...lookupForm}>
                <form
                  onSubmit={lookupForm.handleSubmit(handleLinkByLookup)}
                  autoComplete="off"
                >
                  <FormField
                    control={lookupForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t("parentLinking.studentEmailOrPhone")}{" "}
                          <span className="text-destructive">*</span>
                        </FormLabel>
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <FormControl>
                              <Input placeholder="student@example.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </div>
                          <Button type="submit" disabled={createMutation.isPending}>
                            {createMutation.isPending ? (
                              <Spinner />
                            ) : (
                              <Link2 className="size-4" />
                            )}
                            {t("parentLinking.sendRequest")}
                          </Button>
                        </div>
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <User className="size-5" />
            </div>
            <CardTitle>{t("parentLinking.myChildren")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {linksQuery.isLoading ? (
            <PageSpinner />
          ) : (
            <DataTable
              columns={columns}
              data={links}
              pageSize={10}
              emptyState={
                <EmptyState
                  icon={User}
                  title={t("parentLinking.noLinkedChildren")}
                />
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
