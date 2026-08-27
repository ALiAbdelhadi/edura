export function maskName(name: string | null): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return null;
  if (parts.length === 1) return `${[...first][0]}.`;
  return `${first} ${[...(parts[1] as string)][0]}.`;
}

export function maskPhone(phone: string | null): string | null {
  if (!phone || phone.length < 4) return null;
  return `${"•".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}
