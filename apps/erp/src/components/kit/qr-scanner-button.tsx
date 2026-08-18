"use client";

import { ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { cameraAvailable, createQrDetector } from "@/lib/attendance/qr-decoder";

// ===========================================================================
// ماسح البطاقة — the camera, at the counter and at the hall door.
//
// WHICH decoder reads the frame is not decided here — see
// `@/lib/attendance/qr-decoder`, which prefers the browser's own
// `BarcodeDetector` and falls back to a lazily-imported software decoder where
// there isn't one (Safari/iOS). This file owns the camera, the dialog and the
// loop; it does not own the pixels.
//
// ── WHAT THIS BUTTON NEEDS, AND WHAT IT NO LONGER NEEDS ────────────────────
//
// It renders wherever a camera can be opened at all. It used to render NOTHING
// without `BarcodeDetector`, which took the scanner off every iPhone —
// defensible while scanning was a convenience beside a keyboard, wrong for an
// assistant standing in a doorway with a queue. The two paths that always
// worked (typing the eight characters, and a keyboard-wedge scanner typing the
// URL into the same box) are untouched, so nothing was traded away for this.
//
// Where there is genuinely no camera the button still renders nothing rather
// than greying out (CONSTITUTION §9: an excluded capability is absent, never
// disabled) — a disabled button teaches the operator the app is broken.
//
// The detector is created ONCE per open and torn down with the stream: a
// camera left running behind a closed dialog is a live recording device in a
// room full of children, and "the tab is still open" is how it stays that way.
// ===========================================================================

/** Stable identity — a new closure each render would resubscribe forever. */
const NO_SUBSCRIBE = () => () => {};

/**
 * Software decoding costs real CPU on a phone, so the loop is paced rather than
 * run every frame. ~12/second is far more than a hand holding a card needs and
 * leaves the main thread free enough that the viewfinder stays smooth — a
 * stuttering preview is what makes an operator think the scan failed.
 */
const DECODE_INTERVAL_MS = 80;

export function QrScannerButton({
  onScan,
  label,
  title,
  hint,
  deniedMessage,
  className,
}: {
  /** Called once with the raw decoded string; the dialog closes itself first. */
  onScan: (value: string) => void;
  label: string;
  title: string;
  hint: string;
  deniedMessage: string;
  className?: string;
}) {
  // Support is a CLIENT-ONLY fact that never changes after load, which is
  // exactly what `useSyncExternalStore` is for: the server snapshot is `false`
  // (so the first paint matches the server's and hydration is clean) and the
  // client snapshot is the real answer. Reading `window` during render would
  // disagree between the two passes; resolving it with `setState` in an effect
  // works but schedules a second render for a value that was knowable the
  // moment the bundle ran. The subscribe callback is a no-op because there is
  // nothing to subscribe to — a browser does not grow a BarcodeDetector.
  const supported = useSyncExternalStore(NO_SUBSCRIBE, cameraAvailable, () => false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Guards the async detection loop against firing twice on one scan, and
  // against resolving after the dialog has already closed.
  const liveRef = useRef(false);

  const stop = useCallback(() => {
    liveRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // The camera must die with the component, not with the dialog's animation.
  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (!open) {
      stop();
      return;
    }

    let timer = 0;
    liveRef.current = true;

    (async () => {
      try {
        // Started BEFORE the camera prompt: on a browser without a native
        // decoder this is a network fetch, and doing it after the operator has
        // already pointed the phone at a card would show them a live preview
        // that decodes nothing for a beat. Both are awaited together below.
        const detectorPromise = createQrDetector();

        const stream = await navigator.mediaDevices.getUserMedia({
          // The back camera: a card is held out in front of the operator, not
          // pointed at their own face.
          video: { facingMode: { ideal: "environment" } },
        });
        if (!liveRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        // iOS Safari rejects `play()` in some states even for a muted,
        // playsInline element. The frames still arrive once metadata lands, so
        // a rejection here must not abort the scan — it is not an error the
        // operator can act on.
        await video.play().catch(() => {});

        const detector = await detectorPromise;
        if (!detector || !liveRef.current) return;

        const tick = async () => {
          if (!liveRef.current || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            const value = found[0]?.rawValue;
            if (value) {
              // Close and hand over exactly once — `liveRef` is cleared by
              // `stop()` before the callback runs, so a second frame already
              // in flight cannot fire it again.
              stop();
              setOpen(false);
              onScan(value);
              return;
            }
          } catch {
            // The normal case while the operator is still aiming: an
            // undecodable frame, or a `<video>` whose metadata has not landed
            // yet (drawing that throws). Neither is worth showing anyone.
          }
          // setTimeout, not requestAnimationFrame: rAF is paced by the display
          // and would run the software decoder ~60×/second on the very devices
          // that cannot afford it. It also keeps ticking when a phone throttles
          // rAF in the background, where the camera is not being aimed at all.
          timer = window.setTimeout(() => void tick(), DECODE_INTERVAL_MS);
        };
        void tick();
      } catch {
        // Permission refused, or no camera on this machine. Both are the same
        // thing to the operator: use the keyboard instead.
        setError(deniedMessage);
      }
    })();

    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [open, onScan, stop, deniedMessage]);

  if (!supported) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className={className ?? "h-11 self-start px-2 text-[13px]"}
        onClick={() => {
          // Cleared HERE rather than in the effect: opening is an EVENT, and a
          // stale "camera blocked" message must not outlive the attempt that
          // produced it. Doing it in the effect would setState synchronously on
          // every open for a value the click already knows.
          setError(null);
          setOpen(true);
        }}
      >
        <ScanLine className="size-4" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{hint}</DialogDescription>
          </DialogHeader>
          {error ? (
            <p className="text-sm" style={{ color: "var(--red)" }}>
              {error}
            </p>
          ) : (
            <div
              className="relative overflow-hidden rounded-[10px]"
              style={{ background: "var(--ink)", aspectRatio: "4 / 3" }}
            >
              {/* All three attributes are the iOS contract, not decoration:
                  `playsInline` stops Safari hijacking the stream into its
                  fullscreen player (where our aiming frame is gone and the
                  dialog is unreachable), `muted` is what makes autoplay
                  permissible at all, and `autoPlay` starts the preview if the
                  explicit `play()` above was rejected. */}
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                autoPlay
                playsInline
              />
              {/* A frame to aim inside. Purely an affordance — detection runs
                  on the whole frame, so a card slightly outside it still
                  scans rather than silently failing. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-[18%] rounded-[8px]"
                style={{ border: "2px solid var(--paper)", opacity: 0.75 }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
