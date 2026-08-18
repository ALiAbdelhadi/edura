"use client";

import { useEffect, useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
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

/**
 * The center's OWN details — name, where it is, how to reach it.
 *
 * WHY THIS EXISTS: these fields were written exactly once, by the onboarding
 * wizard, and then had no writer anywhere in the product. A center that moved,
 * changed its phone, or mis-picked a district on its first day could not
 * correct any of it: the only route was re-entering the wizard through an
 * undocumented `?edit=1` URL that nothing linked to, or asking platform staff
 * to edit the row for them. `PATCH /centers/me` existed the whole time with no
 * caller.
 *
 * It sits beside the center LOGO card rather than inside the personal
 * "Profile" section on purpose: the section above is who YOU are, this is what
 * the CENTER is, and merging them makes "Name" ambiguous on the one screen
 * where both names are editable.
 *
 * OWNER ONLY, and that is the route's rule rather than this file's: the logo
 * route admits the `manager` sub-role, `PATCH /centers/me` does not (center
 * settings are one of the four hard staff exclusions in center-actor.ts). This
 * decides what to RENDER; it never decides what is permitted.
 */
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
  const { query, result } = useCustom({ url: "centers/me", method: "get" });
  const { mutateAsync: save } = useCustomMutation();

  const [form, setForm] = useState<CenterProfile | null>(null);
  const [saving, setSaving] = useState(false);

  // useCustom hands back a FROZEN placeholder object while the query is idle,
  // so `result?.data` is `{}` rather than undefined and a `??` fallback never
  // fires. Narrow on a field that only a real row has.
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
          // Empty text is sent as an empty string for the free-text fields the
          // route already accepted, and as NULL for the two location fields,
          // which are nullable columns — clearing a governorate must mean "not
          // set", not the literal empty string the area list can never match.
          phone: (form.phone ?? "").trim(),
          whatsapp: (form.whatsapp ?? "").trim(),
          address: (form.address ?? "").trim(),
          governorate: form.governorate || null,
          area: form.area || null,
          // An empty string is not a valid email, and the route's schema would
          // reject the whole request over a field the operator left blank.
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
                  // The area list is derived from the governorate, so a stale
                  // area would survive a governorate change and name a district
                  // in a governorate it does not belong to.
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
