"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Banknote, Plus, Receipt, Wallet } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { Num } from "@repo/ui/components/num";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import type { Locale } from "@repo/ui/lib/format";
import { Spinner } from "@/components/kit/spinner";
import {
  EntityDialog,
  FieldControls,
  FormRootError,
  useFieldForm,
  type FieldSpec,
} from "@/features/admin/catalog/entity-dialog";
import { Form } from "@repo/ui/components/form";
import { useAction } from "@/lib/api/use-action";
import { useAdminGet, type Paged } from "./use-oversight";
import { ControlAction } from "./control-actions";

export function MoneyActions({ centerId }: { centerId: string }) {
  const t = useTranslations("oversight");
  const [open, setOpen] = useState<null | "payment" | "topup" | "subscription" | "payout">(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("ma_counterActions")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert>
            <Banknote className="size-4" />
            <AlertTitle>{t("ma_realFlows")}</AlertTitle>
            <AlertDescription>
              {t("ma_realFlowsBody")}
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setOpen("payment")}>
              <Receipt className="size-4" />{t("ma_recordCash")}</Button>
            <Button size="sm" variant="outline" onClick={() => setOpen("topup")}>
              <Wallet className="size-4" />{t("ma_topUp")}</Button>
            <Button size="sm" variant="outline" onClick={() => setOpen("subscription")}>
              <Plus className="size-4" />
              {t("ma_walkIn")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen("payout")}>
              {t("ma_requestPayout")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <RecordPaymentDialog
        open={open === "payment"}
        onClose={() => setOpen(null)}
        centerId={centerId}
      />
      <TopUpDialog open={open === "topup"} onClose={() => setOpen(null)} centerId={centerId} />
      <WalkInSubscriptionDialog
        open={open === "subscription"}
        onClose={() => setOpen(null)}
        centerId={centerId}
      />
      <PayoutDialog open={open === "payout"} onClose={() => setOpen(null)} centerId={centerId} />
    </>
  );
}

function useRosterStudents(centerId: string, enabled: boolean) {
  const req = useAdminGet<{ items: { studentId: string; name?: string | null }[] }>(
    `admin/centers/${centerId}/roster/students`,
    { enabled },
  );
  return { students: req.data?.items ?? [], failed: req.isError, retry: req.refetch };
}

function StudentPicker({
  centerId,
  enabled,
  value,
  onChange,
}: {
  centerId: string;
  enabled: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("oversight");
  const queryStrings = useQueryStrings();
  const { students, failed, retry } = useRosterStudents(centerId, enabled);

  // No label of its own any more: it is rendered as a `custom` field, so the
  // shared FormItem supplies the label and the validation message. The retry
  // branch is why it cannot just be a `select` — an empty picker in a money
  // dialog reads as "no students".
  if (failed) {
    return (
      <LoadError
        message={queryStrings.loadFailed}
        onRetry={() => void retry()}
        retryLabel={queryStrings.retry}
      />
    );
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label={t("ma_student")}>
        <SelectValue placeholder={t("ma_pickStudent")} />
      </SelectTrigger>
      <SelectContent>
        {students.map((s) => (
          <SelectItem key={s.studentId} value={s.studentId}>
            {s.name ?? s.studentId}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RecordPaymentDialog({
  open,
  onClose,
  centerId,
}: {
  open: boolean;
  onClose: () => void;
  centerId: string;
}) {
  const t = useTranslations("oversight");
  const { run, busy } = useAction({
    url: `admin/centers/${centerId}/money/payments`,
    successMsg: t("ma_paymentOk"),
  });

  return (
    <EntityDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("ma_recordCashTitle")}
      note={t("ma_recordCashNote")}
      busy={busy}
      fields={[
        {
          name: "studentId",
          label: t("ma_student"),
          type: "custom",
          required: true,
          render: (field) => (
            <StudentPicker
              centerId={centerId}
              enabled={open}
              value={String(field.value ?? "")}
              onChange={field.onChange}
            />
          ),
        },
        // 0.01 EGP, not 0: this path writes a Payment and a ledger entry, and
        // a zero-value receipt is not a thing a counter should be able to mint.
        { name: "amount", label: t("ma_amountEgp"), type: "number", required: true, min: 0.01 },
        { name: "note", label: t("ma_noteOptional"), type: "text" },
      ]}
      submitLabel={t("ma_recordPayment")}
      onSubmit={async (v) => {
        const note = String(v.note ?? "").trim();
        const res = await run({
          values: {
            studentId: v.studentId,
            amount: Math.round(Number(v.amount) * 100),
            ...(note ? { note } : {}),
          },
        });
        if (res.ok) onClose();
        return res;
      }}
    />
  );
}

function TopUpDialog({
  open,
  onClose,
  centerId,
}: {
  open: boolean;
  onClose: () => void;
  centerId: string;
}) {
  const t = useTranslations("oversight");
  const { run, busy } = useAction({
    url: `admin/centers/${centerId}/money/wallet-topup`,
    successMsg: t("ma_topUpOk"),
  });

  return (
    <EntityDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("ma_topUpTitle")}
      note={
        <>
          <strong>{t("ma_creditOnly")}</strong> {t("ma_creditOnlyBody")}
        </>
      }
      busy={busy}
      fields={[
        {
          name: "studentId",
          label: t("ma_student"),
          type: "custom",
          required: true,
          render: (field) => (
            <StudentPicker
              centerId={centerId}
              enabled={open}
              value={String(field.value ?? "")}
              onChange={field.onChange}
            />
          ),
        },
        { name: "amount", label: t("ma_amountEgp"), type: "number", required: true, min: 0.01 },
      ]}
      submitLabel={t("ma_addToWallet")}
      onSubmit={async (v) => {
        const res = await run({
          values: { studentId: v.studentId, amount: Math.round(Number(v.amount) * 100) },
        });
        if (res.ok) onClose();
        return res;
      }}
    />
  );
}

function WalkInSubscriptionDialog({
  open,
  onClose,
  centerId,
}: {
  open: boolean;
  onClose: () => void;
  centerId: string;
}) {
  const t = useTranslations("oversight");
  const locale = useLocale() as Locale;
  const queryStrings = useQueryStrings();
  const { run, busy } = useAction({
    url: `admin/centers/${centerId}/money/subscriptions`,
    successMsg: t("ma_subscriptionOk"),
  });
  const courses = useAdminGet<Paged<{ id: string; title: string; pricePerMonth: number | null; pricePerSession: number | null }>>(
    `admin/centers/${centerId}/oversight/courses`,
    { enabled: open, query: { limit: "100" } },
  );

  // Not an EntityDialog: the charge is derived from the picked course and plan
  // and has to show BELOW the fields, and the confirm button stays disabled
  // while the course has no price for the chosen plan.
  const fields: FieldSpec[] = [
    {
      name: "studentId",
      label: t("ma_student"),
      type: "custom",
      required: true,
      render: (field) => (
        <StudentPicker
          centerId={centerId}
          enabled={open}
          value={String(field.value ?? "")}
          onChange={field.onChange}
        />
      ),
    },
    {
      name: "courseId",
      label: t("ma_course"),
      type: "custom",
      required: true,
      render: (field) =>
        courses.isError ? (
          <LoadError
            message={queryStrings.loadFailed}
            onRetry={() => void courses.refetch()}
            retryLabel={queryStrings.retry}
          />
        ) : (
          <Select value={String(field.value ?? "")} onValueChange={field.onChange}>
            <SelectTrigger className="w-full" aria-label={t("ma_course")}>
              <SelectValue placeholder={t("ma_pickCourse")} />
            </SelectTrigger>
            <SelectContent>
              {(courses.data?.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
    },
    {
      name: "plan",
      label: t("ma_plan"),
      type: "select",
      required: true,
      options: [
        { value: "monthly", label: t("ma_monthly") },
        { value: "per_session", label: t("ma_perSession") },
      ],
    },
  ];

  const { form, submit, rootError } = useFieldForm({
    fields,
    initial: { plan: "monthly" },
    open,
    onSubmit: async (v) => {
      const res = await run({
        values: { studentId: v.studentId, courseId: v.courseId, plan: v.plan },
      });
      if (res.ok) onClose();
      return res;
    },
  });

  const course = (courses.data?.data ?? []).find((c) => c.id === form.watch("courseId"));
  const price =
    form.watch("plan") === "monthly" ? course?.pricePerMonth : course?.pricePerSession;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <Form {...form}>
          <DialogForm onSubmit={() => void submit()}>
            <DialogHeader>
              <DialogTitle>{t("ma_walkInTitle")}</DialogTitle>
            </DialogHeader>

            <FormRootError message={rootError} />
            <p className="text-xs text-ink-2">{t("ma_walkInNote")}</p>

            <FieldControls fields={fields} form={form} />

            {course ? (
              <p className="text-sm">
                {t("ma_charge")}{" "}
                <strong className="tabular-nums">
                  {price != null ? (
                    <Num.Money piasters={price} locale={locale} sign={false} />
                  ) : (
                    t("ma_notPriced")
                  )}
                </strong>
              </p>
            ) : null}

            <DialogFooter>
              <Button type="submit" disabled={busy || price == null}>
                {busy ? <Spinner /> : null}
                {t("ma_takeCashSubscribe")}
              </Button>
            </DialogFooter>
          </DialogForm>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function PayoutDialog({
  open,
  onClose,
  centerId,
}: {
  open: boolean;
  onClose: () => void;
  centerId: string;
}) {
  const t = useTranslations("oversight");
  const locale = useLocale() as Locale;
  const queryStrings = useQueryStrings();
  const { run, busy } = useAction({
    url: `admin/centers/${centerId}/money/payout-request`,
    successMsg: t("ma_payoutOk"),
  });
  const req = useAdminGet<{ wallet: { balance?: number }; payouts: unknown[] }>(
    `admin/centers/${centerId}/money/payout-request`,
    { enabled: open },
  );
  // One idempotency key per open of the dialog: a timeout retry resolves to
  // the same payout server-side instead of minting a second one.
  const requestKey = useRef("");
  useEffect(() => {
    if (open) requestKey.current = crypto.randomUUID();
  }, [open]);

  // Not an EntityDialog: the wallet balance (or its retry) sits ABOVE the one
  // field, and the amount is optional — blank means "the whole balance".
  const fields: FieldSpec[] = [
    { name: "amount", label: t("ma_amountFull"), type: "number", min: 0 },
  ];

  const { form, submit, rootError } = useFieldForm({
    fields,
    open,
    onSubmit: async (v) => {
      const egp = Number(v.amount);
      const piasters = egp > 0 ? Math.round(egp * 100) : undefined;
      const res = await run({
        values: {
          ...(piasters ? { amount: piasters } : {}),
          clientRequestId: requestKey.current,
        },
      });
      if (res.ok) onClose();
      return res;
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <Form {...form}>
          <DialogForm onSubmit={() => void submit()}>
            <DialogHeader>
              <DialogTitle>{t("ma_requestPayoutTitle")}</DialogTitle>
            </DialogHeader>

            <FormRootError message={rootError} />
            <p className="text-xs text-ink-2">{t("ma_payoutNote")}</p>

            {req.isError ? (
              <LoadError
                message={queryStrings.unavailable}
                onRetry={() => void req.refetch()}
                retryLabel={queryStrings.retry}
              />
            ) : (
              <p className="text-sm">
                {t("ma_centerWallet")}{" "}
                {req.data?.wallet ? (
                  <Num.Money
                    piasters={req.data.wallet.balance ?? 0}
                    locale={locale}
                    tone="net"
                    sign={false}
                  />
                ) : (
                  <span className="text-ink-3">…</span>
                )}
              </p>
            )}

            <FieldControls fields={fields} form={form} />

            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner /> : null}
                {t("ma_requestPayout")}
              </Button>
            </DialogFooter>
          </DialogForm>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const CATEGORIES = ["rent", "salaries", "utilities", "supplies", "marketing", "other"] as const;

type ExpenseRow = {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  expenseDate: string;
};

export function ExpensesCard({ centerId }: { centerId: string }) {
  const t = useTranslations("oversight");
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
  const req = useAdminGet<ExpenseRow[] | { items: ExpenseRow[] }>(
    `admin/centers/${centerId}/money/expenses`,
  );
  const { run, busy } = useAction({
    url: `admin/centers/${centerId}/money/expenses`,
    successMsg: t("ma_expenseOk"),
    onSuccess: () => {
      void req.refetch();
    },
  });
  const [open, setOpen] = useState(false);

  const raw = req.data;
  const rows: ExpenseRow[] = Array.isArray(raw) ? raw : (raw?.items ?? []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>{t("ma_expenses")}</span>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="size-4" />{t("ma_addExpense")}</Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-xs text-ink-2">
          The center&apos;s own bookkeeping — not the append-only ledger. Deleting one reverses
          nothing in the transaction ledger.
        </p>
        {req.isLoading ? (
          <Spinner />
        ) : req.isError ? (
          <LoadError
            message={queryStrings.loadFailed}
            onRetry={() => void req.refetch()}
            retryLabel={queryStrings.retry}
          />
        ) : rows.length === 0 ? (
          <p className="text-sm text-ink-2">{t("ma_noExpenses")}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ma_date")}</TableHead>
                  <TableHead>{t("ma_category")}</TableHead>
                  <TableHead>{t("ma_description")}</TableHead>
                  <TableHead className="text-end">{t("ma_amount")}</TableHead>
                  <TableHead className="text-end">{t("ma_actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell><Num.Date value={e.expenseDate} locale={locale} options={{ dateStyle: "medium" }} className="text-[11px] text-ink-3" /></TableCell>
                    <TableCell>
                      <Badge variant="secondary">{e.category}</Badge>
                    </TableCell>
                    <TableCell>{e.description ?? "—"}</TableCell>
                    <TableCell className="text-end"><Num.Money piasters={e.amount} locale={locale} tone="muted" sign={false} /></TableCell>
                    <TableCell className="text-end">
                      <ControlAction
                        label={t("ma_delete")}
                        title={t("ma_deleteExpenseQ")}
                        destructive
                        confirmText={t("ma_delete")}
                        method="delete"
                        url={`admin/centers/${centerId}/money/expenses/${e.id}`}
                        values={{}}
                        onDone={req.refetch}
                        description={
                          <p>
                            Removes the center&apos;s bookkeeping row. Nothing in the transaction
                            ledger is reversed or removed.
                          </p>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <EntityDialog
        open={open}
        onOpenChange={setOpen}
        title={t("ma_addExpenseTitle")}
        busy={busy}
        initial={{ category: "other" }}
        fields={[
          { name: "amount", label: t("ma_amountEgp"), type: "number", required: true, min: 0.01 },
          {
            name: "category",
            label: t("ma_category"),
            type: "select",
            required: true,
            options: CATEGORIES.map((c) => ({ value: c, label: c })),
          },
          { name: "expenseDate", label: t("ma_date"), type: "date", required: true },
          { name: "description", label: t("ma_descOptional"), type: "text" },
        ]}
        submitLabel={t("ma_addExpense")}
        onSubmit={async (v) => {
          const description = String(v.description ?? "").trim();
          const res = await run({
            values: {
              amount: Math.round(Number(v.amount) * 100),
              category: v.category,
              expenseDate: v.expenseDate,
              ...(description ? { description } : {}),
            },
          });
          if (res.ok) setOpen(false);
          return res;
        }}
      />
    </Card>
  );
}
