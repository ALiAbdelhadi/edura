/**
 * Sending the browser to a payment gateway's checkout page.
 *
 * ── THE BUG THIS EXISTS TO FIX ────────────────────────────────────────────
 *
 * Every checkout in this app does the same thing: POST to create an intent,
 * `await` the response, then open the gateway URL the server hands back. The
 * open was `window.open(url, "_blank")` — and because it runs AFTER an await,
 * it is no longer inside the user-gesture stack that permitted the click.
 *
 * Mobile Safari blocks that by default, and Chrome on Android does too under
 * its popup heuristics. What the parent sees is: they press «ادفع بالكارت»,
 * the dialog stays exactly where it was, and nothing happens. No error, no
 * message — because from the app's point of view nothing failed. On a portal
 * whose users are overwhelmingly on phones, that is the revenue path silently
 * not working.
 *
 * ── WHY SAME-TAB, AND NOT A PRE-OPENED TAB ────────────────────────────────
 *
 * The other repair is to open a blank tab synchronously in the click handler
 * and point it at the URL once the intent resolves. It works, but it leaves an
 * orphan blank tab whenever the intent fails, and on a phone a second tab is
 * worse than a redirect anyway — the parent loses the app behind a tab strip
 * they may not know how to use. A redirect is what every payment page on the
 * Egyptian web already does, so it is also the familiar shape.
 *
 * ── WHY LOSING THE PAGE IS SAFE ───────────────────────────────────────────
 *
 * Nothing about settlement depends on this tab staying alive. The intent is
 * already recorded server-side before this is called, and the gateway's
 * webhook claims and settles it in ONE transaction (security fix M1), so the
 * payment completes whether or not the browser ever comes back. This function
 * moves a browser; it decides nothing about money.
 *
 * The mock driver never reaches here — `mock-checkout` URLs are detected by
 * the caller and settled inside the dialog.
 */
export function goToCheckout(url: string): void {
  // `assign`, not `href =`: identical behaviour, but it reads as the action it
  // is and keeps the current page in history, so the browser's back button
  // returns the parent to the app rather than to whatever preceded it.
  window.location.assign(url);
}
