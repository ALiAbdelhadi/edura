"use client";

/* <LedgerHero> — the settlement receipt writing itself.
   ══════════════════════════════════════════════════════════════════════════════

   The marketing hero. It is the product's actual arithmetic, drawn: one lesson
   at 300, the platform's 10%, the center's 25%, and what the teacher is left
   with — the same split `distributeSessionRevenue` writes to the ledger. It is
   an animation of a claim, not an ornament, which is why the figures count up
   rather than fade in: the point is that the number is DERIVED.

   ── The static frame is the source of truth ───────────────────────────────────

   The JSX renders the receipt in its FINISHED state — every figure at its final
   value, the seal stamped, the rules drawn. The timeline then animates back from
   zero. That ordering is what makes the three hard requirements fall out for
   free rather than needing three code paths:

     · Server render: the crawler and the no-JS reader get a complete receipt.
     · prefers-reduced-motion: the effect returns before building anything, and
       what is left on screen is already the final frame. No timeline, no tilt.
     · Hydration: nothing to reconcile — the markup never differs.

   ── Two scripts, and the mono trap ────────────────────────────────────────────

   The reference implementation puts the whole actor line — «باسم · سارة منير» —
   in IBM Plex Mono. Plex Mono ships NO ARABIC GLYPHS, so that text silently
   falls back to another family and the mono guarantee is lost with no visible
   error; the same is true of the header and the seal. This component splits the
   line the way the system's own rule reads: FIGURES are mono, Latin digits,
   bidi-isolated (the time, the code, the money); PROSE is the body face (the
   name, the labels, the seal word in Arabic). Same reasoning as <Eyebrow> and
   <StatusBadge>.

   Colours are read from live CSS custom properties, never copied as literals, so
   switching the theme re-paints the receipt with no rebuild and no re-run of the
   timeline. */

import { useMotion } from "@/lib/motion/motion-provider";
import { loadMotion } from "@/lib/motion/runtime";
import type { Locale } from "@/lib/i18n";
import { useEffect, useRef } from "react";

type Row = readonly [label: string, value: number];

const COPY = {
  en: {
    header: "RECEIPT",
    code: "TRX-2026-0431",
    rows: [
      ["One session", 300],
      ["Platform — 10%", -30],
      ["Center — 25%", -75],
    ] as readonly Row[],
    total: ["Teacher", 195] as Row,
    seal: "SEALED",
    actorLabel: "signed",
    actorName: "S. Mounir",
    time: "14:02",
  },
  ar: {
    header: "إيصال",
    code: "TRX-2026-0431",
    rows: [
      ["حصة واحدة", 300],
      ["المنصة — ١٠٪", -30],
      ["السنتر — ٢٥٪", -75],
    ] as readonly Row[],
    total: ["المدرّس", 195] as Row,
    seal: "مختوم",
    actorLabel: "باسم",
    actorName: "سارة منير",
    time: "14:02",
  },
} as const;

/** U+2212 MINUS SIGN, not a hyphen — this is arithmetic, not a dash. */
const fmt = (v: number) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(2);

export function LedgerHero({ locale }: { locale: Locale }) {
  const arabic = locale === "ar";
  const c = arabic ? COPY.ar : COPY.en;
  const { reduced, isRtl } = useMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    // The final frame is already on screen. Leave it there.
    if (reduced || !root) return;

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    loadMotion().then(({ gsap }) => {
      if (cancelled || !rootRef.current) return;

      const q = <T extends Element>(sel: string) =>
        Array.from(root.querySelectorAll<T>(sel));
      const one = <T extends Element>(sel: string) =>
        root.querySelector<T>(sel);

      const sheet = one<HTMLElement>("[data-sheet]");
      const content = one<HTMLElement>("[data-content]");
      const headRule = one<HTMLElement>("[data-head-rule]");
      const rows = q<HTMLElement>("[data-row]");
      const figs = q<HTMLElement>("[data-fig]");
      const l1 = one<HTMLElement>("[data-rule-1]");
      const l2 = one<HTMLElement>("[data-rule-2]");
      const totalRow = one<HTMLElement>("[data-total-row]");
      const totalFig = one<HTMLElement>("[data-total-fig]");
      const actor = one<HTMLElement>("[data-actor]");
      const seal = one<HTMLElement>("[data-seal]");
      if (!sheet || !content || !headRule || !l1 || !l2 || !totalRow || !totalFig)
        return;

      const ctx = gsap.context(() => {
        // A figure counts from 0 to the value it is ALREADY showing — the target
        // is read off the DOM, so the markup stays the single source of the
        // number and the animation cannot disagree with the static frame.
        const count = (fig: HTMLElement, duration: number) => {
          const target = Number(fig.dataset.value ?? 0);
          const o = { v: 0 };
          return gsap.to(o, {
            v: target,
            duration,
            ease: "power1.inOut",
            onUpdate: () => {
              fig.textContent = fmt(o.v);
            },
          });
        };

        const tl = gsap.timeline({
          repeat: -1,
          repeatDelay: 1.6,
          defaults: { ease: "power3.out" },
        });

        tl.fromTo(sheet, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 });
        tl.fromTo(
          content.children[0]!,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.4 },
          "-=0.25",
        );
        tl.fromTo(
          headRule,
          { scaleX: 0 },
          { scaleX: 1, duration: 0.55, ease: "power2.inOut" },
          "-=0.15",
        );

        rows.forEach((row, i) => {
          tl.fromTo(row, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45 }, "-=0.12");
          const fig = figs[i];
          if (fig) tl.add(count(fig, 0.55), "-=0.35");
        });

        tl.fromTo(l1, { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: "power2.inOut" }, "+=0.1");
        tl.fromTo(l2, { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: "power2.inOut" }, "-=0.28");
        tl.fromTo(totalRow, { opacity: 0 }, { opacity: 1, duration: 0.3 }, "-=0.1");
        tl.add(count(totalFig, 0.8), "-=0.15");
        if (actor) tl.fromTo(actor, { opacity: 0 }, { opacity: 0.9, duration: 0.4 }, "+=0.15");
        // The seal. The one motion the app itself is allowed, and the only one
        // here that is not a fade: it lands at -6°, and it lands the same way in
        // Arabic — a stamp that mirrored with the text would be a different mark.
        if (seal)
          tl.fromTo(
            seal,
            { opacity: 0, rotation: -14, scale: 1.35 },
            { opacity: 1, rotation: -6, scale: 1, duration: 0.42, ease: "expo.out" },
            "-=0.2",
          );
        tl.to(content, { opacity: 1, duration: 2.2 }); // hold
        tl.to(sheet, { opacity: 0, y: -14, duration: 0.5, ease: "power2.in" });

        // ── Pointer tilt ────────────────────────────────────────────────────
        // Fake depth, no WebGL. Rotation is NOT flipped for RTL: the sheet
        // follows the pointer, and the pointer has no reading direction.
        const onMove = (e: PointerEvent) => {
          const b = root.getBoundingClientRect();
          const nx = ((e.clientX - b.left) / b.width) * 2 - 1;
          const ny = ((e.clientY - b.top) / b.height) * 2 - 1;
          gsap.to(sheet, {
            rotationY: nx * 6,
            rotationX: -ny * 4,
            duration: 0.6,
            ease: "power2.out",
          });
        };
        const onLeave = () =>
          gsap.to(sheet, { rotationY: 0, rotationX: 0, duration: 0.9, ease: "power3.out" });

        root.addEventListener("pointermove", onMove);
        root.addEventListener("pointerleave", onLeave);

        // Off-screen the loop is invisible but still burns a frame budget on
        // every tick — and on a phone that is battery for nothing.
        const io = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) tl.play();
          else tl.pause();
        });
        io.observe(root);

        cleanup = () => {
          root.removeEventListener("pointermove", onMove);
          root.removeEventListener("pointerleave", onLeave);
          io.disconnect();
          tl.kill();
        };
      }, root);

      cleanup = ((prev) => () => {
        prev?.();
        ctx.revert();
      })(cleanup);
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [reduced, isRtl, locale]);

  // The rules draw from the START edge, which is the right edge in Arabic.
  const originStart = isRtl ? "right" : "left";

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full items-center justify-center"
      style={{ perspective: 950 }}
    >
      <div
        data-sheet
        dir={arabic ? "rtl" : "ltr"}
        className="w-[min(430px,100%)] rounded-(--radius-step-lg) border px-7 pt-[30px] pb-[26px]"
        style={{
          backgroundColor: "var(--sheet)",
          borderColor: "var(--rule)",
          boxShadow: "var(--elev-lg)",
          willChange: "transform",
        }}
      >
        <div data-content>
          {/* Header — marker, label, transaction code */}
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-[10px] w-[2px] flex-none"
              style={{ backgroundColor: "var(--gold)" }}
            />
            <span
              className={
                arabic
                  ? "text-[12px] font-bold [word-spacing:0.1em]"
                  : "num text-[10px] font-semibold tracking-[0.12em]"
              }
              style={{ color: "var(--ink-3)" }}
            >
              {c.header}
            </span>
            <span
              className="num ltr-island ms-auto text-[10px] tracking-[0.06em]"
              style={{ color: "var(--ink-3)" }}
            >
              {c.code}
            </span>
          </div>

          <div
            data-head-rule
            aria-hidden
            className="mt-[14px] mb-[4px] h-px"
            style={{
              backgroundColor: "var(--gold)",
              opacity: 0.7,
              transformOrigin: originStart,
            }}
          />

          {/* The intermediate figures. Nothing is pre-summed — every step the
              engine takes is shown, which is the whole claim. */}
          {c.rows.map(([label, value]) => (
            <div
              key={label}
              data-row
              className="flex items-baseline justify-between gap-3 py-[11px]"
              style={{ borderBottom: "1px solid var(--rule-2)" }}
            >
              <span className="text-[14.5px]" style={{ color: "var(--ink-2)" }}>
                {label}
              </span>
              <span
                data-fig
                data-value={value}
                className="num ltr-island text-[14.5px]"
                style={{ color: "var(--ink)" }}
              >
                {fmt(value)}
              </span>
            </div>
          ))}

          {/* The double rule. Drawn from --ink, never --rule: it is the mark of a
              total, and a total is not a divider. */}
          <div className="mt-[14px]" aria-hidden>
            <div
              data-rule-1
              className="h-px"
              style={{ backgroundColor: "var(--ink)", transformOrigin: originStart }}
            />
            <div
              data-rule-2
              className="mt-[2px] h-px"
              style={{ backgroundColor: "var(--ink)", transformOrigin: originStart }}
            />
          </div>

          <div
            data-total-row
            className="flex items-baseline justify-between gap-3 pt-3 pb-1"
          >
            <span className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
              {c.total[0]}
            </span>
            <span
              data-total-fig
              data-value={c.total[1]}
              className="num ltr-island text-[19px] font-semibold"
              style={{ color: "var(--ink)" }}
            >
              {fmt(c.total[1])}
            </span>
          </div>

          {/* The actor is never absent. */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <span
              data-actor
              className="flex items-baseline gap-1.5 text-[10.5px]"
              style={{ color: "var(--ink-3)", opacity: 0.9 }}
            >
              <span>{c.actorLabel}</span>
              <span aria-hidden>·</span>
              <span>{c.actorName}</span>
              <span aria-hidden>·</span>
              <span className="num ltr-island">{c.time}</span>
            </span>

            <span
              data-seal
              className={
                arabic
                  ? "inline-flex flex-none items-center rounded-(--radius-badge) px-[13px] py-[7px] text-[11px] font-bold"
                  : "num inline-flex flex-none items-center rounded-(--radius-badge) px-[13px] py-[7px] text-[10px] font-semibold tracking-[0.12em] uppercase"
              }
              style={{
                border: "1.5px solid var(--seal)",
                color: "var(--seal)",
                transform: "rotate(-6deg)",
              }}
            >
              {c.seal}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
