"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, Button, Input, Form, Alert, Result } from "antd";
import { LockOutlined } from "@ant-design/icons";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading…</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div style={{ minHeight: "100vh", background: "#f4f5f7", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Result
          status="error"
          title="Invalid reset link"
          subTitle="This password reset link is missing or invalid. Please request a new one."
          extra={<Link href="/forgot-password"><Button type="primary">Request new link</Button></Link>}
        />
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ minHeight: "100vh", background: "#f4f5f7", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Result
          status="success"
          title="Password reset"
          subTitle="Your password has been changed successfully."
          extra={<Link href="/login"><Button type="primary">Sign in</Button></Link>}
        />
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message || "Failed to reset password");
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f7", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/edura-logo.svg" alt="Edura" style={{ height: 90, width: "auto", margin: "0 auto 16px" }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1c1c1e", marginBottom: 4 }}>Set new password</h1>
        </div>

        <Card>
          <Form layout="vertical" onFinish={handleSubmit}>
            {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}
            <Form.Item label="New password">
              <Input.Password
                prefix={<LockOutlined style={{ color: "#a5a8b5" }} />}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                size="large"
                autoFocus
              />
            </Form.Item>
            <Form.Item label="Confirm password">
              <Input.Password
                prefix={<LockOutlined style={{ color: "#a5a8b5" }} />}
                placeholder="Re-enter password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                size="large"
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              Reset password
            </Button>
          </Form>
        </Card>
      </div>
    </div>
  );
}
