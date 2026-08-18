/* قارئ الـ QR / How a camera frame becomes a student code.
   ══════════════════════════════════════════════════════════════════════════════

   TWO DECODERS BEHIND ONE INTERFACE, and the second one exists because of iOS.

   `BarcodeDetector` is the browser's own decoder: hardware-accelerated, zero
   bytes, and present in Chrome and Chrome for Android — the counter machines
   and most staff phones in this market. Safari has never shipped it, so on an
   iPhone the scan button used to render NOTHING at all. That was defensible
   while the button was a convenience beside a keyboard; it is not defensible
   for an assistant standing in a doorway holding an iPhone, which is the exact
   posture the door check-in screen was built for.

   So where the native decoder is missing we fall back to `jsQR`.

   ── WHY THE ORIGINAL "NO LIBRARY" DECISION STILL HOLDS ─────────────────────

   That decision refused "a ~200KB WASM decoder downloaded by every user of the
   app to serve the one screen a receptionist stands at". Both halves of the
   objection are answered rather than overruled:

     • NOT BY EVERY USER. The import is dynamic and fires only when someone
       opens the scanner AND their browser has no native decoder. Verified
       against a PRODUCTION build, not asserted: the decoder lands in its own
       chunk, that chunk is absent from `build-manifest.json` (so no route
       loads it up front), and the five scanner call sites reference it lazily.
       **A dev-server network log is NOT evidence here** — Turbopack fetches
       dynamic chunks eagerly in development, which is exactly what made this
       claim look false the first time it was checked.
     • NOT WASM. jsQR is pure JavaScript with no dependencies, so it needs no
       `wasm-unsafe-eval` — which matters because the CSP is mid-hardening
       toward nonce-based enforcement, and a decoder that forced a new
       directive into that policy would be paying for a camera with a
       permanent hole.

   The chunk measures **45KB gzipped** (measured, not quoted from a README).
   That is a real cost and it is paid only by an iPhone at the moment its
   holder presses scan — against ~300KB and a CSP directive for the maintained
   WASM alternative.

   jsQR's last release is old. That is a real cost and worth stating plainly:
   what makes it acceptable is that it is a self-contained pixel decoder with
   no network, no eval and no DOM access — it is handed an array of bytes and
   returns a string — and it is the same decoder the popular wrappers embed.
   It runs on a screen whose other two input paths (typing, and the cheap
   keyboard-wedge scanners centres already own) work regardless of it.

   ── THE FALLBACK IS SLOWER, SO IT IS FED LESS ──────────────────────────────

   The native path hands the video element straight to the platform. jsQR needs
   pixels, and decoding a 1080p frame in JavaScript on a phone is far too slow
   to keep up with a viewfinder. So the adapter draws each frame DOWNSCALED
   (see `MAX_EDGE`) before decoding — a card fills a good part of the frame at
   arm's length, and a QR that is unreadable at 640px would be unreadable to
   the operator too. */

/** The parts of `BarcodeDetector` this app uses — native or emulated. */
export type DetectedBarcode = { rawValue: string };
export type QrDetector = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorCtor = new (opts: { formats: string[] }) => QrDetector;

/**
 * Long edge, in pixels, that a frame is scaled to before software decoding.
 * 640 was chosen as the smallest size at which a card held at arm's length
 * still resolves its modules; below it the decode rate falls off a cliff, and
 * above it the per-frame cost rises with nothing gained.
 */
const MAX_EDGE = 640;

function nativeCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

/** True when this browser can open a camera at all — the real prerequisite. */
export function cameraAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/**
 * Dimensions of whatever the caller handed us. A `<video>` reports 0×0 until
 * its metadata has loaded, and drawing that to a canvas throws — which on iOS
 * is the difference between "the scanner does not work" and "the scanner takes
 * an extra 200ms to start".
 */
function sourceSize(source: CanvasImageSource): { w: number; h: number } {
  const v = source as HTMLVideoElement;
  if (typeof v.videoWidth === "number" && v.videoWidth > 0) {
    return { w: v.videoWidth, h: v.videoHeight };
  }
  const c = source as HTMLCanvasElement | HTMLImageElement;
  return { w: Number(c.width) || 0, h: Number(c.height) || 0 };
}

/**
 * A detector backed by jsQR. Keeps ONE canvas for the lifetime of the scan —
 * allocating a new one per frame is what turns a decoder into a garbage
 * collector.
 */
export function jsQrDetector(
  decode: typeof import("jsqr").default,
  makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
): QrDetector {
  const canvas = makeCanvas();
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  return {
    async detect(source) {
      if (!ctx) return [];
      const { w, h } = sourceSize(source);
      if (!w || !h) return [];

      const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      const dw = Math.max(1, Math.round(w * scale));
      const dh = Math.max(1, Math.round(h * scale));
      if (canvas.width !== dw || canvas.height !== dh) {
        canvas.width = dw;
        canvas.height = dh;
      }

      ctx.drawImage(source, 0, 0, dw, dh);
      const image = ctx.getImageData(0, 0, dw, dh);
      // `dontInvert`: the card prints dark modules on light card stock, and
      // attempting both polarities doubles the per-frame cost for a case this
      // app never produces.
      const found = decode(image.data, dw, dh, { inversionAttempts: "dontInvert" });
      return found?.data ? [{ rawValue: found.data }] : [];
    },
  };
}

/**
 * The detector for this browser, native where possible.
 *
 * Async because the fallback is imported on demand — the whole point of the
 * arrangement is that a browser with a native decoder never fetches jsQR.
 * Returns `null` only when there is no camera to read from, which is the one
 * case no decoder can rescue.
 */
export async function createQrDetector(): Promise<QrDetector | null> {
  if (!cameraAvailable()) return null;

  const Native = nativeCtor();
  if (Native) {
    try {
      return new Native({ formats: ["qr_code"] });
    } catch {
      // A browser that exposes the constructor but rejects the format list
      // (some builds ship it behind an unsupported-format error) falls through
      // to the software decoder rather than leaving the operator with nothing.
    }
  }

  const { default: decode } = await import("jsqr");
  return jsQrDetector(decode);
}
