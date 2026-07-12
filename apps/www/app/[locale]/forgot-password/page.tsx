"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, Button, Input, Form, Alert, Result } from "antd";
import { MailOutlined, ArrowLeftOutlined } from "@ant-design/icons";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email) {
      setError("Please enter your email address");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message || "Failed to send reset link");
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div style={{ minHeight: "100vh", background: "#f4f5f7", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <Result
            status="success"
            title="Check your email"
            subTitle={`If an account exists for ${email}, we've sent a password reset link. It expires in 1 hour.`}
            extra={<Link href="/login"><Button type="primary">Back to sign in</Button></Link>}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f7", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/edura-logo.svg" alt="Edura" style={{ height: 90, width: "auto", margin: "0 auto 16px" }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1c1c1e", marginBottom: 4 }}>Forgot password?</h1>
          <p style={{ fontSize: 14, color: "#a5a8b5" }}>Enter your email and we&apos;ll send you a reset link.</p>
        </div>

        <Card>
          <Form layout="vertical" onFinish={handleSubmit}>
            {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}
            <Form.Item label="Email">
              <Input
                prefix={<MailOutlined style={{ color: "#a5a8b5" }} />}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                size="large"
                autoFocus
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              Send reset link
            </Button>
          </Form>
        </Card>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Link href="/login" style={{ color: "#0fa5e9", fontSize: 14 }}>
            <ArrowLeftOutlined /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
