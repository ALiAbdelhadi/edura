// The rules for a public handle, shared by the API (server), the settings
// card (client) and the host resolver in src/proxy.ts. Pure: no database,
// no environment. The database repeats the SHAPE rule as a CHECK
// (migration 20260911120000_public_handles) so a row that is not a valid
// hostname label cannot exist whoever wrote it; the RESERVED list lives only
// here, because it changes with the platform's own hostnames, not with the
// data.

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 40;

// One DNS label: lowercase a-z, 0-9, single hyphens; no leading/trailing hyphen.
export const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

// Names the platform itself uses or may use as a hostname, plus the ones
// that would let a tenant impersonate the platform. Neither a centre nor a
// teacher may take any of these.
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "www", "app", "api", "erp", "admin", "superadmin", "staff", "finance",
  "mail", "smtp", "imap", "pop", "mx", "ns1", "ns2", "dns", "ftp", "cdn",
  "static", "assets", "media", "img", "images", "files", "upload", "uploads",
  "realtime", "ws", "socket", "ingest", "status", "health", "metrics",
  "dev", "test", "staging", "preview", "demo", "sandbox", "beta", "alpha",
  "login", "logout", "register", "signup", "signin", "auth", "oauth", "sso",
  "account", "accounts", "billing", "pay", "payments", "paymob", "wallet",
  "support", "help", "docs", "blog", "news", "about", "contact", "legal",
  "terms", "privacy", "security", "abuse", "postmaster", "webmaster",
  "hostmaster", "root", "system", "internal", "vercel", "edura",
  "center", "centers", "teacher", "teachers", "student", "students",
  "parent", "parents", "p", "c", "t", "u", "me", "null", "undefined",
]);

// SECURITY_AUDIT.md (2026-09-11) DIFF-07: exact matches were not enough —
// `edura-support` or `paymob-pay` read as the platform or the payment
// provider. Anything that STARTS with one of these is refused too.
export const RESERVED_PREFIXES: readonly string[] = ["edura", "paymob", "official", "support"];

export type HandleProblem = "empty" | "too_short" | "too_long" | "shape" | "reserved";

export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

// Returns the problem, or null when the handle is acceptable. Order matters:
// a caller shows the first reason, and "reserved" only makes sense for a
// string that is otherwise a valid label.
export function handleProblem(raw: string): HandleProblem | null {
  const h = normalizeHandle(raw);
  if (!h) return "empty";
  if (h.length < HANDLE_MIN) return "too_short";
  if (h.length > HANDLE_MAX) return "too_long";
  if (!HANDLE_RE.test(h) || h.includes("--")) return "shape";
  if (RESERVED_HANDLES.has(h)) return "reserved";
  if (RESERVED_PREFIXES.some((p) => h.startsWith(p))) return "reserved";
  return null;
}

export function isValidHandle(raw: string): boolean {
  return handleProblem(raw) === null;
}

// A best-effort suggestion from a display name: Latin letters and digits
// only. An Arabic-only name yields "" and the owner types one by hand —
// transliteration guesses wrong too often to be a default.
export function suggestHandle(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, HANDLE_MAX)
    .replace(/-+$/g, "");
  return isValidHandle(s) ? s : "";
}
