"use client";

import { Spinner } from "@/components/kit/spinner";
import { StatusBadge } from "@/components/kit/status-badge";
import { Link, useRouter } from "@/i18n/navigation";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";
import dayjs from "dayjs";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Info,
  SearchX,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";

type Affiliation = {
  id?: string;
  status: "pending" | "active" | "declined" | "expired" | "removed";
  expiresAt?: string;
  invitedAt?: string;
  center?: { name?: string; shortId?: string };
};

type Me = { id: string; role: string; name?: string };

const RESULT_TONE: Record<"success" | "warning" | "info" | "neutral", string> =
{
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/15 text-info",
  neutral: "bg-muted text-muted-foreground",
};

function ResultCard({
  icon: Icon,
  tone,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  tone: "success" | "warning" | "info" | "neutral";
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-4 text-center">
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-full",
            RESULT_TONE[tone],
          )}
        >
          <Icon className="size-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

export default function AffiliationLandingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations();
  const { formatDate } = useFormatters();

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
            : (affBody.data?.items ?? []);
          const found = list.find((a) => (a.id) === id) ?? null;
          if (!cancelled) setAffiliation(found);
        }
      } catch {
        if (!cancelled) setError(t("affiliationInvite.loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  const handleAction = async (action: "accept" | "decline") => {
    setActing(action);
    setError(null);
    try {
      const res = await fetch(`/api/v1/affiliations/${id}/${action}`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        let msg = t("common.requestFailed");
        try {
          const body = await res.json();
          msg = body?.error?.message ?? msg;
        } catch {
        }
        setError(msg);
        return;
      }
      setDone(action === "accept" ? "accepted" : "declined");
    } catch {
      setError(t("common.genericError"));
    } finally {
      setActing(null);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen items-center justify-center bg-muted p-6">
      <div className="w-full max-w-120">{children}</div>
    </div>
  );

  if (loading) {
    return shell(
      <Card>
        <CardContent className="flex items-center justify-center gap-2 text-muted-foreground">
          <Spinner />
          <span>{t("common.loading")}</span>
        </CardContent>
      </Card>,
    );
  }

  if (!me) {
    const returnUrl = `/affiliations/${id}`;
    return shell(
      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-foreground">
            {t("affiliationInvite.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("affiliationInvite.signInPrompt")}
          </p>
          <Button asChild size="lg" className="w-full">
            <Link href={`/login?next=${encodeURIComponent(returnUrl)}`}>
              {t("affiliationInvite.signInToContinue")}
            </Link>
          </Button>
        </CardContent>
      </Card>,
    );
  }

  if (me.role !== "teacher") {
    return shell(
      <ResultCard
        icon={AlertTriangle}
        tone="warning"
        title={t("affiliationInvite.wrongAccountTitle")}
        description={t("affiliationInvite.wrongAccountSubtitle", {
          role: t(("roles." + me.role) as Parameters<typeof t>[0]),
        })}
        action={
          <Button asChild variant="outline">
            <Link
              href={`/login?next=${encodeURIComponent(`/affiliations/${id}`)}`}
            >
              {t("affiliationInvite.signInAsTeacher")}
            </Link>
          </Button>
        }
      />,
    );
  }

  if (done) {
    return shell(
      <ResultCard
        icon={CheckCircle2}
        tone="success"
        title={
          done === "accepted"
            ? t("affiliationInvite.acceptedTitle")
            : t("affiliationInvite.declinedTitle")
        }
        description={
          done === "accepted"
            ? t("affiliationInvite.acceptedSubtitle")
            : t("affiliationInvite.declinedSubtitle")
        }
        action={
          <Button onClick={() => router.push("/dashboard/teacher")}>
            {t("affiliationInvite.goToDashboard")}
          </Button>
        }
      />,
    );
  }

  if (!affiliation) {
    return shell(
      <ResultCard
        icon={SearchX}
        tone="neutral"
        title={t("affiliationInvite.notFoundTitle")}
        description={t("affiliationInvite.notFoundSubtitle")}
        action={
          <Button onClick={() => router.push("/dashboard/teacher")}>
            {t("affiliationInvite.goToDashboard")}
          </Button>
        }
      />,
    );
  }

  if (affiliation.status !== "pending") {
    return shell(
      <ResultCard
        icon={Info}
        tone="info"
        title={t("affiliationInvite.statusTitle", {
          status: t(
            ("status." + affiliation.status) as Parameters<typeof t>[0],
          ),
        })}
        description={
          affiliation.status === "active"
            ? t("affiliationInvite.alreadyAffiliated")
            : t("affiliationInvite.noActionNeeded")
        }
        action={
          <Button onClick={() => router.push("/dashboard/teacher")}>
            {t("affiliationInvite.goToDashboard")}
          </Button>
        }
      />,
    );
  }

  const expiresAt = affiliation.expiresAt ? dayjs(affiliation.expiresAt) : null;
  const expired = expiresAt ? expiresAt.isBefore(dayjs()) : false;

  return shell(
    <Card>
      <CardContent className="flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            {t("affiliationInvite.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.rich("affiliationInvite.signedInAs", {
              name: me.name ?? me.id,
              b: (c) => <b className="font-semibold text-foreground">{c}</b>,
            })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Building2 className="size-6 text-info" />
          <div>
            <div className="text-base font-semibold text-foreground">
              {affiliation.center?.name ?? t("affiliationInvite.unknownCenter")}
            </div>
            {affiliation.center?.shortId && (
              <div className="text-xs text-muted-foreground">
                #{affiliation.center.shortId}
              </div>
            )}
          </div>
        </div>

        {expiresAt && (
          <div>
            <StatusBadge tone={expired ? "danger" : "info"}>
              {expired
                ? t("affiliationInvite.expired", {
                  date: formatDate(affiliation.expiresAt),
                })
                : t("affiliationInvite.expires", {
                  date: formatDate(affiliation.expiresAt),
                })}
            </StatusBadge>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            size="lg"
            disabled={acting !== null || expired}
            onClick={() => handleAction("accept")}
          >
            {acting === "accept" ? <Spinner /> : <Check className="size-4" />}
            {t("affiliationInvite.accept")}
          </Button>
          <Button
            variant="destructive"
            size="lg"
            disabled={acting !== null}
            onClick={() => handleAction("decline")}
          >
            {acting === "decline" ? <Spinner /> : <X className="size-4" />}
            {t("affiliationInvite.decline")}
          </Button>
        </div>
      </CardContent>
    </Card>,
  );
}
