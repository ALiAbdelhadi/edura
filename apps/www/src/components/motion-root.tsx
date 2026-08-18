"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { D, E, STAGGER, makeCounter } from "@/lib/motion";

gsap.registerPlugin(useGSAP, ScrollTrigger, DrawSVGPlugin);

/**
 * Every timeline that is counting a figure.
 *
 * Needed because a backgrounded tab freezes rAF mid-tween, and these counts
 * are `once: true` — so a reader who switches tabs comes back to a wrong
 * number that never corrects itself. Writing the final text is not enough on
 * its own: a tween that is merely paused resumes and overwrites it on the
 * next frame. The timeline has to be RUN TO ITS END.
 */
const COUNTING = new Set<gsap.core.Timeline>();

/**
 * The page's motion, in one place.
 *
 * It renders NOTHING. Every section stays a server component and is animated
 * through `data-*` attributes it already carries, so adding motion cost the
 * page zero client components and zero hydration beyond this file.
 *
 * Everything is inside `gsap.matchMedia()`, which means under
 * `prefers-reduced-motion: reduce` not one of these tweens is even created —
 * not muted, not shortened, never constructed. The page's resting state is
 * its finished state, so nothing has to be undone.
 */
export function MotionRoot() {
  useGSAP(() => {
    const mm = gsap.matchMedia();

    mm.add(
      {
        motion: "(prefers-reduced-motion: no-preference)",
        desktop: "(min-width: 1024px)",
      },
      (context) => {
        const { motion, desktop } = context.conditions as {
          motion: boolean;
          desktop: boolean;
        };
        if (!motion) return;

        heroEntrance();
        postOnScroll();
        if (desktop) drawSpine();
        pressSeal();

        // EVERY TRIGGER MEASURED THE PAGE BEFORE THE DISPLAY FACE ARRIVED.
        //
        // The fonts load with `font-display: swap`, so Amiri lands after first
        // paint and every heading on the page changes height — which moves the
        // start and end of every ScrollTrigger built above by tens or hundreds
        // of pixels. The spine would then draw against the wrong section and
        // the nav would name the wrong one, on a cold load only, which is the
        // hardest kind of bug to catch because a warm reload hides it.
        void document.fonts?.ready.then(() => ScrollTrigger.refresh());

        /* A BACKGROUNDED TAB FREEZES A HALF-COUNTED FIGURE ON SCREEN.
           GSAP drives on rAF, which browsers throttle to a stop when the tab
           is hidden. Observed live: `/pricing` left at 56.54 with the total
           still 0.00, and because these counts are `once: true` they never
           run again — the reader comes back to a wrong number that never
           corrects itself. On a site whose whole argument is that its figures
           are right, that is the worst possible failure.

           The final value already ships in `data-count`, so the repair is to
           write it: any figure that is mid-count when the page goes away is
           snapped to the truth. */
        const settleFigures = () => {
          if (!document.hidden) return;
          // End the timelines first — a tween left running would overwrite
          // whatever we wrote on its next frame — then belt-and-braces the
          // text from `data-count`, which is the value that shipped.
          for (const timeline of COUNTING) timeline.progress(1);
          for (const el of document.querySelectorAll<HTMLElement>("[data-count]")) {
            if (el.dataset.count && el.textContent !== el.dataset.count) {
              el.textContent = el.dataset.count;
            }
          }
        };
        /* A TAB CAN BE BORN HIDDEN — ⌘-click, "open in new tab", a crawler,
           a screenshot service. There is no `visibilitychange` in that case
           because nothing CHANGED, so the entrance sits frozen at opacity 0
           and the headline is simply not there until the tab is focused.
           Land it immediately instead: the reader gets the finished page, and
           the animation was only ever worth having for someone watching. */
        if (document.hidden) settleFigures();

        document.addEventListener("visibilitychange", settleFigures);
        // The cleanup is what this callback RETURNS — `context.add()` runs a
        // function inside the context, it does not register a teardown.
        return () => document.removeEventListener("visibilitychange", settleFigures);
      },
    );

    return () => {
      COUNTING.clear();
      mm.revert();
    };
  });

  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   الترحيل — posting a figure

   A figure does not fade in. It tots up, the way an adding machine lands on
   a total. The digits are tabular and the counter formats to the SAME
   decimal count as the target, so the column never changes width mid-count —
   which is the entire reason the figures are mono in the first place.
   ══════════════════════════════════════════════════════════════════════════ */

function tweenCount(el: HTMLElement, timeline: gsap.core.Timeline, position?: number | string) {
  const target = el.dataset.count ?? el.textContent ?? "";
  const counter = makeCounter(target);
  if (!counter) return;

  const box = { value: 0 };

  timeline.to(
    box,
    {
      value: counter.value,
      /* ZERO IT WHEN THE COUNT STARTS, NOT WHEN THE TIMELINE IS BUILT.
         A scroll-triggered timeline is built on load but runs when reached,
         so zeroing at build time left every figure below the fold reading
         0.00 — and on a phone the money section's figures are ON SCREEN well
         before their trigger fires. A visible 0.00 is a wrong number, and
         this site's whole argument is that its numbers are right. The value
         that ships in the HTML now stands until the count actually begins. */
      onStart: () => {
        el.textContent = counter.render(0);
      },
      duration: el.hasAttribute("data-total") ? D.total : D.post,
      ease: E.arrive,
      onUpdate: () => {
        el.textContent = counter.render(box.value);
      },
      // A tween interrupted mid-count would leave a half-posted figure on
      // screen — a wrong number, on a page whose whole argument is that its
      // numbers are right.
      onInterrupt: () => {
        el.textContent = counter.render(counter.value);
      },
    },
    position,
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The hero: one lesson, settled — the page's single authored sequence
   ══════════════════════════════════════════════════════════════════════════ */

function heroEntrance() {
  /* THE REGISTER IS ONLY THE HERO'S WHEN IT IS IN THE HERO.
     `/pricing` reuses the same component far down the page. Zeroing its
     figures at build time and counting them as a LOAD animation left every
     one of them reading 0.00 by the time a reader scrolled to it — on the one
     page whose entire argument is the arithmetic. Anywhere but the first
     section it is an ordinary scroll-posted figure, handled below. */
  const register = document.querySelector<HTMLElement>(
    "main > section:first-of-type [data-register]",
  );
  // The page has exactly one `h1`, and `Ink` is the only thing that emits
  // `[data-ink-word]`. Querying the h1 directly is what makes this correct;
  // an invented `[data-hero-headline]` wrapper that nothing renders would
  // match zero elements and skip the headline in silence.
  const words = gsap.utils.toArray<HTMLElement>("h1 [data-ink-word]");

  const timeline = gsap.timeline({ defaults: { ease: E.arrive } });
  COUNTING.add(timeline);

  // The headline inks in word by word. Capped stagger: a long Arabic headline
  // must not push the register's first row past a second.
  if (words.length) {
    timeline.from(words, {
      opacity: 0,
      y: 16,
      duration: D.ink,
      stagger: { each: STAGGER, amount: Math.min(words.length * STAGGER, 0.45) },
    });
  }

  // The role pages have a headline but no register. The guard sits HERE, not
  // above the headline tween — putting it first is what would silently stop
  // the only line those pages animate.
  if (!register) {
    timeline.eventCallback("onComplete", () => {
      document.documentElement.dataset.motionSettled = "";
    });
    return;
  }

  // Reaching here means the register IS the hero's — the selector above only
  // matches one in the first section. So this whole sequence is a LOAD
  // animation for something the reader is already looking at, and a register
  // anywhere else on the page is left to `postOnScroll` below.
  timeline.from(
    register.querySelectorAll("[data-register-head] > *"),
    { opacity: 0, y: 8, duration: D.ink, stagger: 0.06 },
    0.25,
  );

  // Each row: its label arrives, then its figure posts. Rows are a genuine
  // list — a settlement IS read top to bottom — so a stagger is the honest
  // shape here rather than a reflex.
  const rows = gsap.utils.toArray<HTMLElement>("[data-register] [data-row]");
  rows.forEach((row, i) => {
    const at = 0.42 + i * 0.13;
    timeline.from(row.querySelector("[data-row-label]"), { opacity: 0, x: 10, duration: D.ink }, at);
    const figure = row.querySelector<HTMLElement>("[data-figure]");
    if (figure) tweenCount(figure, timeline, at + 0.05);
  });

  // الخط — the rule struck under the column. In a pre-ruled ledger this is
  // the ONE line a bookkeeper draws by hand, which is why it is the only
  // rule on this page that animates. It strikes along the reading axis:
  // `transform-origin` is set in CSS and flips with `dir`.
  const strike = register.querySelector<HTMLElement>("[data-total-rule]");
  if (strike) {
    timeline.from(strike, { scaleX: 0, duration: 0.42, ease: E.strike }, 0.42 + rows.length * 0.13);
  }

  const total = register.querySelector<HTMLElement>("[data-total-figure]");
  if (total) tweenCount(total, timeline, 0.42 + rows.length * 0.13 + 0.12);

  // A settled flag, so a screenshot tool can wait for the sequence instead of
  // sleeping a guessed number of milliseconds. Guessing produced a shipped
  // capture of the hero reading 83.33 — a figure that was true for one frame
  // and wrong on paper.
  timeline.eventCallback("onComplete", () => {
    document.documentElement.dataset.motionSettled = "";
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   Figures further down the page post as they are reached
   ══════════════════════════════════════════════════════════════════════════ */

function postOnScroll() {
  const hero = document.querySelector("main > section:first-of-type [data-register]");

  gsap.utils
    // `[data-count]`, not `[data-figure]`: a TOTAL carries the count but not
    // the line-item marker, and off the landing there is no hero timeline to
    // post it. Missing it is what left `/pricing` showing 0.00.
    .toArray<HTMLElement>("[data-count]")
    .filter((el) => !hero || !hero.contains(el))
    .forEach((el) => {
      const timeline = gsap.timeline({
        /* `top bottom`, NOT `top 88%`.

           `tweenCount` zeroes the element the moment the timeline is BUILT —
           at page load — while the tween itself waits for the trigger. With
           the start 12% up the viewport, that left a band 12% of a screen tall
           in which a figure was fully visible reading 0.00 and not yet
           counting: on a 844px phone, a whole row of the settlement sheet.
           Measured by scrolling the real pages in 250px steps and sampling
           every visible `[data-count]` against its own `data-count`: the
           landing showed "120.00" as 0.00, and `/pricing` showed the price,
           the deduction AND the total as zeros, in both languages.

           A figure part-way through its count is fine — that is the animation
           doing its job. A figure sitting at zero is a WRONG NUMBER on a page
           whose entire argument is that its numbers are right.

           `top bottom` fires as the element's top edge crosses the viewport's
           bottom, so the count begins on the frame it becomes visible and the
           zero is never on screen. */
        scrollTrigger: { trigger: el, start: "top bottom", once: true },
      });
      COUNTING.add(timeline);
      tweenCount(el, timeline);
    });
}

/* ══════════════════════════════════════════════════════════════════════════
   الكعب — the spine

   One hairline down the binding edge, and SCROLL is what draws it. This is
   the only scrubbed effect on the site, and it earns the scrub because the
   relationship it expresses is literally "how far into the book you are".
   Reading the page posts the ledger.

   Desktop only, and that is not a compromise: the spine lives in the margin
   column, and below `lg` there is no margin for it to live in.
   ══════════════════════════════════════════════════════════════════════════ */

function drawSpine() {
  gsap.utils.toArray<HTMLElement>("[data-spine]").forEach((spine) => {
    const section = spine.closest("section");
    if (!section) return;

    gsap.to(spine, {
      scaleY: 1,
      ease: "none",
      scrollTrigger: {
        trigger: section,
        start: "top 72%",
        end: "bottom 72%",
        // Scrubbed, with a short catch-up so a flung scroll does not snap the
        // line. `true` would tie it rigidly to the wheel and read as jitter.
        scrub: 0.4,
      },
    });
  });

  // The tick that joins the spine to its account label. It is not scrubbed —
  // it is an arrival, and arrivals have their own timing.
  gsap.utils.toArray<HTMLElement>("[data-section-tick]").forEach((tick) => {
    gsap.to(tick, {
      scaleX: 1,
      duration: 0.4,
      ease: E.strike,
      scrollTrigger: { trigger: tick.closest("section"), start: "top 72%", once: true },
    });
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   الختم — the seal

   Drawn, then pressed. A stamp is inked and struck once; it does not fade up.
   If the seal is already on screen when the page loads (a deep link, a short
   viewport) it is left as it is — replaying an entrance for something the
   reader is already looking at is a flicker, not an entrance.
   ══════════════════════════════════════════════════════════════════════════ */

function pressSeal() {
  const seal = document.querySelector<HTMLElement>("[data-seal]");
  if (!seal) return;

  const box = seal.getBoundingClientRect();
  if (box.top < window.innerHeight && box.bottom > 0) return;

  const strokes = seal.querySelectorAll<SVGElement>("[data-seal-stroke]");
  const timeline = gsap.timeline({
    scrollTrigger: { trigger: seal, start: "top 85%", once: true },
    defaults: { ease: E.press },
  });

  timeline
    .from(strokes, { drawSVG: "0%", duration: D.draw, ease: "power1.inOut", stagger: 0.08 })
    .from(seal.querySelectorAll("[data-seal-text]"), { opacity: 0, duration: D.state }, "-=0.35")
    // The press: it lands slightly hard and settles into the tilt the CSS
    // already holds, so the resting state after the tween is the resting
    // state without it.
    //
    // `immediateRender: false` is load-bearing. A `from()` applies its start
    // values the moment it is BUILT, which for a scroll-triggered tween means
    // the seal would sit at the wrong angle and 6% oversized for the entire
    // time it is off screen — and stay there for good if the trigger never
    // fired. The strokes above keep the default (they SHOULD be undrawn
    // before the reader arrives); a transform must not.
    .from(
      seal,
      { scale: 1.06, rotate: -1, duration: 0.5, ease: "back.out(1.7)", immediateRender: false },
      "-=0.5",
    );
}
