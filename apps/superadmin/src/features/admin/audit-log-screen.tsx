"use client";

import { Fragment, useState } from "react";
import { useCustom } from "@refinedev/core";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
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

// ---------------------------------------------------------------------------
// The audit log viewer promised in the Step 2 follow-on (roadmap decision #10),
// and the thing that makes the oversight control operations checkable: who did
// what to which target, when, and what the value was before and after.
//
// `audit_logs` is REVOKEd UPDATE and DELETE for the application role, so this
// record cannot be edited or erased — not by a center admin, not by a super
// admin, not by this app.
// ---------------------------------------------------------------------------

type Row = {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  centerId: string | null;
  beforeState: unknown;
  afterState: unknown;
  onBehalfOf: string | null;
  onBehalfOfName: string | null;
  createdAt: string;
};

export function AuditLogTable({ fixedCenterId }: { fixedCenterId?: string }) {
  const { formatDate } = useFormatters();
  const [action, setAction] = useState("");
  const [targetId, setTargetId] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const query: Record<string, string> = { page: String(page), limit: "50" };
  if (fixedCenterId) query.centerId = fixedCenterId;
  if (action.trim()) query.action = action.trim();
  if (targetId.trim()) query.targetId = targetId.trim();

  const req = useCustom({ url: "admin/audit-logs", method: "get", config: { query } });
  const result = req.result?.data as { data: Row[]; total: number } | undefined;
  const rows = result?.data ?? [];
  const total = result?.total ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block font-medium">Action (prefix)</span>
          <Input
            value={action}
            placeholder="center. / user. / collaboration_request."
            className="w-64"
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium">Target id</span>
          <Input
            value={targetId}
            placeholder="uuid"
            className="w-72"
            onChange={(e) => {
              setTargetId(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <span className="ms-auto text-xs text-muted-foreground">{total} entr(ies)</span>
      </div>

      {req.query.isLoading ? (
        <PageSpinner />
      ) : rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No audit entries match.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const open = expanded === r.id;
                  return (
                    <Fragment key={r.id}>
                      <TableRow>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpanded(open ? null : r.id)}
                          >
                            {open ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDate(r.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{r.actorName ?? r.actorId ?? "system"}</span>
                          {r.actorRole ? (
                            <Badge variant="outline" className="ms-1">
                              {r.actorRole}
                            </Badge>
                          ) : null}
                          {r.onBehalfOf ? (
                            <span className="block text-xs text-muted-foreground">
                              on behalf of {r.onBehalfOfName ?? r.onBehalfOf}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{r.action}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.targetType ?? "—"}
                          {r.targetId ? (
                            <span className="block text-muted-foreground">{r.targetId}</span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow>
                          <TableCell colSpan={5}>
                            <div className="grid gap-3 md:grid-cols-2">
                              <StateBlock label="Before" value={r.beforeState} />
                              <StateBlock label="After" value={r.afterState} />
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">page {page}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={page * 50 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function StateBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <p className="mb-1 text-xs font-semibold">{label}</p>
      {value == null ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <pre className="overflow-x-auto text-xs whitespace-pre-wrap">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AuditLogScreen() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Every back-office action, in order, with before and after state."
      />
      <Alert>
        <Lock className="size-4" />
        <AlertTitle>Append-only</AlertTitle>
        <AlertDescription>
          The database revokes UPDATE and DELETE on this table for the application role, so an
          entry cannot be edited or removed from any app surface — including by a super admin.
        </AlertDescription>
      </Alert>
      <Card>
        <CardContent>
          <AuditLogTable />
        </CardContent>
      </Card>
    </div>
  );
}
