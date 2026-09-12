import { HANDLE_RE, RESERVED_HANDLES } from "@/lib/services/public-handles/handle-rules";

// `<handle>.<root>` → the tenant's public page. Pure and environment-free so
// src/proxy.ts (edge) and the unit suite can both use it.
//
// Dormant until PUBLIC_ROOT_DOMAIN is set (e.g. "edura.com"): without a root
// there is no way to tell a tenant label from an ordinary hostname, so every
// request is treated as the canonical host. That is the deliberate default
// while the product runs on *.vercel.app, which cannot carry a wildcard.

export function publicRootDomain(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = (env.PUBLIC_ROOT_DOMAIN ?? "").trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  return raw || null;
}

function hostnameOf(hostHeader: string | null | undefined): string {
  if (!hostHeader) return "";
  // "a.b.com:443" and IPv6 "[::1]:3000" — only the name matters.
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  return h.split(":")[0] ?? "";
}

// The one label under the root, when the request is for a tenant host:
//   handleFromHost("elmaged.edura.com", "edura.com")     → "elmaged"
//   handleFromHost("www.edura.com", "edura.com")         → null  (reserved)
//   handleFromHost("a.b.edura.com", "edura.com")         → null  (two labels)
//   handleFromHost("edura.com", "edura.com")             → null  (the root itself)
//   handleFromHost("evil-edura.com", "edura.com")        → null  (not under the root)
export function handleFromHost(
  hostHeader: string | null | undefined,
  rootDomain: string | null,
): string | null {
  if (!rootDomain) return null;
  const host = hostnameOf(hostHeader);
  const suffix = `.${rootDomain}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  if (!label || label.includes(".")) return null;
  if (!HANDLE_RE.test(label) || label.includes("--")) return null;
  if (RESERVED_HANDLES.has(label)) return null;
  return label;
}

// Where the tenant page lives on the canonical host. Used by the settings
// card (to show the owner their link) and by metadata (canonical URL).
export function publicProfilePath(locale: string, handle: string): string {
  return `/${locale}/p/${handle}`;
}

export function publicProfileUrl(opts: {
  baseUrl: string;
  locale: string;
  handle: string;
  rootDomain?: string | null;
}): string {
  // With a root domain the subdomain is the address people share; the path
  // form still resolves, and stays the canonical URL for search engines
  // until DNS exists.
  if (opts.rootDomain) return `https://${opts.handle}.${opts.rootDomain}`;
  return `${opts.baseUrl.replace(/\/+$/, "")}${publicProfilePath(opts.locale, opts.handle)}`;
}
