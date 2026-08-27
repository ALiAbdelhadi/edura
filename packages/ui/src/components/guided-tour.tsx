"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./guided-tour.module.css";

export type TourStep = {
  id: string;
  anchor?: string | string[];
};

export type TourStepContent = {
  title: string;
  body: string;
  how?: string[];
  note?: string | null;
};

export type TourLabels = {
  title: string;
  next: string;
  back: string;
  skip: string;
  finish: string;
  moreHint: string;
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
  content: (id: string) => TourStepContent;
  open: boolean;
  onClose: () => void;
  rtl?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viaFallback, setViaFallback] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index === steps.length - 1;

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const forward = rtl ? e.key === "ArrowLeft" : e.key === "ArrowRight";
        if (forward) next();
      }
    };
    window.addEventListener("keydown", onKey);
    cardRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish, next, rtl, index]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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
          <button type="button" className={styles.secondary} onClick={finish}>
            {labels.skip}
          </button>
        </div>
      </div>
    </div>
  );
}
