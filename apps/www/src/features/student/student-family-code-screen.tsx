"use client";

import { useMemo, useState } from "react";
import {
  useList,
  useCreate,
  useCustom,
  useCustomMutation,
} from "@refinedev/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  RefreshCw,
  Link2,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
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
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@repo/ui/components/form";
import { toast } from "@repo/ui/components/sonner";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { PageHeader } from "@/components/kit/page-header";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";

const STATUS_TONES: Record<string, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  revoked: "neutral",
};

const STATUS_KEYS: Record<string, string> = {
  pending: "status.pending",
  approved: "status.approved",
  rejected: "status.rejected",
  revoked: "studentFamilyCode.revoked",
};

type ParentLink = {
  id?: string;
  _id?: string;
  status?: string;
  initiatedBy?: string;
  createdAt?: string;
  parentId?: { name?: string } | null;
};

export function StudentFamilyCodeScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("code");

  const { query: codeQuery, result: codeResult } = useCustom({
    url: "me/family-code",
    method: "get",
  });
  const { mutate: rotateCode, mutation: rotateMutation } = useCustomMutation();
  const { query: linksQuery, result: linksResult } = useList({
    resource: "parent-links",
  });
  const { mutate: createLink, mutation: createMutation } = useCreate();
  const { mutate: approveMut, mutation: approveMutation } = useCustomMutation();
  const { mutate: rejectMut, mutation: rejectMutation } = useCustomMutation();

  const code = (codeResult?.data as any)?.code ?? "—";
  const links = (linksResult?.data ?? []) as ParentLink[];

  const schema = useMemo(
    () =>
      z.object({
        email: z
          .string()
          .email(t("studentFamilyCode.invalidEmail"))
          .or(z.literal("")),
      }),
    [t],
  );

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleRotate = () => {
    rotateCode(
      { url: "me/family-code/rotate", method: "post", values: {} },
      {
        onSuccess: () => {
          toast.success(t("studentFamilyCode.codeRotated"));
          codeQuery.refetch();
        },
        onError: (err: any) =>
          toast.error(err?.message || t("studentFamilyCode.codeRotateFailed")),
      },
    );
  };

  const handleInitiate = (values: { email?: string; phone?: string }) => {
    const payload = values.email
      ? { email: values.email }
      : { phone: values.phone };
    createLink(
      { resource: "parent-links", values: payload },
      {
        onSuccess: () => {
          toast.success(t("studentFamilyCode.linkRequestSent"));
          form.reset({ email: "" });
          linksQuery.refetch();
        },
        onError: (err: any) =>
          toast.error(err?.message || t("studentFamilyCode.linkRequestFailed")),
      },
    );
  };

  const handleApprove = (id: string) => {
    approveMut(
      { url: `parent-links/${id}/approve`, method: "post", values: {} },
      {
        onSuccess: () => {
          toast.success(t("studentFamilyCode.linkApproved"));
          linksQuery.refetch();
        },
        onError: (err: any) =>
          toast.error(err?.message || t("studentFamilyCode.linkApproveFailed")),
      },
    );
  };

  const handleReject = (id: string) => {
    rejectMut(
      { url: `parent-links/${id}/reject`, method: "post", values: {} },
      {
        onSuccess: () => {
          toast.success(t("studentFamilyCode.linkRejected"));
          linksQuery.refetch();
        },
        onError: (err: any) =>
          toast.error(err?.message || t("studentFamilyCode.linkRejectFailed")),
      },
    );
  };

  const columns: ColumnDef<ParentLink>[] = [
    {
      id: "parent",
      header: t("roles.parent"),
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <User className="size-4 text-muted-foreground" />
          <span>
            {row.original.parentId?.name || t("studentFamilyCode.unknown")}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: t("studentFamilyCode.status"),
      enableSorting: false,
      cell: ({ row }) => {
        const v = row.original.status;
        return (
          <StatusBadge tone={(v && STATUS_TONES[v]) || "neutral"}>
            {v ? t(asKey(STATUS_KEYS[v] || v)) : "—"}
          </StatusBadge>
        );
      },
    },
    {
      accessorKey: "initiatedBy",
      header: t("studentFamilyCode.initiatedBy"),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.initiatedBy === "parent"
          ? t("roles.parent")
          : t("studentFamilyCode.you"),
    },
    {
      accessorKey: "createdAt",
      header: t("studentFamilyCode.date"),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.createdAt ? formatDate(row.original.createdAt) : "—",
    },
    {
      id: "actions",
      header: t("studentFamilyCode.actions"),
      enableSorting: false,
      cell: ({ row }) => {
        const record = row.original;
        const id = record.id || record._id || "";
        if (record.status === "pending" && record.initiatedBy === "parent") {
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
        return <span className="text-muted-foreground">—</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.family")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("nav.family")}</CardTitle>
        </CardHeader>
        <CardContent>
          {codeQuery.isLoading ? (
            <PageSpinner />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="font-mono text-2xl tracking-widest text-foreground">
                  {code}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleCopy}
                  aria-label={t("studentFamilyCode.shareCodeHint")}
                >
                  {copied ? (
                    <Check className="size-4 text-success" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("studentFamilyCode.shareCodeHint")}
              </p>
              <div>
                <Button
                  variant="outline"
                  onClick={handleRotate}
                  disabled={rotateMutation.isPending}
                >
                  {rotateMutation.isPending ? (
                    <Spinner />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {t("studentFamilyCode.rotateCode")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("studentFamilyCode.linkParent")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleInitiate)}
              autoComplete="off"
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("studentFamilyCode.parentEmailOrPhone")}{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <FormControl>
                          <Input placeholder="parent@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </div>
                      <Button type="submit" disabled={createMutation.isPending}>
                        {createMutation.isPending ? (
                          <Spinner />
                        ) : (
                          <Link2 className="size-4" />
                        )}
                        {t("studentFamilyCode.sendRequest")}
                      </Button>
                    </div>
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("studentFamilyCode.linkRequests")}</CardTitle>
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
                  title={t("studentFamilyCode.noLinkRequests")}
                />
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
