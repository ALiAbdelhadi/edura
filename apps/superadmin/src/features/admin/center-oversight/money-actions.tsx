"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useCustomMutation } from "@refinedev/core";
import { Banknote, Plus, Receipt, Wallet } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
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
import { toast } from "@repo/ui/components/sonner";
import { Num } from "@repo/ui/components/num";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import type { Locale } from "@repo/ui/lib/format";
import { Spinner } from "@/components/kit/spinner";
import { useAdminGet, type Paged } from "./use-oversight";
import { ControlAction } from "./control-actions";

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="block font-medium">{label}</span>
      {children}
    </label>
  );
}

function useMoneyMutation() {
  const t = useTranslations("oversight");
  const { mutateAsync } = useCustomMutation();
  return async (
    url: string,
    values: Record<string, unknown>,
    successMsg: string,
    method: "post" | "patch" | "delete" = "post",
  ) => {
    try {
      await mutateAsync({ url, method, values });
      toast.success(successMsg);
      return true;
    } catch (e) {
      // Duplicate-payment and insufficient-funds reasons live in this message.
      toast.error((e as { message?: string })?.message || t("ma_actionFailed"));
      return false;
    }
  };
}

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
  if (failed) {
    // An empty picker in a money dialog reads as "no students" — say what it is.
    return (
      <Labeled label={t("ma_student")}>
        <LoadError
          message={queryStrings.loadFailed}
          onRetry={() => void retry()}
          retryLabel={queryStrings.retry}
        />
      </Labeled>
    );
  }
  return (
    <Labeled label={t("ma_student")}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
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
    </Labeled>
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
  const run = useMoneyMutation();
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const piasters = Math.round(Number(amount) * 100);
    if (!studentId || !Number.isFinite(piasters) || piasters <= 0) {
      toast.error(t("ma_needStudentAmount"));
      return;
    }
    setBusy(true);
    const okDone = await run(
      `admin/centers/${centerId}/money/payments`,
      { studentId, amount: piasters, ...(note.trim() ? { note: note.trim() } : {}) },
      t("ma_paymentOk"),
    );
    setBusy(false);
    if (okDone) {
      setAmount("");
      setNote("");
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("ma_recordCashTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-ink-2">
            Writes a Payment with a center receipt number and a mirrored ledger entry, in one
            transaction. Positive amounts only — returning money is the refund flow.
          </p>
          <StudentPicker
            centerId={centerId}
            enabled={open}
            value={studentId}
            onChange={setStudentId}
          />
          <Labeled label={t("ma_amountEgp")}>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Labeled>
          <Labeled label={t("ma_noteOptional")}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Labeled>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const run = useMoneyMutation();
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const piasters = Math.round(Number(amount) * 100);
    if (!studentId || !Number.isFinite(piasters) || piasters <= 0) {
      toast.error(t("ma_needStudentAmount"));
      return;
    }
    setBusy(true);
    const okDone = await run(
      `admin/centers/${centerId}/money/wallet-topup`,
      { studentId, amount: piasters },
      t("ma_topUpOk"),
    );
    setBusy(false);
    if (okDone) {
      setAmount("");
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("ma_topUpTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-ink-2">
            <strong>{t("ma_creditOnly")}</strong> {t("ma_creditOnlyBody")}
          </p>
          <StudentPicker
            centerId={centerId}
            enabled={open}
            value={studentId}
            onChange={setStudentId}
          />
          <Labeled label={t("ma_amountEgp")}>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Labeled>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null}
            Add to wallet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const run = useMoneyMutation();
  const courses = useAdminGet<Paged<{ id: string; title: string; pricePerMonth: number | null; pricePerSession: number | null }>>(
    `admin/centers/${centerId}/oversight/courses`,
    { enabled: open, query: { limit: "100" } },
  );
  const [studentId, setStudentId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [plan, setPlan] = useState<"monthly" | "per_session">("monthly");
  const [busy, setBusy] = useState(false);

  const course = (courses.data?.data ?? []).find((c) => c.id === courseId);
  const price = plan === "monthly" ? course?.pricePerMonth : course?.pricePerSession;

  const submit = async () => {
    if (!studentId || !courseId) {
      toast.error(t("ma_needStudentCourse"));
      return;
    }
    setBusy(true);
    const okDone = await run(
      `admin/centers/${centerId}/money/subscriptions`,
      { studentId, courseId, plan },
      "Subscription created and paid in cash",
    );
    setBusy(false);
    if (okDone) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("ma_walkInTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-ink-2">
            {t("ma_walkInNote")}
          </p>
          <StudentPicker
            centerId={centerId}
            enabled={open}
            value={studentId}
            onChange={setStudentId}
          />
          <Labeled label={t("ma_course")}>
            {courses.isError ? (
              <LoadError
                message={queryStrings.loadFailed}
                onRetry={() => void courses.refetch()}
                retryLabel={queryStrings.retry}
              />
            ) : (
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger>
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
            )}
          </Labeled>
          <Labeled label={t("ma_plan")}>
            <Select value={plan} onValueChange={(v) => setPlan(v as "monthly" | "per_session")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">{t("ma_monthly")}</SelectItem>
                <SelectItem value="per_session">{t("ma_perSession")}</SelectItem>
              </SelectContent>
            </Select>
          </Labeled>
          {course ? (
            <p className="text-sm">
              Charge:{" "}
              <strong className="tabular-nums">
                {price != null ? <Num.Money piasters={price} locale={locale} sign={false} /> : t("ma_notPriced")}
              </strong>
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || price == null}>
            {busy ? <Spinner /> : null}
            Take cash &amp; subscribe
          </Button>
        </DialogFooter>
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
  const run = useMoneyMutation();
  const req = useAdminGet<{ wallet: { balance?: number }; payouts: unknown[] }>(
    `admin/centers/${centerId}/money/payout-request`,
    { enabled: open },
  );
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  // One idempotency key per open of the dialog: a timeout retry resolves to
  // the same payout server-side instead of minting a second one.
  const requestKey = useRef("");
  useEffect(() => {
    if (open) requestKey.current = crypto.randomUUID();
  }, [open]);

  const submit = async () => {
    const piasters = amount.trim() === "" ? undefined : Math.round(Number(amount) * 100);
    setBusy(true);
    const okDone = await run(
      `admin/centers/${centerId}/money/payout-request`,
      { ...(piasters ? { amount: piasters } : {}), clientRequestId: requestKey.current },
      t("ma_payoutOk"),
    );
    setBusy(false);
    if (okDone) {
      setAmount("");
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("ma_requestPayoutTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-ink-2">
            This <strong>pays nothing</strong>. It raises a pending payout; approval and
            settlement stay with the accountant, where the balance floor is enforced.
          </p>
          {req.isError ? (
            <LoadError
              message={queryStrings.unavailable}
              onRetry={() => void req.refetch()}
              retryLabel={queryStrings.retry}
            />
          ) : (
            <p className="text-sm">
              Center wallet:{" "}
              {req.data?.wallet ? (
                <Num.Money piasters={req.data.wallet.balance ?? 0} locale={locale} tone="net" sign={false} />
              ) : (
                <span className="text-ink-3">…</span>
              )}
            </p>
          )}
          <Labeled label={t("ma_amountFull")}>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Labeled>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null}
            Request payout
          </Button>
        </DialogFooter>
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
  const run = useMoneyMutation();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ amount: "", category: "other", description: "", expenseDate: "" });
  const [busy, setBusy] = useState(false);

  const raw = req.data;
  const rows: ExpenseRow[] = Array.isArray(raw) ? raw : (raw?.items ?? []);

  const submit = async () => {
    const piasters = Math.round(Number(f.amount) * 100);
    if (!Number.isFinite(piasters) || piasters <= 0 || !f.expenseDate) {
      toast.error(t("ma_needAmountDate"));
      return;
    }
    setBusy(true);
    const okDone = await run(
      `admin/centers/${centerId}/money/expenses`,
      {
        amount: piasters,
        category: f.category,
        expenseDate: f.expenseDate,
        ...(f.description.trim() ? { description: f.description.trim() } : {}),
      },
      t("ma_expenseOk"),
    );
    setBusy(false);
    if (okDone) {
      setF({ amount: "", category: "other", description: "", expenseDate: "" });
      setOpen(false);
      req.refetch();
    }
  };

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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ma_addExpenseTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Labeled label={t("ma_amountEgp")}>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={f.amount}
                onChange={(e) => setF((s) => ({ ...s, amount: e.target.value }))}
              />
            </Labeled>
            <Labeled label={t("ma_category")}>
              <Select
                value={f.category}
                onValueChange={(v) => setF((s) => ({ ...s, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Labeled>
            <Labeled label={t("ma_date")}>
              <Input
                type="date"
                value={f.expenseDate}
                onChange={(e) => setF((s) => ({ ...s, expenseDate: e.target.value }))}
              />
            </Labeled>
            <Labeled label={t("ma_descOptional")}>
              <Input
                value={f.description}
                onChange={(e) => setF((s) => ({ ...s, description: e.target.value }))}
              />
            </Labeled>
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Spinner /> : null}
              Add expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
