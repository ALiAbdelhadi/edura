import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderEmail } from "../src/render";
import { TEMPLATE_IDS } from "../src/templates/registry";
import type { TemplateData, TemplateId } from "../src/types";

const LOCALES = ["ar", "en"] as const;

const SAMPLES: { [K in TemplateId]: TemplateData<K> } = {
  welcome: {
    name: "أحمد محمود",
    link: "https://edura.example/ar/onboarding?token=SAMPLE",
    studentCode: "A1B2C3D4E5F6",
    expiryDays: 7,
  },
  password_reset: {
    link: "https://edura.example/ar/reset-password?token=SAMPLE",
    expiryHours: 1,
  },
  email_verification: {
    link: "https://edura.example/ar/verify-email?token=SAMPLE",
    expiryHours: 1,
  },
  payment_receipt: {
    receiptNumber: "RCP-NILE-2026-00042",
    amountPiasters: 45000,
    description: "اشتراك شهري — الرياضيات (الصف الثالث الثانوي)",
    payeeName: "مركز النيل التعليمي",
    method: "card",
    paidAt: new Date("2026-08-02T15:30:00Z"),
    link: "https://edura.example/ar/dashboard/student/payments",
  },
};

const outDir = resolve(process.env.NOTIFICATIONS_PREVIEW_DIR ?? ".notifications-preview");
await mkdir(outDir, { recursive: true });

const index: string[] = [];

for (const id of TEMPLATE_IDS) {
  for (const locale of LOCALES) {
    const out = await renderEmail(id, locale, SAMPLES[id]);
    const file = `${id}.${locale}.html`;
    await writeFile(join(outDir, file), out.html, "utf8");
    await writeFile(join(outDir, `${id}.${locale}.txt`), `${out.subject}\n\n${out.text}\n`, "utf8");
    index.push(
      `<li><a href="./${file}">${id} — ${locale}</a> <span style="color:#6b7280">${out.subject}</span></li>`,
    );
    console.log(`✓ ${file}`);
  }
}

await writeFile(
  join(outDir, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Edura email previews</title>
<body style="font-family:system-ui;max-width:720px;margin:40px auto;line-height:2">
<h1>Edura email previews</h1><ul>${index.join("")}</ul></body>`,
  "utf8",
);

console.log(`\nOpen ${join(outDir, "index.html")}`);
