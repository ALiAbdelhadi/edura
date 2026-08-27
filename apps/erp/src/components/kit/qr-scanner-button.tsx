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

const NO_SUBSCRIBE = () => () => {};

const DECODE_INTERVAL_MS = 80;

export function QrScannerButton({
  onScan,
  label,
  title,
  hint,
  deniedMessage,
  className,
}: {
  onScan: (value: string) => void;
  label: string;
  title: string;
  hint: string;
  deniedMessage: string;
  className?: string;
}) {
  const supported = useSyncExternalStore(NO_SUBSCRIBE, cameraAvailable, () => false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveRef = useRef(false);

  const stop = useCallback(() => {
    liveRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

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
        const detectorPromise = createQrDetector();

        const stream = await navigator.mediaDevices.getUserMedia({
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
        await video.play().catch(() => {});

        const detector = await detectorPromise;
        if (!detector || !liveRef.current) return;

        const tick = async () => {
          if (!liveRef.current || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            const value = found[0]?.rawValue;
            if (value) {
              stop();
              setOpen(false);
              onScan(value);
              return;
            }
          } catch {
          }
          timer = window.setTimeout(() => void tick(), DECODE_INTERVAL_MS);
        };
        void tick();
      } catch {
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
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                autoPlay
                playsInline
              />
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
