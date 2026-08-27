export const D = {
  tap: 0.12,
  state: 0.24,
  ink: 0.5,
  post: 0.55,
  total: 0.75,
  draw: 0.9,
} as const;

export const E = {
  arrive: "expo.out",
  strike: "power3.out",
  press: "power2.out",
} as const;

export const STAGGER = 0.055;

export function splitWords(text: string): string[] {
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

export function makeCounter(target: string) {
  const negative = target.trimStart().startsWith("−") || target.trimStart().startsWith("-");
  const digits = target.replace(/[^\d.]/g, "");
  const value = Number.parseFloat(digits);
  const decimals = digits.includes(".") ? digits.split(".")[1]!.length : 0;
  const grouped = target.includes(",");

  if (!Number.isFinite(value)) return null;

  return {
    value,
    render(current: number) {
      const body = grouped
        ? current.toLocaleString("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        : current.toFixed(decimals);
      return negative ? `−${body}` : body;
    },
  };
}
