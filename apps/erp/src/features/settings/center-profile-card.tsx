"use client";

import { useEffect, useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { QUERY_FRESHNESS } from "@/lib/refine";
import { Building2, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { SectionHead } from "@repo/ui/components/ledger";
import { toast } from "@repo/ui/components/sonner";
import { Combobox } from "@/components/kit/combobox";
import { Spinner } from "@/components/kit/spinner";
import { asKey } from "@/lib/i18n/keys";
import { cityOptions, governorateOptions } from "@/lib/egypt-locations";

type CenterProfile = {
  name?: string | null;
  governorate?: string | null;
  area?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
};

type Field = keyof CenterProfile;

const TEXT_FIELDS: { key: Field; label: string; dir?: "ltr" }[] = [
  { key: "phone", label: "centerProfile.phone", dir: "ltr" },
  { key: "whatsapp", label: "centerProfile.whatsapp", dir: "ltr" },
  { key: "email", label: "centerProfile.email", dir: "ltr" },
  { key: "address", label: "centerProfile.address" },
];

export function CenterProfileCard() {
  const t = useTranslations();
  const locale = useLocale();
  const { query, result } = useCustom({ url: "centers/me", method: "get", queryOptions: QUERY_FRESHNESS.list });
  const { mutateAsync: save } = useCustomMutation();

  const [form, setForm] = useState<CenterProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const server = (result as { data?: CenterProfile } | undefined)?.data;
  const loaded = Boolean(server && typeof server.name === "string");

  useEffect(() => {
    if (loaded && form === null) setForm(server as CenterProfile);
  }, [loaded, server, form]);

  const set = (key: Field, value: string | null) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const name = (form.name ?? "").trim();
    if (!name) {
      toast.error(t("centerProfile.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      await save({
        url: "centers/me",
        method: "patch",
        values: {
          name,
          phone: (form.phone ?? "").trim(),
          whatsapp: (form.whatsapp ?? "").trim(),
          address: (form.address ?? "").trim(),
          governorate: form.governorate || null,
          area: form.area || null,
          ...((form.email ?? "").trim() ? { email: (form.email ?? "").trim() } : {}),
        },
      });
      toast.success(t("centerProfile.saved"));
      query.refetch();
    } catch (err) {
      toast.error((err as Error)?.message || t("centerProfile.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionHead
        title={
          <span className="flex items-center gap-2">
            <Building2 className="size-4" aria-hidden />
            {t("centerProfile.title")}
          </span>
        }
      />
      <div className="rounded-xl border border-rule bg-sheet p-4">
        <p className="mb-4 text-[13px] text-ink-3">{t("centerProfile.subtitle")}</p>

        {form === null ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={submit}>
            <div className="grid gap-1.5">
              <Label htmlFor="cp-name">{t("centerProfile.name")}</Label>
              <Input
                id="cp-name"
                value={form.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="cp-governorate">{t("centerProfile.governorate")}</Label>
              <Combobox
                id="cp-governorate"
                options={governorateOptions(locale)}
                value={form.governorate || null}
                onChange={(v) => {
                  setForm((prev) => (prev ? { ...prev, governorate: v, area: null } : prev));
                }}
                placeholder={t("onboarding.center.governoratePlaceholder")}
                searchPlaceholder={t("onboarding.center.searchPlaceholder")}
                emptyText={t("onboarding.center.noResults")}
                clearLabel={t("onboarding.center.clear")}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="cp-area">{t("centerProfile.area")}</Label>
              <Combobox
                id="cp-area"
                options={cityOptions(form.governorate, locale)}
                value={form.area || null}
                onChange={(v) => set("area", v)}
                placeholder={
                  form.governorate
                    ? t("onboarding.center.areaPlaceholder")
                    : t("onboarding.center.areaNeedsGovernorate")
                }
                searchPlaceholder={t("onboarding.center.searchPlaceholder")}
                emptyText={t("onboarding.center.noResults")}
                clearLabel={t("onboarding.center.clear")}
                disabled={!form.governorate}
              />
            </div>

            {TEXT_FIELDS.map((f) => (
              <div key={f.key} className="grid gap-1.5">
                <Label htmlFor={`cp-${f.key}`}>{t(asKey(f.label))}</Label>
                <Input
                  id={`cp-${f.key}`}
                  dir={f.dir}
                  className={f.dir === "ltr" ? "num" : undefined}
                  value={(form[f.key] as string | null) ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </div>
            ))}

            <Button type="submit" disabled={saving} className="justify-self-start">
              {saving ? <Spinner /> : <Save className="size-4" aria-hidden />}
              {t("centerProfile.save")}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
