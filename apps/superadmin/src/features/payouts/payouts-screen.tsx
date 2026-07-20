"use client";

import { useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { BanknoteArrowDown, RefreshCcw, FileDown } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
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
import { PageHeader } from "@/components/kit/page-header";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { StatusBadge } from "@/components/kit/status-badge";
import { useFormatters } from "@/lib/i18n/use-formatters";

const ANY = "__any__";

const TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  paid: "success",
  rejected: "danger",
  pending: "warning",
  approved: "neutral",
};

type PayoutRow = {
  id: string;
  beneficiaryId: string;
  beneficiaryType: "teacher" | "center";
  beneficiaryName: string | null;
  beneficiaryEmail: string | null;
  netPayable: number | null;
  grossAmount: number | null;
  commission: number | null;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  paidAt: string | null;
};

export function PayoutsScreen() {
  const { formatEGP, formatDate } = useFormatters();
  const [status, setStatus] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PayoutRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { query, result } = useCustom({
    url: "finance/payouts",
    method: "get",
    config: {
      query: {
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
      },
    },
  });
  const { mutateAsync: act } = useCustomMutation();

  const rows = ((result?.data ?? []) as PayoutRow[]) || [];

  const refresh = () => query.refetch();

  const approve = async (p: PayoutRow) => {
    setBusyId(p.id);
    try {
      await act({ url: `finance/payouts/${p.id}/approve`, method: "post", values: {} });
      toast.success("Payout approved and settled (marked paid)");
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Approve failed");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    if (!rejectReason.trim()) {
      toast.error("A rejection reason is required");
      return;
    }
    setBusyId(rejecting.id);
    try {
      await act({
        url: `finance/payouts/${rejecting.id}/reject`,
        method: "post",
        values: { reason: rejectReason.trim() },
      });
      toast.success("Payout rejected — reserved funds released");
      setRejecting(null);
      setRejectReason("");
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Reject failed");
    } finally {
      setBusyId(null);
    }
  };

  const generate = async () => {
    try {
      const res = await act({ url: "finance/payouts", method: "post", values: {} });
      const created = (res as any)?.data?.data?.created ?? (res as any)?.data?.created;
      toast.success(`Month-end payout generation done${created !== undefined ? ` (${created} created)` : ""}`);
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Generation failed");
    }
  };

  const filterSelect = (
    label: string,
    value: string | null,
    set: (v: string | null) => void,
    options: string[],
  ) => (
    <Select value={value ?? undefined} onValueChange={(v) => set(v === ANY ? null : v)}>
      <SelectTrigger className="w-40">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{label}: any</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payouts"
        description="Withdraw requests from teachers and centers. Approving settles immediately: wallet is debited, the ledger transaction is written, and the payout is marked paid."
        actions={
          <Button variant="outline" onClick={generate}>
            <RefreshCcw className="size-4" />
            Generate month-end payouts
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          {filterSelect("Status", status, setStatus, ["pending", "approved", "paid", "rejected"])}
          {filterSelect("Beneficiary", type, setType, ["teacher", "center"])}
        </CardContent>
      </Card>

      {query.isLoading && <PageSpinner label="Loading payouts…" />}

      {!query.isLoading && rows.length === 0 && (
        <EmptyState icon={BanknoteArrowDown} title="No payouts found" />
      )}

      {rows.length > 0 && (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Beneficiary</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Net payable</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${
                          p.beneficiaryType === "center"
                            ? "bg-brand-teal/10 text-brand-teal"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {(p.beneficiaryName ?? p.beneficiaryId).charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <div className="font-medium">{p.beneficiaryName ?? p.beneficiaryId.slice(0, 8)}</div>
                        {p.beneficiaryEmail ? (
                          <div className="text-xs text-muted-foreground">{p.beneficiaryEmail}</div>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={p.beneficiaryType === "center" ? "info" : "primary"}>
                      {p.beneficiaryType}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="font-semibold text-brand-teal">{formatEGP(p.netPayable ?? 0)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={TONE[p.status] ?? "neutral"}>{p.status}</StatusBadge>
                    {p.rejectionReason ? (
                      <div className="text-xs text-destructive">{p.rejectionReason}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.paidAt ? formatDate(p.paidAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {p.status === "pending" ? (
                        <>
                          <Button size="sm" disabled={busyId === p.id} onClick={() => approve(p)}>
                            {busyId === p.id ? <Spinner /> : null}
                            Approve &amp; pay
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busyId === p.id}
                            onClick={() => setRejecting(p)}
                          >
                            Reject
                          </Button>
                        </>
                      ) : null}
                      {p.status === "paid" ? (
                        <Button asChild size="sm" variant="outline">
                          <a
                            href={`/api/v1/finance/payouts/${p.id}/receipt`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FileDown className="size-4" />
                            Receipt
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t px-6 py-4">
            <span className="text-sm text-muted-foreground">
              Showing {rows.length} payout{rows.length === 1 ? "" : "s"}
            </span>
          </div>
        </Card>
      )}

      <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject payout</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Rejecting releases the reserved funds back to{" "}
              <strong>{rejecting?.beneficiaryName}</strong>&apos;s available balance.
            </p>
            <Input
              placeholder="Reason (required)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={reject} disabled={busyId === rejecting?.id}>
              {busyId === rejecting?.id ? <Spinner /> : null}
              Reject payout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
