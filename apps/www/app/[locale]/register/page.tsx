"use client";

import React, { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Card, Button, Input, Form, Alert, Select } from "antd";
import {
  MailOutlined,
  LockOutlined,
  UserOutlined,
  PhoneOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import ky from "ky";

type RoleOption = "student" | "parent" | "center_admin";

const ROLE_OPTIONS: { value: RoleOption; label: string; description: string }[] = [
  { value: "student", label: "Student", description: "I want to enroll in courses" },
  { value: "parent", label: "Parent", description: "I want to track my child's progress" },
  { value: "center_admin", label: "Center", description: "I want to register my tutoring center" },
];

export default function RegisterPage() {
  const [role, setRole] = useState<RoleOption>("student");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    centerName?: string;
    address?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      if (role === "center_admin") {
        await ky.post("/api/v1/auth/register/center", {
          json: {
            centerName: values.centerName?.trim() || values.name.trim(),
            adminName: values.name.trim(),
            email: values.email.trim().toLowerCase(),
            password: values.password,
            phone: values.phone?.trim() || undefined,
            address: values.address?.trim() || undefined,
            locale: "ar",
          },
        }).json();
      } else {
        await ky.post(`/api/v1/auth/register/${role}`, {
          json: {
            name: values.name.trim(),
            email: values.email.trim().toLowerCase(),
            password: values.password,
            phone: values.phone?.trim() || undefined,
            locale: "ar",
          },
        }).json();
      }

      // Auto sign-in after successful registration
      const result = await signIn("credentials", {
        email: values.email.trim().toLowerCase(),
        password: values.password,
        redirect: false,
      });

      if (result?.error) {
        // Registration succeeded but auto-login failed — send to login page
        window.location.href = "/login";
        return;
      }

      window.location.href = "/dashboard";
    } catch (err: unknown) {
      let msg = "Registration failed. Please try again.";
      try {
        const body = (await (err as { response?: Response }).response?.json()) as
          | { error?: { message?: string } }
          | undefined;
        if (body?.error?.message) msg = body.error.message;
      } catch {
        /* ignore */
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
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
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img
            src="/edura-logo.svg"
            alt="Edura"
            style={{ height: 90, width: "auto", margin: "0 auto 16px" }}
          />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1c1c1e", marginBottom: 4 }}>
            Create account
          </h1>
          <p style={{ fontSize: 14, color: "#a5a8b5" }}>Join Edura as a student, parent, or center</p>
        </div>

        <Card style={{ marginBottom: 16 }}>
          <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
            {error && (
              <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />
            )}

            <Form.Item label="I am a">
              <div style={{ display: "flex", gap: 8 }}>
                {ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRole(opt.value)}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `2px solid ${role === opt.value ? "#0fa5e9" : "#e0e2e8"}`,
                      background: role === opt.value ? "#f0f9ff" : "#fff",
                      cursor: "pointer",
                      textAlign: "center",
                      transition: "all 0.15s",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: role === opt.value ? "#0fa5e9" : "#1c1c1e",
                      }}
                    >
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 12, color: "#a5a8b5", marginTop: 2 }}>
                      {opt.description}
                    </div>
                  </button>
                ))}
              </div>
            </Form.Item>

            <Form.Item
              name="name"
              label="Full name"
              rules={[{ required: true, message: "Name is required" }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: "#a5a8b5" }} />}
                placeholder="Your full name"
                size="large"
                autoComplete="name"
              />
            </Form.Item>

            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: "Email is required" },
                { type: "email", message: "Please enter a valid email" },
              ]}
            >
              <Input
                prefix={<MailOutlined style={{ color: "#a5a8b5" }} />}
                type="email"
                placeholder="you@example.com"
                size="large"
                autoComplete="email"
              />
            </Form.Item>

            <Form.Item
              name="phone"
              label="Phone (optional)"
            >
              <Input
                prefix={<PhoneOutlined style={{ color: "#a5a8b5" }} />}
                placeholder="01xxxxxxxxx"
                size="large"
                autoComplete="tel"
              />
            </Form.Item>

            {role === "center_admin" && (
              <>
                <Form.Item
                  name="centerName"
                  label="Center name"
                  rules={[{ required: true, message: "Center name is required" }]}
                >
                  <Input
                    prefix={<UserOutlined style={{ color: "#a5a8b5" }} />}
                    placeholder="e.g. Nile Educational Academy"
                    size="large"
                  />
                </Form.Item>
                <Form.Item
                  name="address"
                  label="Address (optional)"
                >
                  <Input
                    placeholder="Center address"
                    size="large"
                  />
                </Form.Item>
              </>
            )}

            <Form.Item
              name="password"
              label="Password"
              rules={[
                { required: true, message: "Password is required" },
                { min: 8, message: "Password must be at least 8 characters" },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: "#a5a8b5" }} />}
                placeholder="At least 8 characters"
                size="large"
                autoComplete="new-password"
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label="Confirm password"
              dependencies={["password"]}
              rules={[
                { required: true, message: "Please confirm your password" },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue("password") === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error("Passwords do not match"));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: "#a5a8b5" }} />}
                placeholder="Confirm your password"
                size="large"
                autoComplete="new-password"
              />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loading}
              icon={<UserAddOutlined />}
            >
              Create account
            </Button>
          </Form>
        </Card>

        <div style={{ textAlign: "center", fontSize: 14, color: "#666" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "#0fa5e9", fontWeight: 500 }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
