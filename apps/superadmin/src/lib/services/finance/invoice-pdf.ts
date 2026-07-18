import { PDFDocument, StandardFonts, rgb } from "pdf-lib";


type InvoiceLike = {
  invoiceNumber: string;
  type: string;
  status: string;
  subtotal: number | null;
  commission: number | null;
  netAmount: number | null;
  periodStart: Date | string | null;
  periodEnd: Date | string | null;
  qrCode: string | null;
  createdAt: Date | string;
};

const egp = (piasters: number | null | undefined) =>
  `${((piasters ?? 0) / 100).toLocaleString("en-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;

const asDate = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : "—");

export async function renderInvoicePdf(inv: InvoiceLike): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(inv.invoiceNumber);
  doc.setProducer("Edura");
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.42, 0.45, 0.5);
  const brand = rgb(0.059, 0.647, 0.914);
  const line = rgb(0.9, 0.91, 0.93);
  const M = 56;
  let y = 786;

  const text = (s: string, x: number, yy: number, opts?: { size?: number; f?: typeof font; color?: typeof ink }) =>
    page.drawText(s, { x, y: yy, size: opts?.size ?? 10, font: opts?.f ?? font, color: opts?.color ?? ink });

  text("Edura", M, y, { size: 22, f: bold, color: brand });
  text(inv.type.replace(/_/g, " ").toUpperCase(), 595 - M - bold.widthOfTextAtSize(inv.type.replace(/_/g, " ").toUpperCase(), 11), y + 4, { size: 11, f: bold, color: muted });
  y -= 20;
  text("Educational marketplace — Egypt", M, y, { size: 9, color: muted });
  y -= 30;
  page.drawLine({ start: { x: M, y }, end: { x: 595 - M, y }, thickness: 1, color: line });
  y -= 28;

  const meta: [string, string][] = [
    ["Invoice number", inv.invoiceNumber],
    ["Status", inv.status],
    ["Issued", asDate(inv.createdAt)],
    ["Period", `${asDate(inv.periodStart)} - ${asDate(inv.periodEnd)}`],
  ];
  for (const [k, v] of meta) {
    text(k, M, y, { size: 9, color: muted });
    text(v, M + 130, y, { size: 10, f: bold });
    y -= 20;
  }
  y -= 16;

  page.drawRectangle({ x: M, y: y - 4, width: 595 - 2 * M, height: 26, color: rgb(0.96, 0.97, 0.98) });
  text("Description", M + 12, y + 4, { size: 9, f: bold, color: muted });
  text("Amount", 595 - M - 12 - 80, y + 4, { size: 9, f: bold, color: muted });
  y -= 30;
  const rows: [string, number | null][] = [
    ["Subtotal", inv.subtotal],
    ["Platform commission", inv.commission],
  ];
  for (const [k, v] of rows) {
    text(k, M + 12, y, { size: 10 });
    const amt = egp(v);
    text(amt, 595 - M - 12 - font.widthOfTextAtSize(amt, 10), y, { size: 10 });
    y -= 22;
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: 595 - M, y: y + 8 }, thickness: 0.5, color: line });
  }
  y -= 6;
  text("Net", M + 12, y, { size: 12, f: bold });
  const net = egp(inv.netAmount);
  text(net, 595 - M - 12 - bold.widthOfTextAtSize(net, 12), y, { size: 12, f: bold, color: brand });

  const footY = 70;
  page.drawLine({ start: { x: M, y: footY + 24 }, end: { x: 595 - M, y: footY + 24 }, thickness: 0.5, color: line });
  if (inv.qrCode) text(`Verify: ${inv.qrCode}`, M, footY, { size: 8, color: muted });
  text("All amounts in Egyptian Pounds (EGP). Corrections are issued as reversal entries.", M, footY - 14, { size: 8, color: muted });

  return doc.save();
}
