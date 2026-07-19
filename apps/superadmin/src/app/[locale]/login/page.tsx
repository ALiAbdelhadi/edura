"use client";

import { useLogin } from "@refinedev/core";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export default function LoginPage() {
  const { mutate: login, isPending } = useLogin();
  const t = useTranslations();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    login(
      { email, password },
      {
        onSuccess: (result) => {
          if (!result.success) {
            setError(t("auth.invalidCredentialsBackoffice"));
          }
        },
      },
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="size-6 text-primary" />
          </div>
          <CardTitle className="text-xl">{t("auth.backofficeTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("auth.backofficeSubtitle")}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? t("auth.signingIn") : t("auth.signInTitle")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
