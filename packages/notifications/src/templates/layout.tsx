import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import { isRtl, type Locale } from "../locale";

// =============================================================================
// The ONE email shell. Every template renders inside it.
//
// Deliberately a visual match for the table-based layout in
// @repo/server-core/mail/templates.ts (same brand navy header, same 520px white
// card, same muted footer rule) so the three invite emails still living there
// are indistinguishable from these while they wait to be ported. Porting them
// is a copy of their COPY into this shell — no design decision left to make.
//
// react-email compiles to the same inline-styled tables Gmail/Outlook need; we
// get that for free instead of hand-writing `role="presentation"` scaffolding.
// =============================================================================

export const BRAND = "#1a2f73";
export const BRAND_GLOW = "#3856e0";
const INK = "#1c2233";
const BODY_INK = "#374151";
const MUTED = "#6b7280";

const AR_FONT = "'Segoe UI', Tahoma, Arial, sans-serif";
const EN_FONT = "'Segoe UI', Helvetica, Arial, sans-serif";

export function fontFor(locale: Locale): string {
  return locale === "ar" ? AR_FONT : EN_FONT;
}

export const FOOTER_COPY = {
  ar: "هذه رسالة آلية من منصة Edura، برجاء عدم الرد عليها.",
  en: "This is an automated message from Edura. Please do not reply.",
} as const;

type LayoutProps = {
  locale: Locale;
  title: string;
  /** Inbox list preview line. Without it clients scrape the first body text. */
  preview: string;
  footer?: string;
  children: React.ReactNode;
};

export function EmailLayout({ locale, title, preview, footer, children }: LayoutProps) {
  const dir = isRtl(locale) ? "rtl" : "ltr";
  const align = isRtl(locale) ? ("right" as const) : ("left" as const);
  const font = fontFor(locale);

  return (
    <Html dir={dir} lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: 0, background: "#f4f5f9", fontFamily: font }}>
        <Container
          style={{
            maxWidth: "520px",
            margin: "24px auto 0",
            background: "#ffffff",
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid #e4e7f0",
          }}
        >
          <Section style={{ background: BRAND, padding: "24px", textAlign: "center" }}>
            <Text
              style={{
                margin: 0,
                color: "#ffffff",
                fontSize: "22px",
                fontWeight: 700,
                letterSpacing: "0.5px",
              }}
            >
              Edura
            </Text>
          </Section>

          <Section dir={dir} style={{ padding: "32px 28px", textAlign: align, color: INK }}>
            <Text
              style={{
                margin: "0 0 16px",
                fontSize: "20px",
                fontWeight: 700,
                color: INK,
                lineHeight: 1.5,
              }}
            >
              {title}
            </Text>
            {children}
          </Section>

          <Hr style={{ margin: 0, borderColor: "#eef0f6" }} />

          <Section
            dir={dir}
            style={{
              padding: "18px 28px 26px",
              textAlign: align,
              color: MUTED,
              fontSize: "12px",
              lineHeight: 1.7,
            }}
          >
            <Text style={{ margin: 0, fontSize: "12px", color: MUTED, lineHeight: 1.7 }}>
              {footer ?? FOOTER_COPY[locale]}
            </Text>
          </Section>
        </Container>

        <Text
          style={{
            margin: "16px 0 24px",
            fontSize: "11px",
            color: "#9aa1af",
            textAlign: "center",
          }}
        >
          © {new Date().getFullYear()} Edura
        </Text>
      </Body>
    </Html>
  );
}

/** Body paragraph — one style so no template invents its own line-height. */
export function P({
  children,
  muted,
  small,
}: {
  children: React.ReactNode;
  muted?: boolean;
  small?: boolean;
}) {
  return (
    <Text
      style={{
        margin: "0 0 12px",
        fontSize: small ? "13px" : "15px",
        lineHeight: small ? 1.6 : 1.8,
        color: muted ? MUTED : BODY_INK,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * CTA. A table cell carries the fill so Outlook honours the background — the
 * one place where react-email's <Button> is not enough on its own.
 *
 * `align` on a table FLOATS it, which is the only way to right-align a button
 * that Outlook also honours. The trailing clear div is therefore load-bearing,
 * not decoration: without it the next paragraph wraps around the button and
 * runs straight through it (seen in the ar receipt preview).
 */
export function Cta({ label, href, locale }: { label: string; href: string; locale: Locale }) {
  return (
    <>
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        align={isRtl(locale) ? "right" : "left"}
        style={{ margin: "24px 0" }}
      >
        <tbody>
          <tr>
            <td style={{ borderRadius: "8px", background: BRAND_GLOW }}>
              <Link
                href={href}
                style={{
                  display: "inline-block",
                  padding: "13px 30px",
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "#ffffff",
                  textDecoration: "none",
                  borderRadius: "8px",
                }}
              >
                {label}
              </Link>
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ clear: "both" }} />
    </>
  );
}

/**
 * The "if the button doesn't work" escape hatch. Corporate mail filters rewrite
 * or strip buttons often enough that a bare copyable URL is not optional.
 */
export function FallbackLink({ href, locale }: { href: string; locale: Locale }) {
  return (
    <>
      <Text style={{ margin: "8px 0 6px", fontSize: "13px", color: MUTED }}>
        {locale === "ar"
          ? "إذا لم يعمل الزر، انسخ الرابط التالي والصقه في المتصفح:"
          : "If the button doesn't work, copy and paste this link into your browser:"}
      </Text>
      <Text style={{ margin: 0, fontSize: "13px", lineHeight: 1.6, wordBreak: "break-all" }}>
        <Link href={href} style={{ color: BRAND_GLOW }}>
          {href}
        </Link>
      </Text>
    </>
  );
}

/** A closing note set off by a rule — expiry warnings, "ignore this" copy. */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        margin: "24px 0 0",
        paddingTop: "16px",
        borderTop: "1px solid #eef0f6",
        fontSize: "13px",
        lineHeight: 1.7,
        color: MUTED,
      }}
    >
      {children}
    </Text>
  );
}

/** Monospace call-out for codes people read aloud (Student ID, receipt no.). */
export function CodeBox({ value }: { value: string }) {
  return (
    <Text
      style={{
        margin: "0 0 6px",
        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        fontSize: "20px",
        letterSpacing: "2px",
        background: "#f4f5f9",
        border: "1px solid #e4e7f0",
        borderRadius: "8px",
        padding: "10px 16px",
        display: "inline-block",
        direction: "ltr",
        color: INK,
      }}
    >
      {value}
    </Text>
  );
}

/** Label/value row for the receipt table. */
export function DetailRow({
  label,
  value,
  locale,
  strong,
}: {
  label: string;
  value: string;
  locale: Locale;
  strong?: boolean;
}) {
  const dir = isRtl(locale) ? "rtl" : "ltr";
  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      width="100%"
      dir={dir}
      style={{ borderCollapse: "collapse" }}
    >
      <tbody>
        <tr>
          <td
            style={{
              padding: "9px 0",
              fontSize: "14px",
              color: MUTED,
              borderBottom: "1px solid #eef0f6",
            }}
          >
            {label}
          </td>
          <td
            style={{
              padding: "9px 0",
              fontSize: strong ? "16px" : "14px",
              fontWeight: strong ? 700 : 500,
              color: strong ? INK : BODY_INK,
              textAlign: isRtl(locale) ? "left" : "right",
              borderBottom: "1px solid #eef0f6",
              whiteSpace: "nowrap",
            }}
          >
            {value}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
