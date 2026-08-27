export type TemplateDef = {
  name: string;
  params: string[];
  body: { ar: string; en: string };
};

export const WHATSAPP_TEMPLATES = {
  walk_in_welcome: {
    name: "edura_walk_in_welcome",
    params: ["student name", "student code", "onboarding link"],
    body: {
      ar: "مرحبًا {{1}}! تم إنشاء حسابك على منصة إدورا. كود الطالب الخاص بك هو {{2}} — احتفظ به لتسجيل الحضور في السنتر. لإكمال تسجيلك (السنة الدراسية والشعبة) افتح الرابط: {{3}}",
      en: "Hi {{1}}! Your Edura account has been created. Your student code is {{2}} — keep it for center check-in. Complete your registration (academic year & track) here: {{3}}",
    },
  },
  student_code_reminder: {
    name: "edura_student_code_reminder",
    params: ["student name", "student code"],
    body: {
      ar: "مرحبًا {{1}}! تذكير من إدورا: كود الطالب الخاص بك هو {{2}} — استخدمه لتسجيل الحضور في السنتر.",
      en: "Hi {{1}}! Edura reminder: your student code is {{2}} — use it for center check-in.",
    },
  },
} as const satisfies Record<string, TemplateDef>;

export type TemplateKey = keyof typeof WHATSAPP_TEMPLATES;

export function renderTemplate(key: TemplateKey, locale: "ar" | "en", params: string[]): string {
  let body: string = WHATSAPP_TEMPLATES[key].body[locale];
  params.forEach((p, i) => {
    body = body.replaceAll(`{{${i + 1}}}`, p);
  });
  return body;
}
