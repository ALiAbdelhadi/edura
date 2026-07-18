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
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@repo/ui/components/card";
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
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";

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

const categoryTone: Record<Category, StatusTone> = {
  rent: "info",
  utilities: "info",
  salaries: "primary",
  supplies: "info",
  marketing: "primary",
  maintenance: "warning",
  other: "neutral",
};

type Expense = {
  _id?: string;
  id?: string;
  amount: number;
  category: Category;
  description?: string;
  expenseDate: string;
};

export function AdminExpensesScreen() {
  const t = useTranslations();
  const { formatEGP, formatDate } = useFormatters();
  const categoryLabel = (c: Category) =>
    t(`adminManage.expenses.categories.${c}`);
  const { query, result } = useList<Expense>({
    resource: "expenses",
    pagination: { mode: "off" },
  });
  const { mutate: createExpense, mutation: createMutation } = useCreate();
  const { mutate: updateExpense, mutation: updateMutation } = useUpdate();
  const { mutate: deleteExpense } = useDelete();

  const expenses = (result?.data ?? []) as Expense[];

  const [isOpen, setIsOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);

  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const sortedExpenses = useMemo(
    () =>
      [...expenses].sort(
        (a, b) =>
          dayjs(b.expenseDate).valueOf() - dayjs(a.expenseDate).valueOf(),
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
    if (!open) {
      form.reset(defaultValues);
    }
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
        {
          resource: "expenses",
          id: editTarget.id || editTarget._id || "",
          values: payload,
        },
        {
          onSuccess: onDone,
          onError: (err: any) =>
            toast.error(err?.message || t("adminManage.expenses.failed")),
        },
      );
    } else {
      createExpense(
        { resource: "expenses", values: payload },
        {
          onSuccess: onDone,
          onError: (err: any) =>
            toast.error(err?.message || t("adminManage.expenses.failed")),
        },
      );
    }
  };

  const handleDelete = (id: string) => {
    deleteExpense(
      { resource: "expenses", id },
      {
        onSuccess: () =>
          toast.success(t("adminManage.expenses.expenseDeleted")),
        onError: (err: any) =>
          toast.error(err?.message || t("adminManage.expenses.deleteFailed")),
      },
    );
  };

  const columns: ColumnDef<Expense>[] = [
    {
      accessorKey: "expenseDate",
      header: t("adminManage.expenses.date"),
      cell: ({ row }) => formatDate(row.original.expenseDate),
      sortingFn: (a, b) =>
        dayjs(a.original.expenseDate).valueOf() -
        dayjs(b.original.expenseDate).valueOf(),
    },
    {
      accessorKey: "category",
      header: t("adminManage.expenses.category"),
      enableSorting: false,
      cell: ({ row }) => (
        <StatusBadge tone={categoryTone[row.original.category]}>
          {categoryLabel(row.original.category)}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "description",
      header: t("adminManage.expenses.description"),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.description || (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "amount",
      header: t("adminManage.expenses.amount"),
      cell: ({ row }) => (
        <span className="block text-end font-semibold tabular-nums">
          {formatEGP(row.original.amount)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const record = row.original;
        const id = record.id || record._id || "";
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("actions.edit")}
              onClick={() => openEdit(record)}
            >
              <Pencil className="size-4" />
            </Button>
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("actions.delete")}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <DollarSign className="size-4" />
            <span>{t("common.expenses")}</span>
            <span className="text-xs font-normal text-muted-foreground">
              · {t("common.total")}: {formatEGP(total)}
            </span>
          </CardTitle>
          <CardAction>
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              {t("adminManage.expenses.recordExpense")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <PageSpinner />
          ) : (
            <DataTable
              columns={columns}
              data={sortedExpenses}
              pageSize={10}
              emptyState={
                <EmptyState
                  icon={DollarSign}
                  title={t("adminManage.expenses.noExpenses")}
                />
              }
            />
          )}
        </CardContent>
      </Card>

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
              onSubmit={form.handleSubmit(handleSubmit)}
              autoComplete="off"
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminManage.expenses.amountEgp")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-sm text-muted-foreground">
                          EGP
                        </span>
                        <Input
                          type="number"
                          min={0.01}
                          step={1}
                          inputMode="decimal"
                          className="ps-12"
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const v = e.target.valueAsNumber;
                            field.onChange(
                              e.target.value === "" || Number.isNaN(v)
                                ? undefined
                                : v,
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
                    <FormLabel>
                      {t("adminManage.expenses.description")}
                    </FormLabel>
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
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  {t("actions.cancel")}
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? <Spinner /> : null}
                  {editTarget
                    ? t("actions.save")
                    : t("adminManage.expenses.record")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
