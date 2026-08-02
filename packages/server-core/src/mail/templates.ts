// =============================================================================
// The three INVITE emails (student claim, assistant, center staff) still live
// here as hand-written table HTML. Everything else moved to
// @repo/notifications, which is now the single owner of email templates.
//
// They are the deliberate remainder, not an oversight: each is threaded through
// an invite/claim flow with heavy live-DB proofs (invite-claim 107/107), and
// re-pointing them is a change to those flows, not to a template. The shell in
// @repo/notifications/templates/layout.tsx is a VISUAL MATCH for the layout()
// below — same navy header, same 520px card, same footer rule — so the two
// systems are indistinguishable in an inbox while this lasts, and porting them
// is a copy of the COPY constants with no design decision left to make.
// =============================================================================
import { normalizeLocale, renderEmail, type Locale } from "@repo/notifications";

export type MailLocale = Locale;

export const normalizeMailLocale = normalizeLocale;

const BRAND = "#1a2f73";
const BRAND_GLOW = "#3856e0";

/** Escape anything interpolated into the HTML body — names and emails are user data. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type LayoutInput = {
  locale: MailLocale;
  title: string;
  /**
   * Already-escaped HTML. Includes the CTA at its correct position — the button
   * is NOT appended by the layout, because a primary action rendered after the
   * fallback link and the "you can ignore this" note reads as an afterthought.
   */
  bodyHtml: string;
  footer: string;
};

/** Bulletproof-ish button: a table cell carries the fill so Outlook honours it. */
function ctaButton(label: string, url: string, align: "left" | "right"): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="${align}" style="margin:24px 0;">
    <tr><td style="border-radius:8px;background:${BRAND_GLOW};">
      <a href="${esc(url)}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(label)}</a>
    </td></tr>
  </table>
  <div style="clear:both;"></div>`;
}

/**
 * Table-based layout with inline styles — the only thing that renders
 * consistently across Gmail, Outlook and Apple Mail. `dir` flips the whole
 * document for Arabic.
 */
function layout({ locale, title, bodyHtml, footer }: LayoutInput): string {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const align = locale === "ar" ? "right" : "left";
  const font =
    locale === "ar"
      ? "'Segoe UI', Tahoma, Arial, sans-serif"
      : "'Segoe UI', Helvetica, Arial, sans-serif";

  return `<!doctype html>
<html dir="${dir}" lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f9;font-family:${font};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e7f0;">
          <tr>
            <td style="background:${BRAND};padding:24px;text-align:center;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Edura</span>
            </td>
          </tr>
          <tr>
            <td dir="${dir}" style="padding:32px 28px;text-align:${align};color:#1c2233;">
              <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1c2233;">${esc(title)}</h1>
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td dir="${dir}" style="padding:18px 28px 26px;text-align:${align};border-top:1px solid #eef0f6;color:#6b7280;font-size:12px;line-height:1.7;">
              ${esc(footer)}
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#9aa1af;">&copy; ${new Date().getFullYear()} Edura</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * SHIM — the password-reset template moved to @repo/notifications. Kept because
 * `scripts/mail-check.ts` renders it to test SMTP credentials without sending a
 * real reset. The production path is `requestPasswordReset`, which calls
 * `send("password_reset", ...)` directly.
 *
 * Now async (rendering React to HTML is async); the one caller awaits it.
 */
export async function passwordResetEmail(input: {
  link: string;
  locale: MailLocale;
  /** Matches RESET_TTL_MS in services/auth/password-reset.ts. */
  expiryHours?: number;
}): Promise<{ subject: string; html: string; text: string }> {
  return renderEmail("password_reset", input.locale, {
    link: input.link,
    expiryHours: input.expiryHours ?? 1,
  });
}

// =============================================================================
// Invite / claim emails (2026-07-25). One builder, three audiences.
//
// Every one of these carries a SINGLE-USE link that sets a password, so they
// all share the same shape as the reset mail: instruction -> button -> fallback
// link -> expiry -> "ignore if unexpected". Built on the same layout()/
// ctaButton() as passwordResetEmail — one email design system, not four.
// =============================================================================

export type InviteEmail = { subject: string; html: string; text: string };

const P_STYLE = "margin:0 0 12px;font-size:15px;line-height:1.8;color:#374151;";

function inviteBody(input: {
  locale: MailLocale;
  title: string;
  lines: string[];
  cta: string;
  link: string;
  expiry: string;
  ignore: string;
  footer: string;
}): InviteEmail & { subject: string } {
  const bodyHtml = `
    ${input.lines.map((l) => `<p style="${P_STYLE}">${esc(l)}</p>`).join("\n")}
    ${ctaButton(input.cta, input.link, input.locale === "ar" ? "right" : "left")}
    <p style="margin:8px 0 6px;font-size:13px;color:#6b7280;">${esc(
      input.locale === "ar"
        ? "إذا لم يعمل الزر، انسخ الرابط التالي والصقه في المتصفح:"
        : "If the button doesn't work, copy and paste this link into your browser:",
    )}</p>
    <p style="margin:0;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${esc(
      input.link,
    )}" style="color:${BRAND_GLOW};">${esc(input.link)}</a></p>
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">${esc(input.expiry)}</p>
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #eef0f6;font-size:13px;line-height:1.7;color:#6b7280;">${esc(
      input.ignore,
    )}</p>`;

  return {
    subject: input.title,
    html: layout({
      locale: input.locale,
      title: input.title,
      bodyHtml,
      footer: input.footer,
    }),
    text: [input.title, "", ...input.lines, "", input.link, "", input.expiry, input.ignore].join(
      "\n",
    ),
  };
}

const FOOTER = {
  ar: "هذه رسالة آلية من منصة Edura، برجاء عدم الرد عليها.",
  en: "This is an automated message from Edura. Please do not reply.",
} as const;

const IGNORE = {
  ar: "إذا وصلتك هذه الرسالة بالخطأ، تجاهلها — لن يتم تفعيل أي حساب.",
  en: "If you received this by mistake, ignore it — no account will be activated.",
} as const;

function expiryLine(days: number, locale: MailLocale): string {
  return locale === "ar"
    ? `هذا الرابط صالح للاستخدام مرة واحدة فقط وينتهي خلال ${days} أيام.`
    : `This link works once and expires in ${days} days.`;
}

/**
 * Student claim link. Addressed to the GUARDIAN whenever we resolved one —
 * which on a K-12 platform is the normal case — so the copy says plainly that
 * opening it sets the login for the CHILD's account, not the reader's own.
 */
export function studentClaimEmail(input: {
  locale: MailLocale;
  link: string;
  studentName: string;
  studentCode: string;
  centerName?: string | null;
  /** false when the recipient is a verified ADULT student claiming for themselves. */
  toGuardian: boolean;
  expiryDays: number;
}): InviteEmail {
  const { locale, studentName, studentCode, centerName } = input;
  const at = centerName
    ? locale === "ar"
      ? ` في ${centerName}`
      : ` at ${centerName}`
    : "";

  const title =
    locale === "ar"
      ? input.toGuardian
        ? "تفعيل حساب الطالب على Edura"
        : "تفعيل حسابك على Edura"
      : input.toGuardian
        ? "Activate your child's Edura account"
        : "Activate your Edura account";

  const lines =
    locale === "ar"
      ? input.toGuardian
        ? [
            `تم تسجيل الطالب ${studentName}${at} على منصة Edura.`,
            `رقم الطالب: ${studentCode}`,
            "اضغط على الزر التالي لتعيين البريد الإلكتروني وكلمة المرور الخاصة بحساب الطالب. أنت من يحتفظ ببيانات الدخول.",
          ]
        : [
            `تم تسجيلك${at} على منصة Edura.`,
            `رقم الطالب: ${studentCode}`,
            "اضغط على الزر التالي لتعيين البريد الإلكتروني وكلمة المرور الخاصة بك.",
          ]
      : input.toGuardian
        ? [
            `${studentName} has been registered${at} on Edura.`,
            `Student ID: ${studentCode}`,
            "Use the button below to set the email and password for your child's account. You keep these credentials.",
          ]
        : [
            `You have been registered${at} on Edura.`,
            `Student ID: ${studentCode}`,
            "Use the button below to set your email and password.",
          ];

  return inviteBody({
    locale,
    title,
    lines,
    cta: locale === "ar" ? "تفعيل الحساب" : "Activate account",
    link: input.link,
    expiry: expiryLine(input.expiryDays, locale),
    ignore: IGNORE[locale],
    footer: FOOTER[locale],
  });
}

/** Assistant invite — sent to the assistant's own address (assistants are adults). */
export function assistantInviteEmail(input: {
  locale: MailLocale;
  link: string;
  assistantName: string;
  teacherName: string;
  expiryDays: number;
}): InviteEmail {
  const { locale, assistantName, teacherName } = input;
  const title =
    locale === "ar" ? "دعوة للانضمام كمساعد على Edura" : "You've been added as an assistant on Edura";

  const lines =
    locale === "ar"
      ? [
          `مرحبًا ${assistantName}،`,
          `أضافك ${teacherName} كمساعد له على منصة Edura.`,
          "اضغط على الزر التالي لتعيين كلمة المرور الخاصة بك. أنت وحدك من سيعرفها — لا يمكن لمن دعاك الاطلاع عليها.",
        ]
      : [
          `Hi ${assistantName},`,
          `${teacherName} added you as their assistant on Edura.`,
          "Use the button below to set your own password. Only you will know it — the person who invited you cannot see it.",
        ];

  return inviteBody({
    locale,
    title,
    lines,
    cta: locale === "ar" ? "تعيين كلمة المرور" : "Set my password",
    link: input.link,
    expiry: expiryLine(input.expiryDays, locale),
    ignore: IGNORE[locale],
    footer: FOOTER[locale],
  });
}

const STAFF_ROLE_LABEL = {
  ar: {
    receptionist: "موظف استقبال",
    manager: "مدير",
    center_accountant: "محاسب المركز",
  },
  en: {
    receptionist: "receptionist",
    manager: "manager",
    center_accountant: "center accountant",
  },
} as const;

export type StaffRoleKey = keyof (typeof STAFF_ROLE_LABEL)["en"];

/** Center-staff invite — same shape, plus which center and which sub-role. */
export function staffInviteEmail(input: {
  locale: MailLocale;
  link: string;
  staffName: string;
  centerName: string;
  staffRole: StaffRoleKey;
  expiryDays: number;
}): InviteEmail {
  const { locale, staffName, centerName } = input;
  const roleLabel = STAFF_ROLE_LABEL[locale][input.staffRole];
  const title =
    locale === "ar"
      ? `دعوة للانضمام إلى فريق ${centerName} على Edura`
      : `You've been added to the ${centerName} team on Edura`;

  const lines =
    locale === "ar"
      ? [
          `مرحبًا ${staffName}،`,
          `أضافك مركز ${centerName} إلى فريقه على منصة Edura بصفة: ${roleLabel}.`,
          "اضغط على الزر التالي لتعيين كلمة المرور الخاصة بك. أنت وحدك من سيعرفها — لا يمكن لمن دعاك الاطلاع عليها.",
        ]
      : [
          `Hi ${staffName},`,
          `${centerName} added you to their team on Edura as ${roleLabel}.`,
          "Use the button below to set your own password. Only you will know it — the person who invited you cannot see it.",
        ];

  return inviteBody({
    locale,
    title,
    lines,
    cta: locale === "ar" ? "تعيين كلمة المرور" : "Set my password",
    link: input.link,
    expiry: expiryLine(input.expiryDays, locale),
    ignore: IGNORE[locale],
    footer: FOOTER[locale],
  });
}
