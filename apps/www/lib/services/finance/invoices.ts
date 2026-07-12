import { platformDb, type TenantTx } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { sendMail } from "@/lib/mail/send";
import { nextInvoiceRef } from "@/lib/services/finance/refNumbers";

/**
 * Invoices / statements (PRD §4.3, §5.5). Amounts are derived from the
 * append-only transaction ledger. PDF generation (Puppeteer) is out of the
 * current scope; `/pdf` returns a print-ready HTML document instead — flagged.
 */

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:3002";

type InvoiceType = "payment_receipt" | "student_invoice" | "teacher_statement" | "center_statement";

async function teacherStatementAmounts(tx: TenantTx, teacherUserId: string) {
  const sessions = await tx.session.findMany({ where: { teacherId: teacherUserId }, select: { id: true } });
  const lessonIds = sessions.map((s) => s.id);
  const gross = lessonIds.length
    ? (await tx.transaction.aggregate({ where: { lessonId: { in: lessonIds }, type: "payment" }, _sum: { amount: true } }))._sum.amount ?? 0
    : 0;
  const commission = (await tx.transaction.aggregate({ where: { fromEntityId: teacherUserId, type: "commission" }, _sum: { amount: true } }))._sum.amount ?? 0;
  const payouts = (await tx.transaction.aggregate({ where: { toEntityId: teacherUserId, type: "payout" }, _sum: { amount: true } }))._sum.amount ?? 0;
  const profile = await tx.teacherProfile.findUnique({ where: { userId: teacherUserId }, select: { walletBalance: true } });
  const net = (profile?.walletBalance ?? 0) + payouts;
  return { subtotal: gross, commission, netAmount: net };
}

async function centerStatementAmounts(tx: TenantTx, centerId: string) {
  const gross = (await tx.transaction.aggregate({ where: { centerId, type: "payment" }, _sum: { amount: true } }))._sum.amount ?? 0;
  const commission = (await tx.transaction.aggregate({ where: { fromEntityId: centerId, type: "commission" }, _sum: { amount: true } }))._sum.amount ?? 0;
  const payouts = (await tx.transaction.aggregate({ where: { toEntityId: centerId, type: "payout" }, _sum: { amount: true } }))._sum.amount ?? 0;
  const center = await tx.center.findUnique({ where: { id: centerId }, select: { walletBalance: true } });
  const net = (center?.walletBalance ?? 0) + payouts;
  return { subtotal: gross, commission, netAmount: net };
}

export function listInvoices(filters: { type?: string; issuedToId?: string; centerId?: string }) {
  return platformDb((tx) => {
    const where: Record<string, unknown> = {};
    if (filters.type) where.type = filters.type;
    if (filters.issuedToId) where.issuedToId = filters.issuedToId;
    if (filters.centerId) where.centerId = filters.centerId;
    return tx.invoice.findMany({ where, orderBy: { createdAt: "desc" } });
  });
}

export function getInvoice(id: string) {
  return platformDb(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundError("Invoice not found");
    return invoice;
  });
}

export function generateInvoice(input: {
  type: InvoiceType;
  issuedToId?: string;
  centerId?: string;
  paymentId?: string;
  periodStart?: string;
  periodEnd?: string;
}) {
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
        periodStart: input.periodStart ? new Date(input.periodStart) : null,
        periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
        subtotal,
        commission,
        netAmount,
        status: "issued",
        qrCode: `${APP_BASE_URL}/invoices/verify/${invoiceNumber}`,
      },
    });
    // Self-hosted PDF endpoint (S3 upload is an env-gated future — the URL points
    // at the generator route so it always resolves).
    return tx.invoice.update({
      where: { id: created.id },
      data: { pdfUrl: `${APP_BASE_URL}/api/v1/finance/invoices/${created.id}/pdf` },
    });
  });
}

/**
 * Generate an invoice AND auto-email the recipient on issuance (PRD §5.5).
 * Email failures are swallowed so issuance never fails on a mail hiccup.
 */
export async function generateAndEmailInvoice(input: Parameters<typeof generateInvoice>[0]) {
  const invoice = await generateInvoice(input);
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
<div>Invoice ${inv.invoiceNumber} · ${inv.status} · ${new Date(inv.createdAt).toISOString().slice(0, 10)}</div>
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
