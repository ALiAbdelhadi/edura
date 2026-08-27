/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { DescriptionList } from "@/components/kit/description-list";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import CopyableText from "@/components/ui/copyable-text";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";
import {
  Amount,
  Badge,
  BlacklistCascadePanel,
  Eyebrow,
  Num,
  PageHead,
  Sheet,
} from "./ledger";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCustom, useCustomMutation, useList } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
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
import { Textarea } from "@repo/ui/components/textarea";
import { cn } from "@repo/ui/lib/utils";
import {
  ArrowLeft,
  Ban,
  BookOpen,
  CheckCircle2,
  Pencil,
  User,
  UserX,
  Wallet,
} from "lucide-react";
import { ReceiptLink } from "@/features/receipts/receipt-link";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type StudentUser = {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
};

type StudentRosterRecord = {
  _id?: string;
  id?: string;
  studentId?: string;
  user?: StudentUser | null;
  blacklisted?: boolean;
  blacklistReason?: string;
  addedAt?: string;
  leftAt?: string | null;
  operationalParentName?: string;
  operationalParentPhone?: string;
};

export function AdminStudentDetailScreen() {
  const t = useTranslations();
  const { formatEGP, formatDate, locale } = useFormatters();
  const params = useParams<{ studentId?: string | string[] }>();
  const router = useRouter();
  const rawStudentId = Array.isArray(params.studentId) ? params.studentId[0] : params.studentId;
  const studentId = rawStudentId ? decodeURIComponent(rawStudentId) : "";

  const fmtDate = (value?: string | Date | null) => {
    if (!value) return t("adminHome.detail_notAvailable");
    try {
      return formatDate(value, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return t("adminHome.detail_notAvailable");
    }
  };

  const translateStatus = (s?: string) => {
    if (!s) return "";
    const key = asKey(`status.${s}`);
    return t.has(key) ? t(key) : s.charAt(0).toUpperCase() + s.slice(1);
  };

  const { query: studentQuery, result: studentResult } = useCustom<StudentRosterRecord>({
    url: studentId ? `roster/students/${studentId}` : "",
    method: "get",
    queryOptions: { enabled: !!studentId },
  });

  const { mutateAsync: patchStudent } = useCustomMutation();
  const [blacklistModalOpen, setBlacklistModalOpen] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletAmount, setWalletAmount] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const editSchema = z.object({
    name: z.string().min(1, t("adminHome.detail_nameRequired")),
    email: z
      .string()
      .min(1, t("adminHome.detail_emailRequired"))
      .email(t("adminHome.detail_invalidEmail")),
    phone: z.string().optional(),
  });
  const editForm = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: "", email: "", phone: "" },
  });

  const refetch = studentQuery.refetch;

  const { query: enrollmentsQuery, result: enrollmentsResult } = useList({
    resource: "enrollments",
    filters: studentId ? [{ field: "studentId", operator: "eq" as const, value: studentId }] : undefined,
    pagination: { mode: "off" },
    queryOptions: { enabled: !!studentId },
  });

  const { query: paymentsQuery, result: paymentsResult } = useList({
    resource: "payments",
    filters: studentId ? [{ field: "studentId", operator: "eq" as const, value: studentId }] : undefined,
    pagination: { mode: "off" },
    queryOptions: { enabled: !!studentId },
  });

  const record = studentResult?.data as StudentRosterRecord | undefined;
  const user = record?.user ?? null;
  const userId = String(user?._id || user?.id || record?.studentId || studentId || "");
  const studentName = user?.name || t("adminHome.detail_unnamedStudent");
  const enrollments = (enrollmentsResult?.data ?? []) as any[];
  const payments = (paymentsResult?.data ?? []) as any[];
  const activeEnrollments = enrollments.filter((e) => (e.status || "active") === "active").length;
  const paidTotal = payments.reduce((sum, p) => sum + (p.amount > 0 ? p.amount : 0), 0);

  const profileRows = [
    {
      key: userId || "student",
      userId,
      name: studentName,
      email: user?.email,
      phone: user?.phone,
      status: record?.blacklisted ? "blacklisted" : user?.status || "active",
      addedAt: record?.addedAt,
    },
  ];

  const profileColumns: ColumnDef<(typeof profileRows)[number]>[] = [
    {
      id: "userId",
      header: t("adminHome.detail_colUserId"),
      cell: ({ row }) => <CopyableText value={row.original.userId} label="User ID" />,
    },
    {
      id: "name",
      header: t("adminHome.detail_colStudent"),
      cell: ({ row }) => <span className="font-semibold">{row.original.name}</span>,
    },
    {
      id: "email",
      header: t("auth.email"),
      cell: ({ row }) => <CopyableText value={row.original.email} label="Email" monospace={false} />,
    },
    {
      id: "phone",
      header: t("adminHome.detail_phone"),
      cell: ({ row }) => <CopyableText value={row.original.phone} label="Phone" monospace={false} />,
    },
    {
      id: "status",
      header: t("adminHome.detail_status"),
      cell: ({ row }) => {
        const value = row.original.status;
        return (
          <Badge
            tone={value === "blacklisted" ? "failed" : value === "active" ? "done" : "neutral"}
          >
            {translateStatus(value)}
          </Badge>
        );
      },
    },
    {
      id: "addedAt",
      header: t("adminHome.detail_colJoined"),
      cell: ({ row }) => fmtDate(row.original.addedAt),
    },
  ];

  const enrollmentColumns: ColumnDef<any>[] = [
    {
      id: "class",
      header: t("adminHome.detail_colClass"),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-semibold">
            {row.original.courseName || t("adminHome.detail_untitledClass")}
          </span>
          <span className="text-xs text-muted-foreground">
            {row.original.subject || row.original.courseId}
          </span>
        </div>
      ),
    },
    {
      id: "id",
      header: t("adminHome.detail_enrollmentId"),
      cell: ({ row }) => (
        <CopyableText value={row.original.id || row.original._id} label="Enrollment ID" />
      ),
    },
    {
      id: "status",
      header: t("adminHome.detail_status"),
      cell: ({ row }) => {
        const status = row.original.status || "active";
        return (
          <Badge tone={status === "active" ? "done" : "neutral"}>
            {translateStatus(status)}
          </Badge>
        );
      },
    },
    {
      id: "enrolledAt",
      header: t("adminHome.detail_enrolled"),
      cell: ({ row }) => fmtDate(row.original.enrolledAt || row.original.createdAt),
    },
  ];

  const paymentColumns: ColumnDef<any>[] = [
    {
      id: "receipt",
      header: t("adminHome.detail_receiptNumber"),
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-0.5">
          <CopyableText value={row.original.receiptNumber} label="Receipt number" />
          {row.original.id ? <ReceiptLink paymentId={row.original.id} /> : null}
        </div>
      ),
    },
    {
      id: "courseName",
      header: t("adminHome.detail_colCourse"),
      cell: ({ row }) => row.original.courseName || t("adminHome.detail_notAvailable"),
    },
    {
      id: "amount",
      header: t("adminHome.detail_amount"),
      cell: ({ row }) => {
        const amount = row.original.amount ?? 0;
        return (
          <Amount
            piasters={amount}
            locale={locale}
            className={cn(
              "text-[13px] font-semibold",
              amount < 0 ? "text-destructive" : "text-[var(--teal)]",
            )}
          />
        );
      },
    },
    {
      id: "paidAt",
      header: t("adminHome.detail_paidColumn"),
      cell: ({ row }) => fmtDate(row.original.paidAt),
    },
  ];

  if (studentQuery.isLoading && !record) {
    return <PageSpinner label={t("adminHome.detail_loadingStudent")} />;
  }

  if (studentQuery.error || !record) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={UserX}
          title={t("adminHome.detail_notFound")}
          action={
            <Button variant="outline" onClick={() => router.push("/dashboard/admin/students")}>
              <ArrowLeft className="size-4 rtl:-scale-x-100" />
              {t("adminHome.detail_backToStudents")}
            </Button>
          }
        />
      </div>
    );
  }

  const isBlacklisted = !!record.blacklisted;

  const detailItems: { label: React.ReactNode; value: React.ReactNode }[] = [
    {
      label: t("auth.email"),
      value: <CopyableText value={user?.email} label="Email" monospace={false} />,
    },
    {
      label: t("adminHome.detail_phone"),
      value: <CopyableText value={user?.phone} label="Phone" monospace={false} />,
    },
    {
      label: t("adminHome.detail_rosterId"),
      value: <CopyableText value={record._id || record.id} label="Roster ID" />,
    },
    { label: t("adminHome.detail_added"), value: fmtDate(record.addedAt) },
    {
      label: t("adminHome.detail_operationalParent"),
      value: record.operationalParentName || t("adminHome.detail_notAvailable"),
    },
    {
      label: t("adminHome.detail_operationalParentPhone"),
      value: (
        <CopyableText
          value={record.operationalParentPhone}
          label="Operational parent phone"
          monospace={false}
        />
      ),
    },
  ];
  if (record.blacklisted) {
    detailItems.push({
      label: t("adminHome.detail_blacklistReason"),
      value: record.blacklistReason || t("adminHome.detail_noReason"),
    });
  }

  const handleBlacklistToggle = async (reason?: string) => {
    setActionLoading(true);
    try {
      await patchStudent({
        url: `roster/students/${studentId}`,
        method: "patch",
        values: {
          blacklisted: !isBlacklisted,
          blacklistReason: !isBlacklisted ? (reason ?? blacklistReason) : undefined,
        },
      });
      toast.success(isBlacklisted ? t("adminHome.detail_unblacklistSuccess") : t("adminHome.detail_blacklistSuccess"));
      setBlacklistModalOpen(false);
      setBlacklistReason("");
      refetch();
    } catch (err: any) {
      toast.error(err?.message || t("adminHome.detail_actionFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const openEditModal = () => {
    editForm.reset({
      name: user?.name || "",
      email: user?.email || "",
      phone: user?.phone || "",
    });
    setEditModalOpen(true);
  };

  const handleWalletTopup = async () => {
    const egp = Number(walletAmount);
    if (!Number.isFinite(egp) || egp <= 0) {
      toast.error(t("adminHome.detail_walletInvalid"));
      return;
    }
    setActionLoading(true);
    try {
      await patchStudent({
        url: "center/wallet-topup",
        method: "post",
        values: { studentId: userId, amount: Math.round(egp * 100) },
      });
      toast.success(t("adminHome.detail_walletTopupDone"));
      setWalletModalOpen(false);
      setWalletAmount("");
      refetch();
    } catch (err: any) {
      toast.error(err?.message || t("adminHome.detail_actionFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditSave = async (values: z.infer<typeof editSchema>) => {
    setActionLoading(true);
    try {
      await patchStudent({
        url: `roster/students/${studentId}`,
        method: "patch",
        values: {
          name: values.name.trim(),
          email: values.email.trim().toLowerCase(),
          phone: values.phone?.trim() || "",
        },
      });
      toast.success(t("adminHome.detail_updateSuccess"));
      setEditModalOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err?.message || t("adminHome.detail_updateFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ms-2 w-fit text-muted-foreground hover:text-foreground"
        onClick={() => router.push("/dashboard/admin/students")}
      >
        <ArrowLeft className="size-4 rtl:-scale-x-100" />
        {t("adminHome.detail_backToStudents")}
      </Button>

      <PageHead
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <User className="size-5 text-[var(--ink-3)]" />
            <span>{studentName}</span>
            {isBlacklisted && <Badge tone="failed">{t("status.blacklisted")}</Badge>}
          </span>
        }
        actions={
          <>
            <Button variant="outline" className="border-[var(--rule)]" onClick={() => setWalletModalOpen(true)}>
              <Wallet className="size-4" />
              {t("adminHome.detail_walletTopup")}
            </Button>
            <Button variant="outline" className="border-[var(--rule)]" onClick={openEditModal}>
              <Pencil className="size-4" />
              {t("actions.edit")}
            </Button>
            <Button
              variant="outline"
              className={isBlacklisted ? "border-[var(--teal)] text-[var(--teal)]" : "border-destructive text-destructive"}
              disabled={actionLoading}
              onClick={() => {
                if (isBlacklisted) {
                  void handleBlacklistToggle();
                } else {
                  setBlacklistModalOpen(true);
                }
              }}
            >
              {isBlacklisted ? <CheckCircle2 className="size-4" /> : <Ban className="size-4" />}
              {isBlacklisted ? t("adminHome.detail_unblacklist") : t("actions.blacklist")}
            </Button>
          </>
        }
      />

      <Sheet>
        <div className="flex flex-wrap items-start gap-6 border-b border-[var(--rule)] p-[18px]">
          <div className="min-w-[160px]">
            <Eyebrow>{t("adminHome.students_colCode")}</Eyebrow>
            <div className="mt-1.5">
              {(record as any)?.studentCode ? (
                <CopyableText
                  value={(record as any).studentCode}
                  label={t("adminHome.students_colCode")}
                />
              ) : (
                <CopyableText value={userId} label="User ID" />
              )}
            </div>
          </div>
          <div aria-hidden className="hidden h-[46px] w-px bg-[var(--rule)] sm:block" />
          <div className="min-w-[140px]">
            <Eyebrow>{t("adminHome.detail_activeClasses")}</Eyebrow>
            <p className="mt-1.5 mb-0">
              <Num className="text-[27px] font-semibold leading-none text-[var(--ink)]">
                {activeEnrollments}
              </Num>
            </p>
          </div>
          <div aria-hidden className="hidden h-[46px] w-px bg-[var(--rule)] sm:block" />
          <div className="min-w-[140px]">
            <Eyebrow>{t("adminHome.detail_paidTotal")}</Eyebrow>
            <p className="mt-1.5 mb-0">
              <Amount
                piasters={paidTotal}
                locale={locale}
                className="text-[27px] font-semibold leading-none tracking-[-0.01em] text-[var(--money)]"
              />
            </p>
          </div>
        </div>
        <div className="p-[18px]">
          <DescriptionList columns={2} items={detailItems} />
        </div>
      </Sheet>

      <Card>
        <CardHeader>
          <CardTitle>{t("adminHome.detail_studentRecord")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={profileColumns} data={profileRows} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("nav.enrollments")}</CardTitle>
        </CardHeader>
        <CardContent>
          {enrollmentsQuery.isLoading ? (
            <PageSpinner />
          ) : (
            <DataTable
              columns={enrollmentColumns}
              data={enrollments}
              pageSize={5}
              emptyState={<EmptyState icon={BookOpen} title={t("adminHome.detail_noEnrollments")} />}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("adminHome.detail_payments")}</CardTitle>
        </CardHeader>
        <CardContent>
          {paymentsQuery.isLoading ? (
            <PageSpinner />
          ) : (
            <DataTable
              columns={paymentColumns}
              data={payments}
              pageSize={5}
              emptyState={<EmptyState icon={Wallet} title={t("adminHome.detail_noPayments")} />}
            />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={blacklistModalOpen}
        onOpenChange={(open) => {
          setBlacklistModalOpen(open);
          if (!open) setBlacklistReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminHome.detail_blacklistStudent")}</DialogTitle>
          </DialogHeader>

          <BlacklistCascadePanel
            studentId={studentId}
            studentName={studentName}
            busy={actionLoading}
            onCommit={(reason) => {
              setBlacklistReason(reason);
              void handleBlacklistToggle(reason);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={walletModalOpen}
        onOpenChange={(open) => {
          if (!actionLoading) {
            setWalletModalOpen(open);
            if (!open) setWalletAmount("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminHome.detail_walletTopup")}</DialogTitle>
            <DialogDescription>{t("adminHome.detail_walletTopupDesc")}</DialogDescription>
          </DialogHeader>
          <div>
            <div className="mb-1 text-sm font-medium">{t("adminHome.detail_walletAmount")}</div>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="0"
              value={walletAmount}
              onChange={(e) => setWalletAmount(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWalletModalOpen(false)} disabled={actionLoading}>
              {t("actions.cancel")}
            </Button>
            <Button disabled={actionLoading} onClick={handleWalletTopup}>
              {actionLoading ? <Spinner /> : null}
              {t("adminHome.detail_walletTopupConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editModalOpen}
        onOpenChange={(open) => {
          setEditModalOpen(open);
          if (!open) editForm.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminHome.detail_editStudent")}</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form
              id="edit-student-form"
              onSubmit={editForm.handleSubmit(handleEditSave)}
              className="space-y-4"
            >
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminHome.detail_name")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          className="ps-9"
                          placeholder={t("adminHome.detail_studentNamePlaceholder")}
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.email")}</FormLabel>
                    <FormControl>
                      <Input placeholder="student@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminHome.detail_phone")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("adminHome.detail_phoneNumber")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button type="submit" form="edit-student-form" disabled={actionLoading}>
              {actionLoading ? <Spinner /> : null}
              {t("actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
