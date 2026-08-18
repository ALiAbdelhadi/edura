"use client";

/**
 * THE GUIDED TOUR ENGINE — a spotlight walkthrough of a REAL portal.
 *
 * PRESENTATIONAL ON PURPOSE. Every string arrives as a prop: this package has
 * no i18n and must not gain one (same rule `bottom-nav.tsx` records), and the
 * two apps that use it resolve their copy differently — www's message files are
 * spread flat, the back office's are not. So the engine knows about geometry
 * and interaction, and each app keeps a thin wrapper that knows about words.
 *
 * It was promoted here when the back office needed the same walkthrough the six
 * www portals already had — the precedent `student-id-card` set for "a second
 * app needs this, so it moves rather than being copied".
 *
 * WHY IT NEVER BLOCKS. Skip is on every step, Esc and the backdrop both skip,
 * and a step whose anchor is missing does not stall — it renders centred
 * instead of pointing at nothing. A first-run overlay you cannot escape is the
 * single most resented onboarding pattern.
 *
 * HOW AN ANCHOR IS FOUND. `[data-tour="<id>"]`, resolved when the step opens,
 * taking the first candidate that is actually VISIBLE rather than merely
 * present — both a sidebar and a phone bar are in the DOM at once, one
 * CSS-hidden, and a 0×0 element would draw the cutout over nothing.
 *
 * THE CUTOUT is one element with a very large spread box-shadow rather than
 * four framing divs or an SVG mask: one paint, it follows the element's own
 * border radius, and it cannot leave seams at the corners.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./guided-tour.module.css";

export type TourStep = {
  /** Identifies the step's copy to the host app. */
  id: string;
  /**
   * `data-tour` value(s) to spotlight, in order of preference. Omit for a
   * centred step (welcome / finish).
   *
   * A LIST, because the same destination has a different anchor per viewport:
   * a sidebar row on a desktop, a bottom-bar slot or the "more" button on a
   * phone.
   */
  anchor?: string | string[];
};

/** The copy for one step. `how` and `note` are optional by design. */
export type TourStepContent = {
  title: string;
  body: string;
  how?: string[];
  note?: string | null;
};

export type TourLabels = {
  /** Accessible name for the overlay. */
  title: string;
  next: string;
  back: string;
  skip: string;
  finish: string;
  /** Shown when a step had to fall back to the phone's "more" button. */
  moreHint: string;
  /** Already formatted, e.g. "3 of 14". */
  progress: (done: number, total: number) => string;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const GAP = 12;

export function GuidedTour({
  steps,
  labels,
  content,
  open,
  onClose,
  rtl = false,
}: {
  steps: TourStep[];
  labels: TourLabels;
  /** Resolves a step id to its copy. */
  content: (id: string) => TourStepContent;
  open: boolean;
  /** Called on skip, finish, Esc and backdrop — all mean "do not reopen". */
  onClose: () => void;
  rtl?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  /* True when the step landed on its LAST candidate — on a phone that is the
     "more" button, which means the destination is one press further away than
     the step's own wording implies. The card says so rather than misleading. */
  const [viaFallback, setViaFallback] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index === steps.length - 1;

  /* Measure the anchor. A layout effect so the first paint of a step already
     has the cutout in the right place — a passive effect shows the spotlight at
     the previous step's position for one frame. */
  useLayoutEffect(() => {
    if (!open || !step) return;
    if (!step.anchor) {
      setRect(null);
      setViaFallback(false);
      return;
    }
    const candidates = Array.isArray(step.anchor) ? step.anchor : [step.anchor];
    let el: HTMLElement | null = null;
    let matchedLast = false;
    for (let i = 0; i < candidates.length; i++) {
      const found = document.querySelector<HTMLElement>(`[data-tour="${candidates[i]}"]`);
      if (!found) continue;
      const r = found.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      el = found;
      matchedLast = i === candidates.length - 1 && candidates.length > 1;
      break;
    }
    setViaFallback(matchedLast);
    if (!el) {
      // Degraded, not broken: the step still shows, centred.
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "auto" });

    const measure = () => {
      const r = el.getBoundingClientRect();
      const nextRect = {
        top: r.top - PAD,
        left: r.left - PAD,
        width: r.width + PAD * 2,
        height: r.height + PAD * 2,
      };
      // Only set state when the numbers actually moved. Re-setting an
      // equal-but-new object re-renders, and re-rendering re-places the card —
      // which, mid-click, moves the button out from under the pointer.
      setRect((cur) =>
        cur &&
        cur.top === nextRect.top &&
        cur.left === nextRect.left &&
        cur.width === nextRect.width &&
        cur.height === nextRect.height
          ? cur
          : nextRect,
      );
    };
    measure();

    /* CAPTURE-phase so it catches scrolling in any container the anchor sits
       inside. That also catches the card's OWN overflow scrolling, which has
       nothing to do with where the anchor is — and re-measuring on it re-renders
       the card while the reader is pressing a button inside it. */
    const onScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (target && cardRef.current?.contains(target)) return;
      measure();
    };

    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, step]);

  const finish = useCallback(() => {
    setIndex(0);
    onClose();
  }, [onClose]);

  const next = useCallback(() => {
    if (isLast) finish();
    else setIndex((i) => i + 1);
  }, [isLast, finish]);

  /* Esc skips. Focus moves into the card so a keyboard user is not left behind
     on the page underneath, which the overlay has made unreachable. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        // Reading direction, not physical: in RTL "forward" is ArrowLeft.
        const forward = rtl ? e.key === "ArrowLeft" : e.key === "ArrowRight";
        if (forward) next();
      }
    };
    window.addEventListener("keydown", onKey);
    cardRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish, next, rtl, index]);

  /* The page behind must not scroll while the overlay owns the screen. */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /**
   * PLACE THE CARD AFTER IT HAS RENDERED, not before.
   *
   * An earlier version computed `top` from a GUESSED card height. These cards
   * carry a numbered procedure and a caveat, so real heights run to ~400px —
   * and a card placed by a wrong guess puts its own buttons below the fold,
   * where they are visible, enabled, and impossible to click. So: read the
   * rendered height, then clamp into the viewport.
   */
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!open || !el) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;

    if (!rect) {
      el.style.top = `${Math.max(GAP, (window.innerHeight - h) / 2)}px`;
      el.style.left = `${window.innerWidth / 2}px`;
      el.style.transform = "translateX(-50%)";
      return;
    }

    const below = rect.top + rect.height + GAP;
    const fitsBelow = below + h + GAP <= window.innerHeight;
    const above = rect.top - GAP - h;
    const top =
      fitsBelow ? below : above >= GAP ? above : Math.max(GAP, window.innerHeight - h - GAP);

    const half = w / 2;
    const centre = rect.left + rect.width / 2;
    const left = Math.min(Math.max(centre, half + GAP), window.innerWidth - half - GAP);

    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.transform = "translateX(-50%)";
  });

  if (!open || !step) return null;

  const copy = content(step.id);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
      onClick={(e) => {
        // Backdrop only — a click inside the card must not close the tour.
        if (e.target === e.currentTarget) finish();
      }}
    >
      {rect ? (
        <div
          className={styles.spot}
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      ) : (
        <div className={styles.dim} />
      )}

      <div ref={cardRef} tabIndex={-1} className={styles.card}>
        <p className={styles.counter}>{labels.progress(index + 1, steps.length)}</p>
        <h2 className={styles.title}>{copy.title}</h2>
        <p className={styles.body}>{copy.body}</p>

        {copy.how && copy.how.length > 0 ? (
          <ol className={styles.how}>
            {copy.how.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        ) : null}

        {viaFallback ? <p className={styles.fallback}>{labels.moreHint}</p> : null}

        {copy.note ? <p className={styles.note}>{copy.note}</p> : null}

        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={next}>
            {isLast ? labels.finish : labels.next}
          </button>
          {index > 0 && !isLast ? (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              {labels.back}
            </button>
          ) : null}
          {/* Skip stays on the LAST step too — "finish" and "skip" mean the same
              thing there, and hiding it would make the final step the one place
              with no way out. */}
          <button type="button" className={styles.secondary} onClick={finish}>
            {labels.skip}
          </button>
        </div>
      </div>
    </div>
  );
}
