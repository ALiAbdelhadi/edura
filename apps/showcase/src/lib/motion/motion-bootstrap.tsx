/**
 * Decides the motion mode BEFORE first paint.
 *
 * THE BUG THIS EXISTS TO PREVENT
 * ----------------------------------------------------------------------------
 * Every reveal on this site is a `gsap.from()` built inside `useEffect`. React
 * effects run AFTER the browser has painted, so the sequence without this
 * script is:
 *
 *   1. paint the element at its final state  ← visible
 *   2. effect runs, GSAP jumps it to the start state (opacity 0, offset)
 *   3. animate back to the final state
 *
 * Step 1 is a flash of the finished headline before it animates in. On a fast
 * machine it is one frame; on the throttled 4G / 4× CPU profile the Phase 5
 * gate requires, it is clearly visible and looks like a rendering bug.
 *
 * Setting `data-motion` synchronously in <head> lets CSS hide reveal targets
 * before that first paint ever happens, so there is nothing to flash. The
 * MotionProvider still runs and still owns the React-side state and the
 * `change` listener — this only front-runs the initial value.
 *
 * WHY AN INLINE SCRIPT IS THE RIGHT TOOL
 * ----------------------------------------------------------------------------
 * Same pattern and same justification as the product's theme bootstrap: the
 * value depends on a browser API, it must be known before paint, and any
 * React-based solution runs too late by construction. It is inert on failure —
 * if the script does not run, `data-motion` stays at its server-rendered
 * "reduced" and everything is simply visible with no animation, which is the
 * safe direction to fail in.
 */
const FAILSAFE_MS = 3000;

const BOOTSTRAP = `(function(){try{
var d=document.documentElement;
var m=matchMedia('(prefers-reduced-motion: reduce)').matches;
d.dataset.motion=m?'reduced':'full';
if(!m){
  d.setAttribute('data-reveal-armed','');
  setTimeout(function(){d.removeAttribute('data-reveal-armed');},${FAILSAFE_MS});
}
}catch(e){}})();`;

export function MotionBootstrap() {
  return <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP }} />;
}
