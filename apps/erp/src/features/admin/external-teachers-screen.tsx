"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { AlertTriangle, Plus, UserPlus, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
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
import {
  Badge,
  DataTable,
  EmptyState,
  Money,
  Num,
  PageHead,
  RowIdentity,
  Sheet,
  SheetHead,
  type Column,
} from "./ledger";

type TeacherRow = {
  id: string;
  teacherId: string;
  name: string;
  email: string | null;
  phone: string | null;
  systemStatus: "external" | "enrolled";
  accountStatus: string;
  subjects: string[];
  coursesCount: number;
  walletBalance: number;
  centerShare: number | null;
  removed: boolean;
  pendingClaim: boolean;
};

type GapReport = {
  blocking: number;
  gaps: { kind: string; severity: string }[];
};

export function ExternalTeachersScreen() {
  const t = useTranslations();
  const { formatEGP } = useFormatters();
  const [rows, setRows] = useState<TeacherRow[] | null>(null);
  const [gaps, setGaps] = useState<GapReport | null>(null);
  const [owed, setOwed] = useState<{ teacherId: string; owed: number }[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [list, gapRes, balances] = await Promise.all([
      api.get("center/external-teachers?systemStatus=external&includeRemoved=true").json<{ data: TeacherRow[] }>(),
      api.get("center/external-teachers/gaps").json<{ data: GapReport }>().catch(() => null),
      api
        .get("center/external-teachers/balances")
        .json<{ data: { teacherId: string; owed: number }[] }>()
        .catch(() => null),
    ]);
    setRows(list.data);
    setGaps(gapRes?.data ?? null);
    setOwed(balances?.data ?? []);
  }, []);

  useEffect(() => {
    load().catch((e: Error) => toast.error(e.message));
  }, [load]);

  const schema = z.object({
    fullName: z.string().trim().min(2, t("externalTeachers.form_nameRequired")),
    phone: z.string().trim().optional(),
    email: z.string().trim().optional(),
    subjects: z.string().trim().optional(),
    centerShare: z.string().trim().optional(),
  });
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", phone: "", email: "", subjects: "", centerShare: "" },
  });

  const onSubmit = async (values: Values) => {
    setSaving(true);
    try {
      await api
        .post("center/external-teachers", {
          json: {
            fullName: values.fullName,
            phone: values.phone || null,
            email: values.email || null,
            subjects: values.subjects
              ? values.subjects.split(",").map((s) => s.trim()).filter(Boolean)
              : [],
            centerShare: values.centerShare
              ? Math.round(Number(values.centerShare) * 100)
              : null,
          },
        })
        .json();
      toast.success(t("externalTeachers.added"));
      setIsAddOpen(false);
      form.reset();
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const owedById = new Map(owed.map((o) => [o.teacherId, o.owed]));

  const columns: Column<TeacherRow>[] = [
    {
      id: "teacher",
      header: t("roles.teacher"),
      cell: (r) => <RowIdentity name={r.name} meta={r.phone ?? r.email ?? undefined} />,
    },
    {
      id: "subjects",
      header: t("adminHome.teachers_subjects"),
      cell: (r) => (
        <span className="text-[13px] text-[var(--ink-2)]">{r.subjects.join(", ") || "—"}</span>
      ),
    },
    {
      id: "groups",
      header: t("nav.classes"),
      numeric: true,
      cell: (r) => <Num className="text-[13px]">{r.coursesCount}</Num>,
    },
    {
      id: "owed",
      header: t("externalTeachers.owed"),
      numeric: true,
      cell: (r) => <Money>{formatEGP(owedById.get(r.teacherId) ?? r.walletBalance)}</Money>,
    },
    {
      id: "state",
      header: t("adminHome.teachers_status"),
      cell: (r) =>
        r.removed ? (
          <Badge tone="neutral">{t("externalTeachers.removed")}</Badge>
        ) : (
          <Badge tone="neutral">{t("externalTeachers.badge")}</Badge>
        ),
    },
    {
      id: "actions",
      header: t("adminHome.teachers_actions"),
      srOnly: true,
      numeric: true,
      cell: (r) => (
        <Link
          href={`/dashboard/admin/external-teachers/${r.teacherId}`}
          className="text-[13px] text-[var(--indigo)] underline-offset-4 hover:underline"
        >
          {t("externalTeachers.open")}
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={t("externalTeachers.title")}
        actions={
          <Button onClick={() => setIsAddOpen(true)}>
            <Plus className="size-4" />
            {t("externalTeachers.add")}
          </Button>
        }
      />

      <p className="max-w-2xl text-[13px] leading-relaxed text-[var(--ink-2)]">
        {t("externalTeachers.subtitle")}
      </p>

      {gaps && gaps.blocking > 0 ? (
        <Sheet blocking>
          <SheetHead
            title={t("externalTeachers.gaps_title")}
            action={
              <Link
                href="/dashboard/admin/external-teachers/gaps"
                className="text-[13px] text-[var(--indigo)] underline-offset-4 hover:underline"
              >
                {t("externalTeachers.gaps_review")}
              </Link>
            }
          />
          <p className="flex items-center gap-2 px-4 pb-4 text-[13px] text-[var(--ink-2)]">
            <AlertTriangle className="size-4 text-[var(--amber)]" />
            {t("externalTeachers.gaps_summary", { count: gaps.blocking })}
          </p>
        </Sheet>
      ) : null}

      {rows === null ? (
        <PageSpinner />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.teacherId}
          caption={t("externalTeachers.title")}
          empty={
            <EmptyState
              icon={<Users className="size-6" />}
              title={t("externalTeachers.empty_title")}
              hint={t("externalTeachers.empty_body")}
              action={
                <Button onClick={() => setIsAddOpen(true)}>
                  <UserPlus className="size-4" />
                  {t("externalTeachers.add")}
                </Button>
              }
            />
          }
        />
      )}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("externalTeachers.add")}</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">
            {t("externalTeachers.form_hint")}
          </p>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("externalTeachers.form_name")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("externalTeachers.form_phone")}</FormLabel>
                    <FormControl>
                      <Input dir="ltr" className="num" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("externalTeachers.form_email")}</FormLabel>
                    <FormControl>
                      <Input dir="ltr" className="num" {...field} />
                    </FormControl>
                    <p className="text-xs text-[var(--ink-3)]">
                      {t("externalTeachers.form_emailHint")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="subjects"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("externalTeachers.form_subjects")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="centerShare"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("externalTeachers.form_centerShare")}</FormLabel>
                    <FormControl>
                      <Input dir="ltr" className="num" inputMode="decimal" {...field} />
                    </FormControl>
                    <p className="text-xs text-[var(--ink-3)]">
                      {t("externalTeachers.form_centerShareHint")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                  {t("actions.cancel")}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Spinner /> : null}
                  {t("actions.save")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
