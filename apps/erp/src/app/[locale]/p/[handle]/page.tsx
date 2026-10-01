import { PublicProfileScreen } from "@/features/public-profile/public-profile-screen";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/i18n";
import { publicProfilePath } from "@/lib/public-site/host";
import { serviceGet } from "@/lib/server/service-fetch";
import type { PublicProfile } from "@repo/server-core/services/public-handles/public-profiles";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Params = { locale: string; handle: string };

// The editor gate (publicProfileForRequest) runs in the service on the
// forwarded cookie; the route answers 404 where the gate answered null. Course
// dates cross as ISO strings; the screen renders none of them.
async function profileForRequest(handle: string): Promise<PublicProfile | null> {
  const res = await serviceGet<PublicProfile>(`/api/v1/public/profiles/${encodeURIComponent(handle)}`);
  return res.data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, handle } = await params;
  const profile = await profileForRequest(handle);
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
  const profile = await profileForRequest(handle);
  if (!profile) notFound();
  return <PublicProfileScreen profile={profile} locale={locale as Locale} />;
}
