"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { KeyRound, CheckCircle2 } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";

/**
 * Step 7 claim landing — opened from the one-time WhatsApp link.
 * 1. signIn("walkin-token") with the URL token (no password step);
 * 2. set email + password (required for future logins);
 * 3. continue into the existing onboarding wizard.
 */
function ClaimInner() {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [phase, setPhase] = useState<"authenticating" | "credentials" | "invalid">(
    token ? "authenticating" : "invalid",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    (async () => {
      const res = await signIn("walkin-token", { token, redirect: false });
      if (res?.ok) {
        // Token may be a fresh claim or the student may somehow already have
        // credentials (shouldn't happen — provider rejects those); double-check.
        const me = await fetch("/api/v1/me").then((r) => r.json()).catch(() => null);
        if (me?.data?.hasPassword) router.replace("/onboarding");
        else setPhase("credentials");
      } else {
        setPhase("invalid");
      }
    })();
  }, [token, router]);

  const saveCredentials = async () => {
    setBusy(true);
    try {
      await api.post("me/credentials", { json: { email: email.trim(), password } });
      toast.success(t("claim.credentialsSaved"));
      router.replace("/onboarding");
    } catch (err: any) {
      toast.error(err?.message || t("claim.credentialsFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      {phase === "authenticating" ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <Spinner />
            <span>{t("claim.authenticating")}</span>
          </CardContent>
        </Card>
      ) : phase === "invalid" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("claim.invalidTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{t("claim.invalidBody")}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4" />
              {t("claim.credentialsTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("claim.credentialsBody")}</p>
            <Input
              type="email"
              dir="ltr"
              placeholder={t("claim.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              type="password"
              dir="ltr"
              placeholder={t("claim.passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              className="w-full"
              disabled={busy || !email.trim() || password.length < 8}
              onClick={saveCredentials}
            >
              {busy ? <Spinner /> : <CheckCircle2 className="size-4" />}
              {t("claim.continue")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense fallback={null}>
      <ClaimInner />
    </Suspense>
  );
}
