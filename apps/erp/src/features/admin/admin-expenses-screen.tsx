/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useMemo, useState } from "react";
import { useList, useCreate, useUpdate, useDelete } from "@refinedev/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, DollarSign } from "lucide-react";
import dayjs from "dayjs";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/components/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@repo/ui/components/form";
import { toast } from "@repo/ui/components/sonner";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { Amount, Badge, DataTable, DateText, EmptyState, PageHead, Sheet, type BadgeTone, type Column } from "./ledger";

const CATEGORIES = [
  "rent",
  "utilities",
  "salaries",
  "supplies",
  "marketing",
  "maintenance",
  "other",
] as const;
type Category = (typeof CATEGORIES)[number];

const categoryTone: Record<Category, BadgeTone> = {
  rent: "neutral",
  utilities: "neutral",
  salaries: "neutral",
  supplies: "neutral",
  marketing: "neutral",
  maintenance: "pending",
  other: "neutral",
};

type Expense = {
  id?: string;
  amount: number;
  category: Category;
  description?: string;
  expenseDate: string;
};

export function AdminExpensesScreen() {
  const t = useTranslations();
  const { formatDate, locale } = useFormatters();
  const categoryLabel = (c: Category) => t(`adminManage.expenses.categories.${c}`);
  const { query, result } = useList<Expense>({
    resource: "expenses",
    pagination: { mode: "off" },
  });
  const { mutate: createExpense, mutation: createMutation } = useCreate();
  const { mutate: updateExpense, mutation: updateMutation } = useUpdate();
  const { mutate: deleteExpense } = useDelete();

  const expenses = useMemo(() => (result?.data ?? []) as Expense[], [result]);

  const [isOpen, setIsOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);

  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const sortedExpenses = useMemo(
    () =>
      [...expenses].sort(
        (a, b) => dayjs(b.expenseDate).valueOf() - dayjs(a.expenseDate).valueOf(),
      ),
    [expenses],
  );

  const schema = useMemo(
    () =>
      z.object({
        amount: z
          .number({ error: t("adminManage.expenses.amountRequired") })
          .min(0.01, t("adminManage.expenses.amountPositive")),
        category: z.enum(CATEGORIES),
        description: z.string().optional(),
        expenseDate: z.string().min(1, t("adminManage.expenses.dateRequired")),
      }),
    [t],
  );

  type FormValues = z.infer<typeof schema>;

  const defaultValues: FormValues = {
    amount: undefined as unknown as number,
    category: "other",
    description: "",
    expenseDate: dayjs().format("YYYY-MM-DD"),
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) form.reset(defaultValues);
  };

  const openCreate = () => {
    setEditTarget(null);
    form.reset({ ...defaultValues, expenseDate: dayjs().format("YYYY-MM-DD") });
    setIsOpen(true);
  };

  const openEdit = (e: Expense) => {
    setEditTarget(e);
    form.reset({
      amount: (e.amount ?? 0) / 100,
      category: e.category,
      description: e.description ?? "",
      expenseDate: dayjs(e.expenseDate).format("YYYY-MM-DD"),
    });
    setIsOpen(true);
  };

  const handleSubmit = (values: FormValues) => {
    const payload = {
      amount: Math.round(values.amount * 100),
      category: values.category,
      description: values.description || undefined,
      expenseDate: values.expenseDate,
    };
    const onDone = () => {
      toast.success(
        editTarget
          ? t("adminManage.expenses.expenseUpdated")
          : t("adminManage.expenses.expenseRecorded"),
      );
      setIsOpen(false);
      form.reset(defaultValues);
    };
    if (editTarget) {
      updateExpense(
        { resource: "expenses", id: editTarget.id || "", values: payload },
        {
          onSuccess: onDone,
          onError: (err: any) => toast.error(err?.message || t("adminManage.expenses.failed")),
        },
      );
    } else {
      createExpense(
        { resource: "expenses", values: payload },
        {
          onSuccess: onDone,
          onError: (err: any) => toast.error(err?.message || t("adminManage.expenses.failed")),
        },
      );
    }
  };

  const handleDelete = (id: string) => {
    deleteExpense(
      { resource: "expenses", id },
      {
        onSuccess: () => toast.success(t("adminManage.expenses.expenseDeleted")),
        onError: (err: any) => toast.error(err?.message || t("adminManage.expenses.deleteFailed")),
      },
    );
  };

  const columns: Column<Expense>[] = [
    {
      id: "expenseDate",
      header: t("adminManage.expenses.date"),
      cell: (r) => (
        <DateText className="text-xs text-[var(--ink-3)]">{formatDate(r.expenseDate)}</DateText>
      ),
    },
    {
      id: "category",
      header: t("adminManage.expenses.category"),
      cell: (r) => <Badge tone={categoryTone[r.category]}>{categoryLabel(r.category)}</Badge>,
    },
    {
      id: "description",
      header: t("adminManage.expenses.description"),
      cell: (r) =>
        r.description ? (
          <span className="text-[13px] text-[var(--ink)]">{r.description}</span>
        ) : (
          <span className="text-[var(--ink-3)]">—</span>
        ),
    },
    {
      id: "amount",
      header: t("adminManage.expenses.amount"),
      numeric: true,
      cell: (r) => (
        <Amount
          piasters={-(r.amount ?? 0)}
          locale={locale}
          className="text-[13px] font-semibold text-destructive"
        />
      ),
    },
    {
      id: "actions",
      header: t("adminHome.students_colActions"),
      srOnly: true,
      numeric: true,
      cell: (r) => {
        const id = r.id || "";
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-[var(--ink-2)]"
              onClick={() => openEdit(r)}
            >
              <Pencil className="size-4" />
              {t("actions.edit")}
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm" className="text-destructive">
                  <Trash2 className="size-4" />
                  {t("actions.delete")}
                </Button>
              }
              title={t("adminManage.expenses.deleteConfirm")}
              confirmText={t("actions.delete")}
              cancelText={t("actions.cancel")}
              destructive
              onConfirm={() => handleDelete(id)}
            />
          </div>
        );
      },
    },
  ];

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={t("common.expenses")}
        subtitle={t("adminManage.expenses.subtitle")}
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            {t("adminManage.expenses.recordExpense")}
          </Button>
        }
      />

      {query.isLoading ? (
        <PageSpinner />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={sortedExpenses}
            rowKey={(r) => String(r.id)}
            caption={t("common.expenses")}
            empty={
              <EmptyState
                icon={<DollarSign className="size-6" />}
                title={t("adminManage.expenses.noExpenses")}
              />
            }
          />

          {sortedExpenses.length > 0 ? (
            <Sheet className="px-[18px] py-3">
              <div className="lg-total flex items-baseline justify-between gap-3 pt-2.5">
                <span className="text-[13px] font-semibold text-[var(--ink)]">
                  {t("common.total")}
                </span>
                <Amount
                  piasters={-total}
                  locale={locale}
                  className="text-[17px] font-semibold text-destructive"
                />
              </div>
            </Sheet>
          ) : null}
        </>
      )}

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editTarget
                ? t("adminManage.expenses.editExpense")
                : t("adminManage.expenses.recordExpense")}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              noValidate
              onSubmit={form.handleSubmit(handleSubmit)}
              autoComplete="off"
              className="flex flex-col gap-4"
            >
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminManage.expenses.amountEgp")}</FormLabel>
                    <FormControl>
                      <div className="relative" dir="ltr">
                        <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-sm text-[var(--ink-3)]">
                          EGP
                        </span>
                        <Input
                          type="number"
                          min={0.01}
                          step="0.01"
                          inputMode="decimal"
                          dir="ltr"
                          className="num ps-12"
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const v = e.target.valueAsNumber;
                            field.onChange(
                              e.target.value === "" || Number.isNaN(v) ? undefined : v,
                            );
                          }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminManage.expenses.category")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {categoryLabel(c)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminManage.expenses.description")}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        maxLength={300}
                        placeholder={t("adminManage.expenses.optionalDetails")}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expenseDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminManage.expenses.date")}</FormLabel>
                    <FormControl>
                      <Input type="date" dir="ltr" className="num" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  {t("actions.cancel")}
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? <Spinner /> : null}
                  {editTarget ? t("actions.save") : t("adminManage.expenses.record")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
