/**
 * RTL-aware animation primitives.
 *
 * THE PROBLEM THIS SOLVES
 * ----------------------------------------------------------------------------
 * GSAP's `x` is a physical axis: `x: -100` is 100px toward the *left of the
 * screen*, in every locale. Arabic reads right-to-left, so a reveal written as
 * "slide in from the start edge" and implemented as `x: -100` slides in from
 * the END edge in Arabic — the element enters from where the eye is leaving.
 * The same inversion applies to horizontal pins, filmstrips, and any
 * `xPercent` scroll translation.
 *
 * Arabic is this product's PRIMARY language (CONSTITUTION.md §6), so the
 * mirrored case is not an edge case to patch afterwards; it is the default
 * case. Hence: no scene may write a raw `x`/`xPercent` value. It asks for a
 * logical direction and gets a physical one back.
 *
 * WHAT DOES NOT MIRROR
 * ----------------------------------------------------------------------------
 * Deliberate exceptions, all inherited from CONSTITUTION.md §6.4:
 *   - the seal's `rotate(-6deg)` — a stamp does not mirror when you turn the
 *     page around;
 *   - a time axis in a chart — a time series is read as a shape, and mirroring
 *     it inverts the meaning of "rising";
 *   - `--lift` shadows — directional light.
 * Use `PHYSICAL` for these, so the intent is visible at the call site rather
 * than being an omission someone later "fixes".
 */

export type LogicalDirection = "start" | "end";

/** +1 when the start edge is on the left (LTR), -1 when it is on the right (RTL). */
export function directionFactor(isRtl: boolean): 1 | -1 {
  return isRtl ? -1 : 1;
}

/**
 * Translate a logical offset into GSAP's physical `x`.
 *
 * `logicalX(40, "start", isRtl)` means "40px toward the start edge" — which is
 * `-40` in English and `+40` in Arabic.
 */
export function logicalX(
  distance: number,
  from: LogicalDirection,
  isRtl: boolean,
): number {
  const towardStart = from === "start" ? -1 : 1;
  // `|| 0` collapses -0 to 0. Two sign flips over a zero distance otherwise
  // yield -0, which is harmless to GSAP but leaks into assertions and logs as
  // a phantom difference between the two directions.
  return distance * towardStart * directionFactor(isRtl) || 0;
}

/** The same, for percentage translations (filmstrips, horizontal pins). */
export function logicalXPercent(
  percent: number,
  from: LogicalDirection,
  isRtl: boolean,
): number {
  return logicalX(percent, from, isRtl);
}

/**
 * Marks a value as intentionally physical — it will NOT mirror in RTL.
 * Identity at runtime; it exists so the call site reads as a decision.
 */
export const PHYSICAL = <T>(value: T): T => value;

/**
 * Horizontal travel for a pinned filmstrip: how far the TRACK moves as the
 * user scrolls through the pin.
 *
 * The track is `flex-direction: row`, which the browser already mirrors under
 * `dir="rtl"` — item 1 sits at the right in Arabic and at the left in English.
 * Either way, revealing item 2 means sliding the track toward its own START
 * edge: leftward (negative x) in LTR, rightward (positive x) in RTL. Writing
 * the LTR value directly and negating it "for Arabic" is the bug this whole
 * module exists to prevent, so it is expressed logically instead.
 */
export function filmstripTravel(
  trackWidth: number,
  viewportWidth: number,
  isRtl: boolean,
): number {
  const distance = Math.max(0, trackWidth - viewportWidth);
  return logicalX(distance, "start", isRtl);
}
