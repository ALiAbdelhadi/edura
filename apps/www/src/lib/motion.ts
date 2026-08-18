/**
 * The motion contract.
 *
 * ONE material idea: a ledger comes pre-ruled, and what a bookkeeper adds is
 * INK. So the page's rules and sheets are static furniture, and the only
 * things that move are the things a hand actually adds —
 *
 *   الترحيل  posting   a figure tots up into place
 *   الخط     striking  the total rule is drawn under a column
 *   الختم    pressing  the seal lands once, at the end
 *   الكعب    the spine the reader draws it by scrolling
 *
 * Everything else on this page is printed, and printed things do not animate.
 * That is what keeps this from becoming a fade-up on every section.
 */

/** Durations, in seconds — GSAP's unit. */
export const D = {
  /** immediate feedback */
  tap: 0.12,
  /** routine state change */
  state: 0.24,
  /** one line of ink arriving */
  ink: 0.5,
  /** a figure totting up */
  post: 0.55,
  /** the total, which is slower because it is the answer */
  total: 0.75,
  /** the seal drawing before it presses */
  draw: 0.9,
} as const;

/**
 * Exponential deceleration for arrivals — the confident-arrival curve, not a
 * bounce. `expo.out` is GSAP's name for the same shape as
 * `cubic-bezier(0.16, 1, 0.3, 1)` in the token sheet, so the CSS transitions
 * and the GSAP timelines share one feel rather than two that look close.
 */
export const E = {
  arrive: "expo.out",
  strike: "power3.out",
  press: "power2.out",
} as const;

/** Stagger between siblings that genuinely appear as a list. Capped by count. */
export const STAGGER = 0.055;

/**
 * ARABIC IS A CONNECTED SCRIPT — SPLIT ON WORDS, NEVER ON CHARACTERS.
 *
 * Per-character spans sever the joins between letters, so كل renders as two
 * disconnected isolated forms. It fails silently and looks like a font bug,
 * which is exactly how the mono-face trap fails too. This helper is the only
 * splitter in the app and it has no character mode to reach for.
 *
 * The split runs on the SERVER, at render, so the words ship in the HTML.
 * Splitting on the client after hydration flashes the unsplit line first and
 * then reflows it.
 */
export function splitWords(text: string): string[] {
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

/**
 * Counts a figure up to its final value.
 *
 * Formats with the SAME grouping and decimal count as the target string, so a
 * tabular column never changes width mid-count — the whole reason figures are
 * mono and tabular in the first place. A leading minus is preserved: a
 * deduction that counts up from a bare zero briefly reads as income.
 */
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
