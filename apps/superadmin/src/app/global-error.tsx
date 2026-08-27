"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

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
