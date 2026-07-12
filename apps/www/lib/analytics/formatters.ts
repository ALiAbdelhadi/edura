export function formatPiastresToEGP(value: number): string {
  const egp = Math.round((value ?? 0) / 100);
  return `EGP ${egp.toLocaleString()}`;
}

export function formatShortEGP(value: number): string {
  const egp = Math.round((value ?? 0) / 100);
  if (Math.abs(egp) >= 1000) return `EGP ${(egp / 1000).toFixed(1)}k`;
  return `EGP ${egp.toLocaleString()}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value ?? 0)}%`;
}

export function formatDateLabel(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}
