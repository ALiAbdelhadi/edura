"use client";

import { useState } from "react";
import { useList, useOne } from "@refinedev/core";
import { Search, X, Info, CreditCard } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import {
  Dialog,
  DialogContent,
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
import { PageHeader } from "@/components/kit/page-header";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner } from "@/components/kit/spinner";
import { StatusBadge } from "@/components/kit/status-badge";
import { useFormatters } from "@/lib/i18n/use-formatters";

const ANY = "__any__";

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  paid: "success",
  failed: "danger",
  pending: "warning",
  expired: "neutral",
};

type IntentRow = {
  id: string;
  studentName: string | null;
  studentEmail: string | null;
  courseTitle: string | null;
  centerName: string | null;
  amount: number;
  currency: string;
  method: string;
  gateway: string;
  status: string;
  gatewayOrderId: string | null;
  gatewayRef: string | null;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
};

export function PaymentIntentsScreen({ apiBase }: { apiBase: "admin" | "finance" }) {
  const { formatEGP, formatDate } = useFormatters();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [gateway, setGateway] = useState<string | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  const resource = `${apiBase}/payment-intents`;
  const { query, result } = useList({
    resource,
    filters: [
      ...(q ? [{ field: "q", operator: "eq" as const, value: q }] : []),
      ...(status ? [{ field: "status", operator: "eq" as const, value: status }] : []),
      ...(gateway ? [{ field: "gateway", operator: "eq" as const, value: gateway }] : []),
      ...(method ? [{ field: "method", operator: "eq" as const, value: method }] : []),
    ],
    pagination: { currentPage: page, pageSize: 20 },
  });

  const rows = (result?.data ?? []) as IntentRow[];
  const total = (result?.total ?? 0) as number;
  const pageCount = Math.max(1, Math.ceil(total / 20));

  const { result: detail } = useOne({
    resource,
    id: detailId ?? "",
    queryOptions: { enabled: !!detailId },
  });
  // Data-provider getOne unwraps the envelope; be tolerant of either shape.
  const d = ((detail as any)?.data ?? detail) as any;

  const filterSelect = (
    label: string,
    value: string | null,
    set: (v: string | null) => void,
    options: string[],
  ) => (
    <Select
      value={value ?? undefined}
      onValueChange={(v) => {
        set(v === ANY ? null : v);
        setPage(1);
      }}
    >
      <SelectTrigger className="w-36">
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
      <PageHeader title="Online Payments" />

      <Alert>
        <Info className="size-4" />
        <AlertTitle>Ledger reflects online payments only</AlertTitle>
        <AlertDescription>
          Cash payments recorded at centers are not yet reconciled into the
          transaction ledger (planned for the subscriptions step). Until then,
          do not read these figures as complete finance data.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search student, order id, ref…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="ps-9 pe-9"
            />
            {q && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQ("")}
                className="absolute inset-inline-end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          {filterSelect("Status", status, setStatus, ["pending", "paid", "failed", "expired"])}
          {filterSelect("Gateway", gateway, setGateway, ["mock", "paymob"])}
          {filterSelect("Method", method, setMethod, ["card", "wallet"])}
        </CardContent>
      </Card>

      {query.isLoading && <PageSpinner label="Loading payment intents…" />}

      {!query.isLoading && rows.length === 0 && (
        <EmptyState icon={CreditCard} title="No payment intents found" />
      )}

      {rows.length > 0 && (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Center</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Gateway</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => setDetailId(r.id)}
                >
                  <TableCell>
                    <div className="font-medium">{r.studentName ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.studentEmail}</div>
                  </TableCell>
                  <TableCell>{r.courseTitle ?? "—"}</TableCell>
                  <TableCell>{r.centerName ?? "—"}</TableCell>
                  <TableCell className="font-semibold">{formatEGP(r.amount)}</TableCell>
                  <TableCell>{r.method}</TableCell>
                  <TableCell>{r.gateway}</TableCell>
                  <TableCell>
                    <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>
                      {r.status}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(r.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pageCount} · {total} total
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment intent</DialogTitle>
          </DialogHeader>
          {d ? (
            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Intent id</dt>
                <dd className="font-mono text-xs">{d.id}</dd>
                <dt className="text-muted-foreground">Student</dt>
                <dd>
                  {d.student?.name} <span className="text-muted-foreground">({d.student?.email})</span>
                </dd>
                <dt className="text-muted-foreground">Course</dt>
                <dd>{d.course?.title ?? "—"}</dd>
                <dt className="text-muted-foreground">Center</dt>
                <dd>{d.center?.name ?? "—"}</dd>
                <dt className="text-muted-foreground">Amount</dt>
                <dd className="font-semibold">{formatEGP(d.amount)}</dd>
                <dt className="text-muted-foreground">Method / gateway</dt>
                <dd>
                  {d.method} / {d.gateway}
                </dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <StatusBadge tone={STATUS_TONE[d.status] ?? "neutral"}>
                    {d.status}
                  </StatusBadge>
                  {d.failureReason ? (
                    <span className="ms-2 text-destructive">{d.failureReason}</span>
                  ) : null}
                </dd>
                <dt className="text-muted-foreground">Gateway order / ref</dt>
                <dd className="font-mono text-xs">
                  {d.gatewayOrderId ?? "—"} / {d.gatewayRef ?? "—"}
                </dd>
                <dt className="text-muted-foreground">Receipt</dt>
                <dd>{d.payment?.receiptNumber ?? "—"}</dd>
                <dt className="text-muted-foreground">Ledger txn</dt>
                <dd>{d.transaction?.refNumber ?? "—"}</dd>
                <dt className="text-muted-foreground">Created / paid</dt>
                <dd>
                  {formatDate(d.createdAt)}
                  {d.paidAt ? ` → ${formatDate(d.paidAt)}` : ""}
                </dd>
              </dl>
              {d.webhookPayload ? (
                <div>
                  <div className="mb-1 text-muted-foreground">Raw webhook payload</div>
                  <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
                    {JSON.stringify(d.webhookPayload, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : (
            <PageSpinner label="Loading…" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
