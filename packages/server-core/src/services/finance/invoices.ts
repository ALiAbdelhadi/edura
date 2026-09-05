import { platformDb, type TenantTx } from "../../db/scope";
import { toDateKey } from "../../lib/date-key";
import { NotFoundError, BusinessRuleError } from "../../errors/classes";
import { writeAdminAudit } from "../../audit/admin-audit";
import type { SessionUser } from "../../auth/types";
import { sendMail } from "../../mail/send";
import { nextInvoiceRef } from "./ref-numbers";
import { appBaseUrl } from "../../http/app-url";
import { parsePageLimit, type PageLimitInput } from "../../validation/common";

type InvoiceType = "payment_receipt" | "student_invoice" | "teacher_statement" | "center_statement";

async function teacherStatementAmounts(tx: TenantTx, teacherUserId: string) {
  // transactions.lesson_id has no Prisma relation (polymorphic-style bare
  // column), and materialising every session id of a teacher into an IN clause
  // is an unbounded read that grows forever (M-16). One JOIN aggregate keeps
  // the same semantics in a single bounded query — the same derivation
  // `teacherStatement` uses, so the two cannot drift.
  //
  // Refunds are SUBTRACTED, not ignored. `type:"payment"` alone made every
  // issued statement overstate gross by the whole refunded total, which is a
  // second set of books against the refunds report that reads the same rows
  // (REFUND_DECISION.md §1.4).
  const grossRows = await tx.$queryRaw<{ gross: bigint }[]>`
    SELECT COALESCE(SUM(CASE WHEN t.type = 'refund' THEN -t.amount ELSE t.amount END), 0) AS gross
      FROM transactions t
      JOIN sessions s ON s.id = t.lesson_id
     WHERE s.teacher_id = ${teacherUserId}::uuid
       AND t.type IN ('payment', 'refund')`;
  const gross = Number(grossRows[0]?.gross ?? 0);
  const commission = (await tx.transaction.aggregate({ where: { fromEntityId: teacherUserId, type: "commission" }, _sum: { amount: true } }))._sum.amount ?? 0;
  const payouts = (await tx.transaction.aggregate({ where: { toEntityId: teacherUserId, type: "payout" }, _sum: { amount: true } }))._sum.amount ?? 0;
  const profile = await tx.teacherProfile.findUnique({ where: { userId: teacherUserId }, select: { walletBalance: true } });
  const net = (profile?.walletBalance ?? 0) + payouts;
  return { subtotal: gross, commission, netAmount: net };
}

async function centerStatementAmounts(tx: TenantTx, centerId: string) {
  // Same rule as the teacher side: gross is net of refunds.
  const charged = (await tx.transaction.aggregate({ where: { centerId, type: "payment" }, _sum: { amount: true } }))._sum.amount ?? 0;
  const refunded = (await tx.transaction.aggregate({ where: { centerId, type: "refund" }, _sum: { amount: true } }))._sum.amount ?? 0;
  const gross = charged - refunded;
  const commission = (await tx.transaction.aggregate({ where: { fromEntityId: centerId, type: "commission" }, _sum: { amount: true } }))._sum.amount ?? 0;
  const payouts = (await tx.transaction.aggregate({ where: { toEntityId: centerId, type: "payout" }, _sum: { amount: true } }))._sum.amount ?? 0;
  const center = await tx.center.findUnique({ where: { id: centerId }, select: { walletBalance: true } });
  const net = (center?.walletBalance ?? 0) + payouts;
  return { subtotal: gross, commission, netAmount: net };
}

/**
 * With no filter this used to return every invoice the platform had ever
 * issued, in one response, and the screen rendered all of them (M-16). It
 * pages now, and reports its own total so the screen can say which slice it
 * is showing.
 */
export function listInvoices(
  filters: { type?: string; issuedToId?: string; centerId?: string } & PageLimitInput = {},
) {
  const { page, limit, skip, take } = parsePageLimit(filters, 25);
  return platformDb(async (tx) => {
    const where: Record<string, unknown> = {};
    if (filters.type) where.type = filters.type;
    if (filters.issuedToId) where.issuedToId = filters.issuedToId;
    if (filters.centerId) where.centerId = filters.centerId;

    const [data, total] = await Promise.all([
      tx.invoice.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      tx.invoice.count({ where }),
    ]);
    return { data, total, page, limit };
  });
}

export function getInvoice(id: string) {
  return platformDb(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundError("Invoice not found");
    return invoice;
  });
}

/**
 * `new Date("garbage")` is an Invalid Date, not a throw -- Prisma then rejects
 * it at the driver and the accountant gets a 500 for what is a bad field.
 *
 * Returns null both for "absent" and for "unparseable"; the caller separates
 * the two, so that each refusal reads as its own string literal at its own
 * throw site. `tests/unit/business-rule-ar-coverage.test.ts` harvests those
 * literals, and a message assembled from a variable would slip past it.
 */
function toDate(value: string | undefined): Date | null {
  if (value === undefined) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type GenerateInvoiceInput = {
  type: InvoiceType;
  issuedToId?: string;
  centerId?: string;
  paymentId?: string;
  periodStart?: string;
  periodEnd?: string;
};

/**
 * `actor` is optional because the month-end cron generates statements with no
 * signed-in user behind them. Present or absent, the write leaves an audit row
 * -- an accountant-reachable write that recorded nothing was the gap here --
 * with `source` saying which of the two it was.
 */
export function generateInvoice(input: GenerateInvoiceInput, actor?: SessionUser) {
  const periodStart = toDate(input.periodStart);
  const periodEnd = toDate(input.periodEnd);
  if (input.periodStart !== undefined && periodStart === null) {
    throw new BusinessRuleError("periodStart is not a valid date");
  }
  if (input.periodEnd !== undefined && periodEnd === null) {
    throw new BusinessRuleError("periodEnd is not a valid date");
  }
  if (periodStart && periodEnd && periodEnd < periodStart) {
    throw new BusinessRuleError("periodEnd cannot be before periodStart");
  }
  return platformDb(async (tx) => {
    let subtotal = 0;
    let commission = 0;
    let netAmount = 0;
    let issuedToId = input.issuedToId ?? null;
    let centerId = input.centerId ?? null;

    if (input.type === "payment_receipt") {
      if (!input.paymentId) throw new BusinessRuleError("paymentId is required for a payment receipt");
      const payment = await tx.payment.findUnique({ where: { id: input.paymentId } });
      if (!payment) throw new NotFoundError("Payment not found");
      subtotal = payment.amount;
      netAmount = payment.amount;
      issuedToId = payment.studentId;
      centerId = payment.centerId;
    } else if (input.type === "teacher_statement") {
      if (!input.issuedToId) throw new BusinessRuleError("issuedToId (teacher) is required");
      ({ subtotal, commission, netAmount } = await teacherStatementAmounts(tx, input.issuedToId));
    } else if (input.type === "center_statement") {
      if (!input.centerId) throw new BusinessRuleError("centerId is required");
      ({ subtotal, commission, netAmount } = await centerStatementAmounts(tx, input.centerId));
    } else {
      throw new BusinessRuleError(`Unsupported invoice type: ${input.type}`);
    }

    const invoiceNumber = await nextInvoiceRef(tx);
    const created = await tx.invoice.create({
      data: {
        invoiceNumber,
        type: input.type,
        issuedToId,
        centerId,
        periodStart,
        periodEnd,
        subtotal,
        commission,
        netAmount,
        status: "issued",
        qrCode: `${appBaseUrl()}/invoices/verify/${invoiceNumber}`,
      },
    });
    const invoice = await tx.invoice.update({
      where: { id: created.id },
      data: { pdfUrl: `${appBaseUrl()}/api/v1/finance/invoices/${created.id}/pdf` },
    });

    const spec = {
      action: "finance.invoice_generated",
      targetType: "invoice",
      targetId: invoice.id,
      centerId: invoice.centerId,
      before: null,
      after: {
        invoiceNumber: invoice.invoiceNumber,
        type: invoice.type,
        issuedToId: invoice.issuedToId,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        subtotal: invoice.subtotal,
        commission: invoice.commission,
        netAmount: invoice.netAmount,
        source: actor ? "back_office" : "cron",
      },
    };
    if (actor) {
      await writeAdminAudit(tx, actor, spec);
    } else {
      await tx.auditLog.create({
        data: {
          actorId: null,
          action: spec.action,
          targetType: spec.targetType,
          targetId: spec.targetId,
          centerId: spec.centerId ?? null,
          afterState: spec.after as never,
        },
      });
    }

    return invoice;
  }, actor ? { actorId: actor.id } : undefined);
}

export async function generateAndEmailInvoice(input: GenerateInvoiceInput, actor?: SessionUser) {
  const invoice = await generateInvoice(input, actor);
  if (invoice.issuedToId) {
    await sendInvoiceEmail(invoice.id).catch(() => {});
  }
  return invoice;
}

const egp = (piasters: number | null | undefined) =>
  `${((piasters ?? 0) / 100).toLocaleString("en-EG", { minimumFractionDigits: 2 })} EGP`;

export async function renderInvoiceHtml(id: string): Promise<string> {
  const inv = await getInvoice(id);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${inv.invoiceNumber}</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;color:#111}
h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}
td{padding:8px 0;border-bottom:1px solid #eee}.r{text-align:right}.tot{font-weight:700;font-size:18px}</style></head>
<body><h1>Edura — ${inv.type.replace(/_/g, " ")}</h1>
<div>Invoice ${inv.invoiceNumber} · ${inv.status} · ${toDateKey(inv.createdAt)}</div>
<table>
<tr><td>Subtotal</td><td class="r">${egp(inv.subtotal)}</td></tr>
<tr><td>Platform commission</td><td class="r">${egp(inv.commission)}</td></tr>
<tr><td class="tot">Net</td><td class="r tot">${egp(inv.netAmount)}</td></tr>
</table>
<p style="margin-top:24px;color:#666;font-size:12px">Verify: ${inv.qrCode}</p></body></html>`;
}

export async function sendInvoiceEmail(id: string) {
  const inv = await getInvoice(id);
  if (!inv.issuedToId) throw new BusinessRuleError("Invoice has no recipient to email");
  const recipient = await platformDb((tx) =>
    tx.user.findUnique({ where: { id: inv.issuedToId as string }, select: { email: true, name: true } }),
  );
  if (!recipient?.email) throw new BusinessRuleError("Recipient has no email on file");
  const html = await renderInvoiceHtml(id);
  await sendMail({
    to: recipient.email,
    subject: `Your Edura invoice ${inv.invoiceNumber}`,
    html,
  });
  return { sent: true, to: recipient.email };
}
