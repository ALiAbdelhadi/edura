"use client";

import { useMemo, useState } from "react";
import { useCustom } from "@refinedev/core";
import { AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
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
import { PageSpinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";

type SettlementRow = {
  id: string;
  sessionId: string;
  pricingMethod: "whole_room_percent" | "per_attending_student";
  presentCount: number;
  livePresentCount: number;
  attendanceMismatch: boolean;
  perSessionPrice: number;
  platformTotal: number;
  centerTotal: number;
  teacherTotal: number;
  m2CenterFee: number | null;
  m2CenterBp: number | null;
  centerName: string | null;
  teacherName: string | null;
  courseTitle: string | null;
  roomName: string | null;
  createdAt: string;
};

const METHOD_LABEL: Record<SettlementRow["pricingMethod"], string> = {
  whole_room_percent: "Whole-room %",
  per_attending_student: "Per student",
};

export function RoomSettlementsScreen() {
  const { formatEGP, formatDate } = useFormatters();
  const [method, setMethod] = useState<string>("all");
  const [page, setPage] = useState(1);

  const query = useMemo(
    () => ({
      page: String(page),
      limit: "50",
      ...(method !== "all" ? { pricingMethod: method } : {}),
    }),
    [method, page],
  );

  const req = useCustom({
    url: "admin/session-settlements",
    method: "get",
    config: { query },
  });
  const data = req.result?.data as
    | { settlements: SettlementRow[]; meta: { total: number; page: number; limit: number } }
    | undefined;

  const rows = data?.settlements ?? [];
  const total = data?.meta?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (data?.meta?.limit ?? 50)));

  const rateOf = (r: SettlementRow) =>
    r.pricingMethod === "per_attending_student"
      ? r.m2CenterFee != null
        ? `${formatEGP(r.m2CenterFee)}/student`
        : `${(r.m2CenterBp ?? 0) / 100}%/student`
      : "—";

  return (
    <div className="space-y-6">
      <PageHeader title="Room settlements" />

      <Alert>
        <Info className="size-4" />
        <AlertTitle>Per-session settlement records</AlertTitle>
        <AlertDescription>
          Written by the money engine in the same transaction as the ledger, exactly once per
          session. The mismatch flag means attendance was edited AFTER the money settled — the
          ledger is final; corrections go through refunds/adjustments.
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-2">
        <Select
          value={method}
          onValueChange={(v) => {
            setMethod(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            <SelectItem value="whole_room_percent">Whole-room %</SelectItem>
            <SelectItem value="per_attending_student">Per attending student</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{total} settlements</span>
      </div>

      <Card>
        <CardContent>
          {req.query.isLoading ? (
            <PageSpinner />
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No settlements yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Center</TableHead>
                  <TableHead>Course / Hall</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead className="text-right">Present</TableHead>
                  <TableHead className="text-right">Lesson price</TableHead>
                  <TableHead className="text-right">Center</TableHead>
                  <TableHead className="text-right">Teacher</TableHead>
                  <TableHead className="text-right">Platform</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(r.createdAt)}</TableCell>
                    <TableCell>{r.centerName ?? "—"}</TableCell>
                    <TableCell>
                      <div className="max-w-48 truncate">{r.courseTitle ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.roomName ?? ""}</div>
                    </TableCell>
                    <TableCell>{r.teacherName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.pricingMethod === "per_attending_student" ? "default" : "secondary"
                        }
                      >
                        {METHOD_LABEL[r.pricingMethod]}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{rateOf(r)}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1">
                        {r.presentCount}
                        {r.attendanceMismatch ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="size-3" />
                            now {r.livePresentCount}
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{formatEGP(r.perSessionPrice)}</TableCell>
                    <TableCell className="text-right">{formatEGP(r.centerTotal)}</TableCell>
                    <TableCell className="text-right">{formatEGP(r.teacherTotal)}</TableCell>
                    <TableCell className="text-right">{formatEGP(r.platformTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
