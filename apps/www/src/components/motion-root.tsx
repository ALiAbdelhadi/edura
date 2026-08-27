"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { D, E, STAGGER, makeCounter } from "@/lib/motion";

gsap.registerPlugin(useGSAP, ScrollTrigger, DrawSVGPlugin);

const COUNTING = new Set<gsap.core.Timeline>();

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

        void document.fonts?.ready.then(() => ScrollTrigger.refresh());

        const settleFigures = () => {
          if (!document.hidden) return;
          for (const timeline of COUNTING) timeline.progress(1);
          for (const el of document.querySelectorAll<HTMLElement>("[data-count]")) {
            if (el.dataset.count && el.textContent !== el.dataset.count) {
              el.textContent = el.dataset.count;
            }
          }
        };
        if (document.hidden) settleFigures();

        document.addEventListener("visibilitychange", settleFigures);
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

function tweenCount(el: HTMLElement, timeline: gsap.core.Timeline, position?: number | string) {
  const target = el.dataset.count ?? el.textContent ?? "";
  const counter = makeCounter(target);
  if (!counter) return;

  const box = { value: 0 };

  timeline.to(
    box,
    {
      value: counter.value,
      onStart: () => {
        el.textContent = counter.render(0);
      },
      duration: el.hasAttribute("data-total") ? D.total : D.post,
      ease: E.arrive,
      onUpdate: () => {
        el.textContent = counter.render(box.value);
      },
      onInterrupt: () => {
        el.textContent = counter.render(counter.value);
      },
    },
    position,
  );
}

function heroEntrance() {
  const register = document.querySelector<HTMLElement>(
    "main > section:first-of-type [data-register]",
  );
  const words = gsap.utils.toArray<HTMLElement>("h1 [data-ink-word]");

  const timeline = gsap.timeline({ defaults: { ease: E.arrive } });
  COUNTING.add(timeline);

  if (words.length) {
    timeline.from(words, {
      opacity: 0,
      y: 16,
      duration: D.ink,
      stagger: { each: STAGGER, amount: Math.min(words.length * STAGGER, 0.45) },
    });
  }

  if (!register) {
    timeline.eventCallback("onComplete", () => {
      document.documentElement.dataset.motionSettled = "";
    });
    return;
  }

  timeline.from(
    register.querySelectorAll("[data-register-head] > *"),
    { opacity: 0, y: 8, duration: D.ink, stagger: 0.06 },
    0.25,
  );

  const rows = gsap.utils.toArray<HTMLElement>("[data-register] [data-row]");
  rows.forEach((row, i) => {
    const at = 0.42 + i * 0.13;
    timeline.from(row.querySelector("[data-row-label]"), { opacity: 0, x: 10, duration: D.ink }, at);
    const figure = row.querySelector<HTMLElement>("[data-figure]");
    if (figure) tweenCount(figure, timeline, at + 0.05);
  });

  const strike = register.querySelector<HTMLElement>("[data-total-rule]");
  if (strike) {
    timeline.from(strike, { scaleX: 0, duration: 0.42, ease: E.strike }, 0.42 + rows.length * 0.13);
  }

  const total = register.querySelector<HTMLElement>("[data-total-figure]");
  if (total) tweenCount(total, timeline, 0.42 + rows.length * 0.13 + 0.12);

  timeline.eventCallback("onComplete", () => {
    document.documentElement.dataset.motionSettled = "";
  });
}

function postOnScroll() {
  const hero = document.querySelector("main > section:first-of-type [data-register]");

  gsap.utils
    .toArray<HTMLElement>("[data-count]")
    .filter((el) => !hero || !hero.contains(el))
    .forEach((el) => {
      const timeline = gsap.timeline({

        scrollTrigger: { trigger: el, start: "top bottom", once: true },
      });
      COUNTING.add(timeline);
      tweenCount(el, timeline);
    });
}

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
        scrub: 0.4,
      },
    });
  });

  gsap.utils.toArray<HTMLElement>("[data-section-tick]").forEach((tick) => {
    gsap.to(tick, {
      scaleX: 1,
      duration: 0.4,
      ease: E.strike,
      scrollTrigger: { trigger: tick.closest("section"), start: "top 72%", once: true },
    });
  });
}

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
    .from(
      seal,
      { scale: 1.06, rotate: -1, duration: 0.5, ease: "back.out(1.7)", immediateRender: false },
      "-=0.5",
    );
}
