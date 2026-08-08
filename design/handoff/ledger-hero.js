/* <ledger-hero> — the settlement receipt writing itself. Advanced 2D (GSAP):
   rows enter, figures count up in mono, the double rule draws, the seal stamps.
   Pointer tilt (fake depth, no WebGL); one static final frame under reduced motion.
   Colors are live CSS vars, so theme switches need no rebuild. */
(() => {
  if (customElements.get("ledger-hero")) return;
  const GSAP_URL = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm";

  const COPY = {
    en: {
      dir: "ltr", face: "var(--lat-body)", header: "RECEIPT", code: "TRX-2026-0431",
      rows: [["One session", 300], ["Platform — 10%", -30], ["Center — 25%", -75]],
      total: ["Teacher", 195], seal: "SEALED", actor: "signed · S. Mounir · 14:02",
    },
    ar: {
      dir: "rtl", face: "var(--ar-body)", header: "إيصال", code: "TRX-2026-0431",
      rows: [["حصة واحدة", 300], ["المنصة — 10%", -30], ["السنتر — 25%", -75]],
      total: ["المدرّس", 195], seal: "مختوم", actor: "باسم · سارة منير · 14:02",
    },
  };
  const fmt = (v) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(2);
  const el = (tag, css, txt) => {
    const e = document.createElement(tag);
    e.style.cssText = css;
    if (txt != null) e.textContent = txt;
    return e;
  };

  class LedgerHero extends HTMLElement {
    connectedCallback() {
      if (this._up) return; this._up = true;
      const c = COPY[this.getAttribute("locale") === "ar" ? "ar" : "en"];
      this._reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.style.cssText = "display:flex;align-items:center;justify-content:center;width:100%;height:100%;perspective:950px";
      this.dir = c.dir;

      const sheet = el("div",
        "position:relative;width:min(430px,100%);background:var(--sheet);border:1px solid var(--rule);" +
        "border-radius:14px;box-shadow:0 12px 32px color-mix(in srgb,#2d2b2b 22%,transparent);" +
        "padding:30px 28px 26px;will-change:transform");
      const content = el("div", "");
      sheet.appendChild(content); this.appendChild(sheet);
      this._sheet = sheet;

      const head = el("div", "display:flex;align-items:center;gap:8px");
      head.appendChild(el("span", "display:inline-block;width:2px;height:10px;background:var(--gold)"));
      head.appendChild(el("span", "font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:.12em;color:var(--ink-3)", c.header));
      const code = el("span", "font-family:var(--mono);font-size:10px;letter-spacing:.06em;color:var(--ink-3);margin-inline-start:auto;direction:ltr;unicode-bidi:isolate", c.code);
      head.appendChild(code);
      content.appendChild(head);
      const headRule = el("div", "height:1px;background:var(--gold);opacity:.7;margin:14px 0 4px;transform-origin:" + (c.dir === "rtl" ? "right" : "left"));
      content.appendChild(headRule);

      const rows = [], figs = [];
      c.rows.forEach(([label, v]) => {
        const r = el("div", "display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:11px 0;border-bottom:1px solid var(--rule-2)");
        r.appendChild(el("span", "font-family:" + c.face + ";font-size:14.5px;color:var(--ink-2)", label));
        const f = el("span", "font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:14.5px;color:var(--ink);direction:ltr;unicode-bidi:isolate", fmt(v));
        f._target = v; r.appendChild(f);
        content.appendChild(r); rows.push(r); figs.push(f);
      });

      const dbl = el("div", "margin-top:14px");
      const l1 = el("div", "height:1px;background:var(--ink);transform-origin:" + (c.dir === "rtl" ? "right" : "left"));
      const l2 = el("div", "height:1px;background:var(--ink);margin-top:2px;transform-origin:" + (c.dir === "rtl" ? "right" : "left"));
      dbl.append(l1, l2); content.appendChild(dbl);

      const totalRow = el("div", "display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:12px 0 4px");
      totalRow.appendChild(el("span", "font-family:" + c.face + ";font-size:15px;font-weight:600;color:var(--ink)", c.total[0]));
      const totalFig = el("span", "font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:19px;font-weight:600;color:var(--ink);direction:ltr;unicode-bidi:isolate", fmt(c.total[1]));
      totalFig._target = c.total[1];
      totalRow.appendChild(totalFig); content.appendChild(totalRow);

      const foot = el("div", "display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px");
      const actor = el("span", "font-family:var(--mono);font-size:10.5px;letter-spacing:.04em;color:var(--ink-3)", c.actor);
      const seal = el("span",
        "display:inline-flex;align-items:center;padding:7px 13px;border:1.5px solid var(--seal);border-radius:10px;" +
        "color:var(--seal);font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;transform:rotate(-6deg)", c.seal);
      foot.append(actor, seal); content.appendChild(foot);

      if (this._reduced) return; // final state, static
      this._animate({ content, headRule, rows, figs, l1, l2, totalRow, totalFig, seal, actor });
    }

    async _animate(n) {
      let gsap;
      try { gsap = (await import(GSAP_URL)).gsap; } catch { return; }
      this._gsap = gsap;

      // pointer tilt — fake depth
      this.addEventListener("pointermove", (e) => {
        const b = this.getBoundingClientRect();
        const nx = ((e.clientX - b.left) / b.width) * 2 - 1;
        const ny = ((e.clientY - b.top) / b.height) * 2 - 1;
        gsap.to(this._sheet, { rotationY: nx * 6, rotationX: -ny * 4, duration: 0.6, ease: "power2.out" });
      });
      this.addEventListener("pointerleave", () =>
        gsap.to(this._sheet, { rotationY: 0, rotationX: 0, duration: 0.9, ease: "power3.out" }));

      const count = (fig, dur) => {
        const o = { v: 0 };
        return gsap.to(o, {
          v: fig._target, duration: dur, ease: "power1.inOut",
          onUpdate: () => { fig.textContent = fmt(o.v); },
        });
      };

      const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.6, defaults: { ease: "power3.out" } });
      tl.set(n.content.children, { opacity: 1 }, 0);
      tl.fromTo(this._sheet, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 });
      tl.fromTo(n.content.children[0], { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4 }, "-=0.25");
      tl.fromTo(n.headRule, { scaleX: 0 }, { scaleX: 1, duration: 0.55, ease: "power2.inOut" }, "-=0.15");
      n.rows.forEach((row, i) => {
        tl.fromTo(row, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45 }, "-=0.12");
        tl.add(count(n.figs[i], 0.55), "-=0.35");
      });
      tl.fromTo(n.l1, { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: "power2.inOut" }, "+=0.1");
      tl.fromTo(n.l2, { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: "power2.inOut" }, "-=0.28");
      tl.fromTo(n.totalRow, { opacity: 0 }, { opacity: 1, duration: 0.3 }, "-=0.1");
      tl.add(count(n.totalFig, 0.8), "-=0.15");
      tl.fromTo(n.actor, { opacity: 0 }, { opacity: 0.9, duration: 0.4 }, "+=0.15");
      tl.fromTo(n.seal,
        { opacity: 0, rotation: -14, scale: 1.35 },
        { opacity: 1, rotation: -6, scale: 1, duration: 0.42, ease: "expo.out" }, "-=0.2");
      tl.to(n.content, { opacity: 1, duration: 2.2 }); // hold
      tl.to(this._sheet, { opacity: 0, y: -14, duration: 0.5, ease: "power2.in" });

      this._tl = tl;
      // pause offscreen
      this._io = new IntersectionObserver((es) =>
        es.some((e) => e.isIntersecting) ? tl.play() : tl.pause());
      this._io.observe(this);
    }

    disconnectedCallback() {
      this._tl && this._tl.kill();
      this._io && this._io.disconnect();
    }
  }
  customElements.define("ledger-hero", LedgerHero);
})();
