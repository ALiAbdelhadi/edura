"use client";

import { useState } from "react";
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
import { Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useAdminGet, type Paged } from "./use-oversight";
import { ControlAction } from "./control-actions";

// ---------------------------------------------------------------------------
// PHASE 4 — the sanctioned money flows, on the Finance tab.
//
// Every button here writes through the money engine with a receipt or a
// reference number. None of them edits a ledger row or sets a balance directly.
// The two easiest things to misread are labelled where the operator will see
// them: "mark refunded" is a status flag, and a payout request pays nothing.
// ---------------------------------------------------------------------------

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="block font-medium">{label}</span>
      {children}
    </label>
  );
}

function useMoneyMutation() {
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
      toast.error((e as { message?: string })?.message || "Action failed");
      return false;
    }
  };
}

export function MoneyActions({ centerId }: { centerId: string }) {
  const [open, setOpen] = useState<null | "payment" | "topup" | "subscription" | "payout">(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Counter actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert>
            <Banknote className="size-4" />
            <AlertTitle>These are the real flows, not ledger edits</AlertTitle>
            <AlertDescription>
              Each one writes through the money engine with a receipt or reference number, exactly
              as the center&apos;s own counter does. None of them edits a ledger row or sets a
              balance — those stay impossible, for a super admin too.
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setOpen("payment")}>
              <Receipt className="size-4" />
              Record cash payment
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen("topup")}>
              <Wallet className="size-4" />
              Top up a wallet
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen("subscription")}>
              <Plus className="size-4" />
              Walk-in subscription
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen("payout")}>
              Request payout
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
  return req.data?.items ?? [];
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
  const students = useRosterStudents(centerId, enabled);
  return (
    <Labeled label="Student (this center's roster)">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Pick a student" />
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
  const run = useMoneyMutation();
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const piasters = Math.round(Number(amount) * 100);
    if (!studentId || !Number.isFinite(piasters) || piasters <= 0) {
      toast.error("Pick a student and enter a positive amount");
      return;
    }
    setBusy(true);
    const okDone = await run(
      `admin/centers/${centerId}/money/payments`,
      { studentId, amount: piasters, ...(note.trim() ? { note: note.trim() } : {}) },
      "Payment recorded — receipt issued and mirrored to the ledger",
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
          <DialogTitle>Record a cash payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Writes a Payment with a center receipt number and a mirrored ledger entry, in one
            transaction. Positive amounts only — returning money is the refund flow.
          </p>
          <StudentPicker
            centerId={centerId}
            enabled={open}
            value={studentId}
            onChange={setStudentId}
          />
          <Labeled label="Amount (EGP)">
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Labeled>
          <Labeled label="Note (optional)">
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
  const run = useMoneyMutation();
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const piasters = Math.round(Number(amount) * 100);
    if (!studentId || !Number.isFinite(piasters) || piasters <= 0) {
      toast.error("Pick a student and enter a positive amount");
      return;
    }
    setBusy(true);
    const okDone = await run(
      `admin/centers/${centerId}/money/wallet-topup`,
      { studentId, amount: piasters },
      "Wallet topped up — receipt issued and mirrored to the ledger",
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
          <DialogTitle>Top up a student wallet (cash)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            <strong>Credit only.</strong> There is no counter-side withdrawal anywhere in the
            product — money goes in here, and only the student&apos;s own spending or a refund
            takes it out.
          </p>
          <StudentPicker
            centerId={centerId}
            enabled={open}
            value={studentId}
            onChange={setStudentId}
          />
          <Labeled label="Amount (EGP)">
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
  const run = useMoneyMutation();
  const courses = useAdminGet<Paged<{ id: string; title: string; pricePerMonth: number | null; pricePerSession: number | null }>>(
    `admin/centers/${centerId}/oversight/courses`,
    { enabled: open, query: { limit: "100" } },
  );
  const { formatEGP } = useFormatters();
  const [studentId, setStudentId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [plan, setPlan] = useState<"monthly" | "per_session">("monthly");
  const [busy, setBusy] = useState(false);

  const course = (courses.data?.data ?? []).find((c) => c.id === courseId);
  const price = plan === "monthly" ? course?.pricePerMonth : course?.pricePerSession;

  const submit = async () => {
    if (!studentId || !courseId) {
      toast.error("Pick a student and a course");
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
          <DialogTitle>Walk-in subscription (cash)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            The charge is the course&apos;s configured plan price — there is no amount field, so
            no number can be entered here.
          </p>
          <StudentPicker
            centerId={centerId}
            enabled={open}
            value={studentId}
            onChange={setStudentId}
          />
          <Labeled label="Course">
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a course" />
              </SelectTrigger>
              <SelectContent>
                {(courses.data?.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Labeled>
          <Labeled label="Plan">
            <Select value={plan} onValueChange={(v) => setPlan(v as "monthly" | "per_session")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="per_session">Per session</SelectItem>
              </SelectContent>
            </Select>
          </Labeled>
          {course ? (
            <p className="text-sm">
              Charge:{" "}
              <strong className="tabular-nums">
                {price != null ? formatEGP(price) : "plan not priced"}
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
  const { formatEGP } = useFormatters();
  const run = useMoneyMutation();
  const req = useAdminGet<{ wallet: { balance?: number }; payouts: unknown[] }>(
    `admin/centers/${centerId}/money/payout-request`,
    { enabled: open },
  );
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const piasters = amount.trim() === "" ? undefined : Math.round(Number(amount) * 100);
    setBusy(true);
    const okDone = await run(
      `admin/centers/${centerId}/money/payout-request`,
      piasters ? { amount: piasters } : {},
      "Payout requested — pending the accountant's approval",
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
          <DialogTitle>Request a payout</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            This <strong>pays nothing</strong>. It raises a pending payout; approval and
            settlement stay with the accountant, where the balance floor is enforced.
          </p>
          <p className="text-sm">
            Center wallet:{" "}
            <strong className="tabular-nums">{formatEGP(req.data?.wallet?.balance ?? 0)}</strong>
          </p>
          <Labeled label="Amount (EGP — blank means the full balance)">
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

// ===========================================================================
// Expenses
// ===========================================================================

const CATEGORIES = ["rent", "salaries", "utilities", "supplies", "marketing", "other"] as const;

type ExpenseRow = {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  expenseDate: string;
};

export function ExpensesCard({ centerId }: { centerId: string }) {
  const { formatEGP, formatDate } = useFormatters();
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
      toast.error("A positive amount and a date are required");
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
      "Expense recorded",
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
          <span>Expenses</span>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Add expense
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-xs text-muted-foreground">
          The center&apos;s own bookkeeping — not the append-only ledger. Deleting one reverses
          nothing in the transaction ledger.
        </p>
        {req.isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses recorded.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-end">Amount</TableHead>
                  <TableHead className="text-end">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{formatDate(e.expenseDate, { dateStyle: "medium" })}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{e.category}</Badge>
                    </TableCell>
                    <TableCell>{e.description ?? "—"}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatEGP(e.amount)}</TableCell>
                    <TableCell className="text-end">
                      <ControlAction
                        label="Delete"
                        title="Delete this expense?"
                        destructive
                        confirmText="Delete"
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
            <DialogTitle>Add an expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Labeled label="Amount (EGP)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={f.amount}
                onChange={(e) => setF((s) => ({ ...s, amount: e.target.value }))}
              />
            </Labeled>
            <Labeled label="Category">
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
            <Labeled label="Date">
              <Input
                type="date"
                value={f.expenseDate}
                onChange={(e) => setF((s) => ({ ...s, expenseDate: e.target.value }))}
              />
            </Labeled>
            <Labeled label="Description (optional)">
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
