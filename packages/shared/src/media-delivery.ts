// The one place that names the media provider's delivery host(s). Swapping the
// provider changes this file and the URL builder in @repo/ui/lib/media.
export const MEDIA_DELIVERY_HOSTS = ["res.cloudinary.com"] as const;

export const MEDIA_DELIVERY_HOST: string = MEDIA_DELIVERY_HOSTS[0];

export const MEDIA_IMG_SRC = MEDIA_DELIVERY_HOSTS.map((h) => `https://${h}`).join(" ");

export function isPlatformMediaUrl(url: string): boolean {
  return MEDIA_DELIVERY_HOSTS.some((h) => url.startsWith(`https://${h}/`));
}

export function mediaImageRemotePatterns(account: string | undefined) {
  return MEDIA_DELIVERY_HOSTS.map((hostname) => ({
    protocol: "https" as const,
    hostname,
    pathname: `/${account || "cloud-name-unset"}/**`,
  }));
}
