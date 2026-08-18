// Proof for the software QR decoder — the path an iPhone takes.
//
// Safari ships no `BarcodeDetector`, so on iOS every camera scan runs through
// `jsQrDetector`. That path has no type error to catch it and no server to
// reject it: if it silently fails to decode, the scan button opens a camera
// that stares at a card forever, and the operator concludes the card is bad.
//
// So this asserts a genuine ROUND TRIP: a payload is encoded by the SAME
// library the card renders its square with (`qrcode.react`), rasterised, and
// handed to the real jsQR. A change to either side that stopped them agreeing
// fails here rather than in a doorway.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import jsQR from "jsqr";

import { jsQrDetector } from "@/lib/attendance/qr-decoder";

/**
 * `qrcode.react` emits the dark modules as one path of horizontal runs —
 * `M<x> <y>h<w>v1H<x>z`, plus `M<x>,<y> h<w>v1H<x>z` for the finder rows.
 * Parsing those back gives the exact module grid the card prints.
 */
function modulesFromSvg(svg: string): { grid: boolean[][]; size: number } {
  const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  const size = Number(viewBox?.[1]);
  if (!size) throw new Error("no viewBox in the rendered QR");

  // The SECOND path is the dark one (the first fills the light background).
  const paths = [...svg.matchAll(/<path[^>]*fill="(#[0-9A-Fa-f]{6})"[^>]*d="([^"]+)"/g)];
  const dark = paths.find((p) => p[1]?.toUpperCase() === "#000000");
  if (!dark) throw new Error("no dark path in the rendered QR");

  const grid: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  );
  for (const run of dark[2]!.matchAll(/M(\d+)[ ,](\d+)\s*h(\d+)v1H\d+z/g)) {
    const x = Number(run[1]);
    const y = Number(run[2]);
    const w = Number(run[3]);
    for (let i = 0; i < w; i++) grid[y]![x + i] = true;
  }
  return { grid, size };
}

/** The grid as pixels, at `scale` px per module plus a quiet zone. */
function rasterise(grid: boolean[][], size: number, scale: number, quiet = 4) {
  const edge = (size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(edge * edge * 4).fill(255);
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      if (!grid[my]![mx]) continue;
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const x = (mx + quiet) * scale + px;
          const y = (my + quiet) * scale + py;
          const i = (y * edge + x) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
        }
      }
    }
  }
  return { data, edge };
}

function encodeToPixels(value: string, scale = 4) {
  const svg = renderToStaticMarkup(React.createElement(QRCodeSVG, { value }));
  const { grid, size } = modulesFromSvg(svg);
  return rasterise(grid, size, scale);
}

/**
 * A stand-in for the browser canvas the real adapter draws into.
 *
 * It genuinely RESAMPLES (nearest-neighbour) rather than handing the source
 * bitmap straight back, because the first version of this double did exactly
 * that and every decode threw `Malformed data passed to binarizer` — jsQR is
 * given `dw × dh` and a buffer that must be exactly that many pixels. A double
 * that ignores the requested size cannot catch a real mismatch between what the
 * adapter draws and what it then reads.
 */
function fakeCanvas(pixels: { data: Uint8ClampedArray; edge: number }) {
  const drawCalls: { dw: number; dh: number }[] = [];
  let buffer = new Uint8ClampedArray(0);
  let bw = 0;
  let bh = 0;

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: (_src: unknown, _x: number, _y: number, dw: number, dh: number) => {
        drawCalls.push({ dw, dh });
        bw = dw;
        bh = dh;
        buffer = new Uint8ClampedArray(dw * dh * 4);
        for (let y = 0; y < dh; y++) {
          const sy = Math.min(pixels.edge - 1, Math.floor((y * pixels.edge) / dh));
          for (let x = 0; x < dw; x++) {
            const sx = Math.min(pixels.edge - 1, Math.floor((x * pixels.edge) / dw));
            const s = (sy * pixels.edge + sx) * 4;
            const d = (y * dw + x) * 4;
            buffer[d] = pixels.data[s]!;
            buffer[d + 1] = pixels.data[s + 1]!;
            buffer[d + 2] = pixels.data[s + 2]!;
            buffer[d + 3] = 255;
          }
        }
      },
      getImageData: () => ({ data: buffer, width: bw, height: bh }),
    }),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, drawCalls };
}

const PAYLOAD = "https://app.edura.eg/c/GFHNTPMS-1-8KA2QENRDA01F8KD";

describe("the encoder and the decoder agree", () => {
  it("decodes a square rendered by the very library the card uses", () => {
    const { data, edge } = encodeToPixels(PAYLOAD);
    const found = jsQR(data, edge, edge, { inversionAttempts: "dontInvert" });
    expect(found?.data).toBe(PAYLOAD);
  });

  it("decodes a bare student code too — a card is not the only thing scanned", () => {
    const { data, edge } = encodeToPixels("GFHNTPMS");
    expect(jsQR(data, edge, edge, { inversionAttempts: "dontInvert" })?.data).toBe(
      "GFHNTPMS",
    );
  });

  it("still decodes at 2px per module — a card held at arm's length", () => {
    const { data, edge } = encodeToPixels(PAYLOAD, 2);
    expect(jsQR(data, edge, edge, { inversionAttempts: "dontInvert" })?.data).toBe(
      PAYLOAD,
    );
  });
});

describe("jsQrDetector", () => {
  const source = (w: number, h: number) =>
    ({ videoWidth: w, videoHeight: h }) as unknown as CanvasImageSource;

  it("returns the decoded value in BarcodeDetector's shape", async () => {
    const pixels = encodeToPixels(PAYLOAD);
    const { canvas } = fakeCanvas(pixels);
    const detector = jsQrDetector(jsQR, () => canvas);
    // A source at the bitmap's own size, so the adapter draws 1:1 and this
    // asserts decoding rather than the double's resampler.
    await expect(detector.detect(source(pixels.edge, pixels.edge))).resolves.toEqual([
      { rawValue: PAYLOAD },
    ]);
  });

  it("returns an EMPTY array for a frame with no code, never throws", async () => {
    const blank = {
      data: new Uint8ClampedArray(64 * 64 * 4).fill(255),
      edge: 64,
    };
    const { canvas } = fakeCanvas(blank);
    const detector = jsQrDetector(jsQR, () => canvas);
    await expect(detector.detect(source(640, 480))).resolves.toEqual([]);
  });

  it("DOWNSCALES a big frame — the whole reason iOS keeps up", async () => {
    const { canvas, drawCalls } = fakeCanvas(encodeToPixels(PAYLOAD));
    const detector = jsQrDetector(jsQR, () => canvas);
    await detector.detect(source(1920, 1080));
    // 640 on the long edge, aspect preserved.
    expect(drawCalls.at(-1)).toEqual({ dw: 640, dh: 360 });
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
  });

  it("never UPSCALES a small frame — that costs pixels and buys nothing", async () => {
    const { canvas, drawCalls } = fakeCanvas(encodeToPixels(PAYLOAD));
    const detector = jsQrDetector(jsQR, () => canvas);
    await detector.detect(source(320, 240));
    expect(drawCalls.at(-1)).toEqual({ dw: 320, dh: 240 });
  });

  it("refuses a 0×0 source instead of throwing — a <video> before metadata", async () => {
    // The iOS case exactly: `play()` has resolved but `videoWidth` is still 0,
    // and drawing that to a canvas throws. A throw here would surface as the
    // scanner dying on open rather than starting a moment later.
    const { canvas, drawCalls } = fakeCanvas(encodeToPixels(PAYLOAD));
    const detector = jsQrDetector(jsQR, () => canvas);
    await expect(detector.detect(source(0, 0))).resolves.toEqual([]);
    expect(drawCalls).toHaveLength(0);
  });

  it("reuses ONE canvas across frames — a new one per frame is a GC leak", async () => {
    let made = 0;
    const pixels = encodeToPixels(PAYLOAD);
    const { canvas } = fakeCanvas(pixels);
    const detector = jsQrDetector(jsQR, () => {
      made++;
      return canvas;
    });
    for (let i = 0; i < 5; i++) await detector.detect(source(pixels.edge, pixels.edge));
    expect(made).toBe(1);
  });
});
