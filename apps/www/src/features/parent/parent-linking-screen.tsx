"use client";

// Children / linking.
//
// This is the ONE parent screen with real write authority, and it is worth
// being precise about why: `parent-links/:id/approve|reject` and the DELETE are
// all `requireRole("parent")`. So the affordances here are honest — a parent
// really can approve a link request and really can revoke one.
//
// Approve and Reject are NOT equal-weight twins. The audit called that out on
// the registrations queue (ten rows, twenty saturated buttons); the same
// mistake on a parent's screen is worse, because rejecting a link is the
// destructive branch and it should never be the easy mis-click. Approve
// carries the weight; Reject is quiet text. Revoke keeps the two-step commit.
import { useMemo, useState } from "react";
import {
  useList,
  useCreate,
  useDelete,
  useCustomMutation,
} from "@refinedev/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link2, User } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
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
import { EmptyState } from "@/components/kit/empty-state";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { PageHeader } from "@/components/kit/page-header";
import { Spinner } from "@/components/kit/spinner";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { Figure, SectionHead, SkeletonRows } from "./ledger-kit";

/** Colour is meaning: amber waits, teal is confirmed, red is final. */
const STATUS_CHIP: Record<string, string> = {
  pending: "bg-amber-soft text-amber",
  approved: "bg-teal-soft text-teal",
  rejected: "bg-red-soft text-red",
  revoked: "bg-rule-2 text-ink-2",
};

type ParentLink = {
  id?: string;
  _id?: string;
  status?: string;
  initiatedBy?: string;
  createdAt?: string;
  studentId?: { id?: string; name?: string } | null;
};

export function ParentLinkingScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [activeTab, setActiveTab] = useState("code");

  const { query: linksQuery, result: linksResult } = useList({
    resource: "parent-links",
  });
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
        email: z.string().email(t("parentLinking.invalidEmail")).or(z.literal("")),
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
        onError: (err: any) =>
          toast.error(err?.message || t("parentLinking.failedLink")),
      },
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
        onError: (err: any) =>
          toast.error(err?.message || t("parentLinking.failedSendRequest")),
      },
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
        onError: (err: any) =>
          toast.error(err?.message || t("parentLinking.failedApprove")),
      },
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
        onError: (err: any) =>
          toast.error(err?.message || t("parentLinking.failedReject")),
      },
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
        onError: (err: any) =>
          toast.error(err?.message || t("parentLinking.failedRevoke")),
      },
    );
  };

  const columns: ColumnDef<ParentLink>[] = [
    {
      id: "student",
      header: t("parentLinking.student"),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-[13px] font-medium text-ink">
          {row.original.studentId?.name || t("parentLinking.unknown")}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: t("parentLinking.status"),
      enableSorting: false,
      cell: ({ row }) => {
        const v = row.original.status;
        return (
          <span
            className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
              (v && STATUS_CHIP[v]) || "bg-rule-2 text-ink-2"
            }`}
          >
            {v === "revoked"
              ? t("parentLinking.revoked")
              : v
                ? t(asKey(`status.${v}`))
                : "—"}
          </span>
        );
      },
    },
    {
      accessorKey: "initiatedBy",
      header: t("parentLinking.initiatedBy"),
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-[13px] text-ink-2">
          {row.original.initiatedBy === "parent"
            ? t("parentLinking.you")
            : t("roles.student")}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: t("parentLinking.date"),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.createdAt ? (
          <Figure className="text-[12px] text-ink-2">
            {formatDate(row.original.createdAt)}
          </Figure>
        ) : (
          <span className="text-ink-3">—</span>
        ),
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
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => handleApprove(id)}
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending ? <Spinner /> : null}
                {t("actions.approve")}
              </Button>
              {/* Deliberately quiet: the destructive branch is not a twin of
                  the safe one. */}
              <button
                type="button"
                onClick={() => handleReject(id)}
                disabled={rejectMutation.isPending}
                className="text-[12px] text-ink-2 underline underline-offset-4 hover:text-ink disabled:opacity-50"
              >
                {t("actions.reject")}
              </button>
            </div>
          );
        }

        if (record.status === "approved") {
          return (
            <div className="flex items-center gap-3">
              {record.studentId?.id ? (
                <Link
                  href={`/dashboard/parent/children/${record.studentId.id}/id`}
                  className="text-[12px] text-ink-2 underline underline-offset-4 hover:text-ink"
                >
                  {t("studentIdCard.title")}
                </Link>
              ) : null}
            <ConfirmDialog
              trigger={
                <button
                  type="button"
                  className="text-[12px] text-ink-2 underline underline-offset-4 hover:text-red"
                >
                  {t("parentLinking.revoke")}
                </button>
              }
              title={t("parentLinking.revokeConfirmTitle")}
              description={t("parentLinking.revokeConfirmDesc")}
              confirmText={t("parentLinking.revoke")}
              cancelText={t("actions.cancel")}
              destructive
              onConfirm={() => handleRevoke(id)}
            />
            </div>
          );
        }

        return <span className="text-ink-3">—</span>;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={t("roles.parent")} title={t("nav.children")} />

      <section className="flex flex-col gap-3">
        <SectionHead
          eyebrow={t("parentLinking.linkEyebrow")}
          title={t("parentLinking.linkChild")}
        />
        <div className="rounded-xl border border-rule bg-sheet p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="code">
                {t("parentLinking.byFamilyCode")}
              </TabsTrigger>
              <TabsTrigger value="lookup">
                {t("parentLinking.byEmailOrPhone")}
              </TabsTrigger>
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
                        <FormLabel>
                          {t("parentLinking.familyCodeLabel")}
                        </FormLabel>
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <FormControl>
                              {/* A code is a figure: mono, wide-tracked, LTR
                                  even in Arabic. */}
                              <Input
                                dir="ltr"
                                placeholder={t("parentLinking.enterCode")}
                                className="num text-center text-lg tracking-[0.3em] uppercase"
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
                          {t("parentLinking.studentEmailOrPhone")}
                        </FormLabel>
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <FormControl>
                              <Input
                                dir="ltr"
                                placeholder="student@example.com"
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
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHead
          eyebrow={t("parentLinking.childrenEyebrow")}
          title={t("parentLinking.myChildren")}
        />
        {linksQuery.isLoading ? (
          <SkeletonRows rows={3} />
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
      </section>
    </div>
  );
}
