"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Card, Button, Input, Form, Alert, Space } from "antd";
import { MailOutlined, LockOutlined, LoginOutlined } from "@ant-design/icons";

function isSafeNext(value: string | null): value is string {
  return !!value && value.startsWith("/") && !value.startsWith("//");
}

const QUICK_LOGINS = [
  { label: "Admin", email: "admin@nile-academy.eg", color: "#7a3b00", light: "#ffe6cd" },
  { label: "Teacher", email: "hossam.aziz@nile-academy.eg", color: "#187574", light: "#c3faf5" },
  { label: "Student", email: "lina.hassan@student.nile-academy.eg", color: "#5b76fe", light: "#eef1ff" },
  { label: "Parent", email: "mona.hassan@email.eg", color: "#6b0050", light: "#ffd8f4" },
];

const ROLE_MAP: Record<string, string> = {
  center_admin: "admin",
  teacher: "teacher",
  student: "student",
  parent: "parent",
};

export default function LoginPage() {
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const next = isSafeNext(nextParam) ? nextParam : "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doLogin = async (loginEmail?: string, loginPassword?: string) => {
    const em = loginEmail ?? email;
    const pw = loginPassword ?? password;
    if (!em || !pw) {
      setError("Please enter email and password");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await signIn("credentials", {
        email: em,
        password: pw,
        redirect: false,
      });
      if (result?.error) {
        setError("Invalid email or password");
        setLoading(false);
        return;
      }
      // Fetch user info to store role in localStorage for quick redirects
      try {
        const meRes = await fetch("/api/v1/me");
        if (meRes.ok) {
          const meJson = await meRes.json();
          const userData = meJson.data;
          const uiRole = ROLE_MAP[userData.role] ?? userData.role;
          localStorage.setItem(
            "edura_state",
            JSON.stringify({ role: uiRole, screen: "dashboard", name: userData.name, email: userData.email }),
          );
        }
      } catch { /* non-critical, dashboard will figure it out */ }
      window.location.href = next;
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (loginEmail: string) => {
    setEmail(loginEmail);
    setPassword("Passw0rd!");
    doLogin(loginEmail, "Passw0rd!");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f5f7",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/edura-logo.svg" alt="Edura" style={{ height: 90, width: "auto", margin: "0 auto 16px" }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1c1c1e", marginBottom: 4 }}>Sign in</h1>
          <p style={{ fontSize: 14, color: "#a5a8b5" }}>Nile Educational Academy</p>
        </div>

        <Card style={{ marginBottom: 16 }}>
          <Form layout="vertical" onFinish={() => doLogin()}>
            {error && (
              <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />
            )}
            <Form.Item label="Email">
              <Input
                prefix={<MailOutlined style={{ color: "#a5a8b5" }} />}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                size="large"
              />
            </Form.Item>
            <Form.Item label="Password">
              <Input.Password
                prefix={<LockOutlined style={{ color: "#a5a8b5" }} />}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                size="large"
              />
            </Form.Item>
            <div style={{ textAlign: "right", marginTop: -8, marginBottom: 16 }}>
              <Link href="/forgot-password" style={{ color: "#0fa5e9", fontSize: 13 }}>
                Forgot password?
              </Link>
            </div>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loading}
              icon={<LoginOutlined />}
            >
              Sign in
            </Button>
          </Form>
        </Card>

        <Card>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#a5a8b5", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
            Quick demo login
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {QUICK_LOGINS.map(({ label, email: qEmail, color, light }) => (
              <button
                key={label}
                type="button"
                onClick={() => handleQuickLogin(qEmail)}
                disabled={loading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #e0e2e8",
                  fontSize: 14,
                  fontWeight: 500,
                  color,
                  background: "#fff",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.5 : 1,
                  transition: "background 0.15s",
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    flexShrink: 0,
                    background: light,
                    color,
                  }}
                >
                  {label[0]}
                </span>
                {label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "#c7cad5", marginTop: 12, textAlign: "center" }}>
            All demo accounts use <code style={{ fontFamily: "monospace" }}>Passw0rd!</code>
          </p>
        </Card>

        <div style={{ textAlign: "center", fontSize: 14, color: "#666", marginTop: 16 }}>
          Don&apos;t have an account?{" "}
          <Link href="/register" style={{ color: "#0fa5e9", fontWeight: 500 }}>
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
