const ALIASED_MODES = new Set(["prefer", "require", "verify-ca"]);

export function pinSslMode(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString;
  }

  if (url.searchParams.has("uselibpqcompat")) return connectionString;

  const mode = url.searchParams.get("sslmode");
  if (!mode || !ALIASED_MODES.has(mode.toLowerCase())) return connectionString;

  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
