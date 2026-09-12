import { PublicProfileScreen } from "@/features/public-profile/public-profile-screen";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/i18n";
import { publicProfilePath } from "@/lib/public-site/host";
import { resolvePublicProfile } from "@/lib/services/public-handles/public-profiles";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// /p/<handle> — and, once PUBLIC_ROOT_DOMAIN exists, <handle>.<root> is
// rewritten here by src/proxy.ts. The path form stays canonical for search
// engines until the wildcard DNS is real.

type Params = { locale: string; handle: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, handle } = await params;
  const profile = await resolvePublicProfile(handle);
  if (!profile) return { robots: { index: false, follow: false } };

  const t = await getTranslations({ locale: locale as Locale, namespace: "publicProfile" });
  const description =
    profile.kind === "center"
      ? t("metaCenter", { name: profile.name })
      : t("metaTeacher", { name: profile.name });
  const image = profile.kind === "center" ? profile.logoUrl : profile.photoUrl;
  const canonical = publicProfilePath(locale, profile.handle ?? handle);

  return {
    title: profile.name,
    description,
    alternates: {
      canonical,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, publicProfilePath(l, profile.handle ?? handle)]),
      ),
    },
    openGraph: {
      title: profile.name,
      description,
      type: "profile",
      ...(image ? { images: [{ url: image }] } : {}),
    },
  };
}

export default async function PublicProfilePage({ params }: { params: Promise<Params> }) {
  const { locale, handle } = await params;
  setRequestLocale(locale as Locale);
  const profile = await resolvePublicProfile(handle);
  if (!profile) notFound();
  return <PublicProfileScreen profile={profile} locale={locale as Locale} />;
}
