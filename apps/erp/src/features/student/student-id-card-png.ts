import { guillochePasses, studentIdentity } from "@repo/ui/lib/student-identity";
import { EDURA_MARK_PATHS, EDURA_MARK_STROKE, EDURA_MARK_VIEWBOX } from "@repo/ui/lib/edura-mark";
import { formatStudentCode } from "@repo/database/student-code";
import type { StudentCard } from "@repo/server-core/services/students/student-card";
import { CARD_H, CARD_W, WORDMARK } from "./student-id-card";

const SCALE = 2;

function readVars(el: HTMLElement) {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) =>
    cs.getPropertyValue(name).trim() || fallback;
  return {
    sheet: v("--sheet", "#ffffff"),
    paper: v("--paper", "#faf9f7"),
    rule: v("--rule", "#e3e1dc"),
    ink: v("--ink", "#1c1c1a"),
    ink2: v("--ink-2", "#54534e"),
    ink3: v("--ink-3", "#707686"),
    indigo: v("--indigo", "#4f46e5"),
    teal: v("--teal", "#0a7a6f"),
    amber: v("--amber", "#b45309"),
    body: cs.fontFamily || "system-ui, sans-serif",
    mono: v("--ledger-mono", "ui-monospace") + ", ui-monospace, monospace",
  };
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawEduraMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const k = size / EDURA_MARK_VIEWBOX;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const p of EDURA_MARK_PATHS) {
    const path = new Path2D(p.d);
    ctx.globalAlpha = p.light ? 0.8 : 1;
    if (p.filled) {
      ctx.fillStyle = color;
      ctx.fill(path);
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = p.light ? EDURA_MARK_STROKE.light : EDURA_MARK_STROKE.heavy;
      ctx.stroke(path);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export async function renderStudentCardPng(opts: {
  card: StudentCard;
  locale: string;
  sourceEl: HTMLElement;
  qrCanvas: HTMLCanvasElement | null;
  labels: { cardTitle: string; codeLabel: string };
}): Promise<Blob> {
  const { card, locale, sourceEl, qrCanvas, labels } = opts;

  try {
    await document.fonts?.ready;
  } catch {
  }

  const c = readVars(sourceEl);
  const identity = studentIdentity(card.patternSeed);
  const accent = c[identity.tone];
  const TONE = { indigo: c.indigo, teal: c.teal, amber: c.amber } as const;
  const ar = locale === "ar";

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W * SCALE;
  canvas.height = CARD_H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.scale(SCALE, SCALE);
  ctx.direction = ar ? "rtl" : "ltr";

  roundedRect(ctx, 0, 0, CARD_W, CARD_H, 14);
  ctx.fillStyle = c.sheet;
  ctx.fill();
  ctx.strokeStyle = c.rule;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  roundedRect(ctx, 0, 0, CARD_W, CARD_H, 14);
  ctx.clip();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const pass of guillochePasses(identity, CARD_W, CARD_H)) {
    ctx.strokeStyle = TONE[pass.tone];
    ctx.lineWidth = pass.width;
    ctx.globalAlpha = pass.opacity;
    ctx.beginPath();
    pass.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    if (pass.closed) ctx.closePath();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  roundedRect(ctx, 14, 14, CARD_W - 28, CARD_H - 28, 8);
  ctx.strokeStyle = c.rule;
  ctx.lineWidth = 1;
  ctx.stroke();

  const pad = 36;
  const start = ar ? CARD_W - pad : pad;
  const end = ar ? pad : CARD_W - pad;
  ctx.textAlign = ar ? "right" : "left";

  const MARK = 30;
  const GAP = 9;
  drawEduraMark(ctx, ar ? start - MARK : start, pad - 8, MARK, c.indigo);

  ctx.save();
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillStyle = c.indigo;
  ctx.font = `600 12px ${c.mono}`;
  ctx.letterSpacing = "1.7px";
  const wordWidth = ctx.measureText(WORDMARK).width;
  ctx.fillText(WORDMARK, ar ? start - MARK - GAP - wordWidth : start + MARK + GAP, pad + 13);
  ctx.restore();

  ctx.textAlign = ar ? "right" : "left";
  ctx.fillStyle = accent;
  ctx.font = `600 12px ${/[؀-ۿ]/.test(labels.cardTitle) ? c.body : c.mono}`;
  ctx.fillText(
    labels.cardTitle,
    ar ? start - MARK - GAP - wordWidth - 12 : start + MARK + GAP + wordWidth + 12,
    pad + 13,
  );

  ctx.fillStyle = c.ink;
  ctx.font = `700 30px ${c.body}`;
  ctx.fillText(card.name, start, pad + 50, CARD_W - pad * 2 - 130);

  const system = (ar ? card.educationSystem?.nameAr : card.educationSystem?.nameEn)
    ?? card.educationSystem?.nameAr;
  if (system) {
    ctx.fillStyle = c.ink2;
    ctx.font = `400 15px ${c.body}`;
    ctx.fillText(system, start, pad + 76, CARD_W - pad * 2 - 130);
  }

  if (qrCanvas) {
    const size = 92;
    const boxX = ar ? pad : CARD_W - pad - size - 12;
    ctx.save();
    roundedRect(ctx, boxX, pad - 10, size + 12, size + 12, 6);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = c.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.drawImage(qrCanvas, boxX + 6, pad - 4, size, size);
    ctx.restore();
  }

  ctx.textAlign = ar ? "right" : "left";
  ctx.fillStyle = c.ink3;
  ctx.font = `600 12px ${/[؀-ۿ]/.test(labels.codeLabel) ? c.body : c.mono}`;
  ctx.fillText(labels.codeLabel, start, CARD_H - pad - 44);

  ctx.save();
  ctx.direction = "ltr";
  ctx.textAlign = ar ? "right" : "left";
  ctx.fillStyle = c.ink;
  ctx.font = `600 36px ${c.mono}`;
  ctx.fillText(formatStudentCode(card.studentCode), start, CARD_H - pad - 8);
  ctx.restore();

  ctx.textAlign = ar ? "left" : "right";
  const grade = (ar ? card.gradeLevel?.nameAr : card.gradeLevel?.nameEn) ?? card.gradeLevel?.nameAr;
  const track = (ar ? card.track?.nameAr : card.track?.nameEn) ?? card.track?.nameEn;
  if (grade) {
    ctx.fillStyle = c.ink;
    ctx.font = `500 17px ${c.body}`;
    ctx.fillText(grade, end, CARD_H - pad - (track ? 26 : 8));
  }
  if (track) {
    ctx.fillStyle = c.ink2;
    ctx.font = `400 14px ${c.body}`;
    ctx.fillText(track, end, CARD_H - pad - 6);
  }

  ctx.save();
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = c.ink3;
  ctx.font = `400 9px ${c.mono}`;
  const unit = ` ${formatStudentCode(card.studentCode)} · `;
  let x = 22;
  while (x < CARD_W - 22) {
    ctx.fillText(unit, x, CARD_H - 22);
    x += ctx.measureText(unit).width;
  }
  ctx.restore();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      "image/png",
    );
  });
}
