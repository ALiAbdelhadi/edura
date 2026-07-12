"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Button, Space, Alert, Tag, Result } from "antd";
import { CheckOutlined, CloseOutlined, BankOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

type Affiliation = {
  _id?: string;
  id?: string;
  status: "pending" | "active" | "declined" | "expired" | "removed";
  expiresAt?: string;
  invitedAt?: string;
  center?: { name?: string; shortId?: string };
};

type Me = { id: string; role: string; name?: string };

export default function AffiliationLandingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [affiliation, setAffiliation] = useState<Affiliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch("/api/v1/me", { credentials: "same-origin" });
        if (cancelled) return;
        if (meRes.status === 401) {
          setLoading(false);
          return;
        }
        const meBody = await meRes.json();
        const meData: Me = meBody.data;
        setMe(meData);

        if (meData.role === "teacher") {
          const affRes = await fetch("/api/v1/me/affiliations", {
            credentials: "same-origin",
          });
          const affBody = await affRes.json();
          const list: Affiliation[] = Array.isArray(affBody.data)
            ? affBody.data
            : affBody.data?.items ?? [];
          const found = list.find((a) => (a.id ?? a._id) === id) ?? null;
          if (!cancelled) setAffiliation(found);
        }
      } catch {
        if (!cancelled) setError("Could not load invitation");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleAction = async (action: "accept" | "decline") => {
    setActing(action);
    setError(null);
    try {
      const res = await fetch(`/api/v1/affiliations/${id}/${action}`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        let msg = "Request failed";
        try {
          const body = await res.json();
          msg = body?.error?.message ?? msg;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      setDone(action === "accept" ? "accepted" : "declined");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setActing(null);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f5f7",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>{children}</div>
    </div>
  );

  if (loading) {
    return shell(
      <Card>
        <div style={{ textAlign: "center", padding: 24, color: "#888" }}>Loading…</div>
      </Card>,
    );
  }

  if (!me) {
    const returnUrl = `/affiliations/${id}`;
    return shell(
      <Card>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <h2 style={{ margin: 0 }}>Teaching invitation</h2>
          <p style={{ color: "#555", margin: 0 }}>
            Please sign in as the invited teacher to respond to this invitation.
          </p>
          <Link href={`/login?next=${encodeURIComponent(returnUrl)}`}>
            <Button type="primary" block size="large">
              Sign in to continue
            </Button>
          </Link>
        </Space>
      </Card>,
    );
  }

  if (me.role !== "teacher") {
    return shell(
      <Result
        status="warning"
        title="Wrong account"
        subTitle={`Only teachers can respond to affiliation invitations — you are signed in as ${me.role}.`}
        extra={
          <Link href={`/login?next=${encodeURIComponent(`/affiliations/${id}`)}`}>
            <Button>Sign in as the invited teacher</Button>
          </Link>
        }
      />,
    );
  }

  if (done) {
    return shell(
      <Result
        status="success"
        title={done === "accepted" ? "Invitation accepted" : "Invitation declined"}
        subTitle={
          done === "accepted"
            ? "You are now affiliated with this center."
            : "Thanks for letting them know."
        }
        extra={
          <Button type="primary" onClick={() => router.push("/dashboard/teacher")}>
            Go to dashboard
          </Button>
        }
      />,
    );
  }

  if (!affiliation) {
    return shell(
      <Result
        status="404"
        title="Invitation not found"
        subTitle="This invitation may have been withdrawn, or it isn't addressed to your account."
        extra={
          <Button type="primary" onClick={() => router.push("/dashboard/teacher")}>
            Go to dashboard
          </Button>
        }
      />,
    );
  }

  if (affiliation.status !== "pending") {
    return shell(
      <Result
        status="info"
        title={`This invitation is ${affiliation.status}`}
        subTitle={
          affiliation.status === "active"
            ? "You are already affiliated with this center."
            : "No further action is needed."
        }
        extra={
          <Button type="primary" onClick={() => router.push("/dashboard/teacher")}>
            Go to dashboard
          </Button>
        }
      />,
    );
  }

  const expiresAt = affiliation.expiresAt ? dayjs(affiliation.expiresAt) : null;
  const expired = expiresAt ? expiresAt.isBefore(dayjs()) : false;

  return shell(
    <Card>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Teaching invitation</h2>
          <p style={{ color: "#888", margin: "4px 0 0" }}>
            Signed in as <b>{me.name ?? me.id}</b>
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BankOutlined style={{ fontSize: 24, color: "#0fa5e9" }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              {affiliation.center?.name ?? "Unknown center"}
            </div>
            {affiliation.center?.shortId && (
              <div style={{ fontSize: 12, color: "#888" }}>#{affiliation.center.shortId}</div>
            )}
          </div>
        </div>

        {expiresAt && (
          <div style={{ fontSize: 13, color: expired ? "#d4380d" : "#555" }}>
            {expired ? "Expired " : "Expires "}
            <Tag color={expired ? "red" : "blue"} style={{ marginLeft: 4 }}>
              {expiresAt.format("MMM D, YYYY")}
            </Tag>
          </div>
        )}

        {error && <Alert type="error" showIcon message={error} />}

        <Space style={{ width: "100%" }} size="middle">
          <Button
            type="primary"
            icon={<CheckOutlined />}
            size="large"
            loading={acting === "accept"}
            disabled={acting !== null || expired}
            onClick={() => handleAction("accept")}
          >
            Accept invitation
          </Button>
          <Button
            danger
            icon={<CloseOutlined />}
            size="large"
            loading={acting === "decline"}
            disabled={acting !== null}
            onClick={() => handleAction("decline")}
          >
            Decline
          </Button>
        </Space>
      </Space>
    </Card>,
  );
}
