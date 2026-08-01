"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * The LAST-RESORT boundary: it catches errors thrown by the root layout itself,
 * which the per-route `[locale]/error.tsx` cannot — by the time that boundary
 * would render, the layout it lives inside has already failed.
 *
 * It replaces the whole document, so it must render its own <html>/<body> and
 * may NOT use anything the layout provides: no next-intl (no provider), no
 * theme variables (globals.css is imported by the layout), no @repo/ui. Hence
 * the inline styles and the hardcoded bilingual copy — this file has to work
 * when everything else did not.
 *
 * Without it, a root-layout crash is invisible to Sentry. That is what the
 * build-time "you don't have a global error handler" warning was about.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "24px",
          textAlign: "center",
          background: "#f4f5f9",
          color: "#1c2233",
          fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700 }}>حدث خطأ غير متوقع</h1>
        <p style={{ margin: 0, fontSize: "15px", color: "#6b7280", maxWidth: "420px" }}>
          نعتذر عن ذلك. حاول تحديث الصفحة — إذا استمرت المشكلة تواصل معنا.
        </p>
        <p
          dir="ltr"
          style={{ margin: 0, fontSize: "14px", color: "#6b7280", maxWidth: "420px" }}
        >
          Something went wrong. Try reloading the page.
        </p>
        {/* The digest is the ONLY identifier shown: it correlates with the
            server log and the Sentry issue without exposing the message, which
            can carry internals (M4 discipline). */}
        {error.digest ? (
          <code dir="ltr" style={{ fontSize: "12px", color: "#9aa1af" }}>{error.digest}</code>
        ) : null}
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: "8px",
            padding: "10px 24px",
            fontSize: "15px",
            fontWeight: 600,
            color: "#ffffff",
            background: "#3856e0",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          إعادة المحاولة
        </button>
      </body>
    </html>
  );
}
