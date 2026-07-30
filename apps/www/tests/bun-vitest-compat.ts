/**
 * bun test ships a vitest compatibility layer, but (as of bun 1.3.12) it lacks
 * vi.stubEnv / vi.unstubAllEnvs / vi.hoisted. This preload (bunfig.toml [test])
 * fills exactly those three, with vitest's documented semantics, so the unit
 * suite runs unmodified under `bun test`.
 */
import { vi } from "vitest";

// vitest's TYPE declares stubEnv/unstubAllEnvs/hoisted, but bun's runtime
// compat object lacks them — so runtime-check + assign through `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const v = vi as any;

const savedEnv = new Map<string, string | undefined>();
if (!v.stubEnv) {
  v.stubEnv = (key: string, value: string) => {
    if (!savedEnv.has(key)) savedEnv.set(key, process.env[key]);
    process.env[key] = value;
  };
}
if (!v.unstubAllEnvs) {
  v.unstubAllEnvs = () => {
    for (const [key, original] of savedEnv) {
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
    savedEnv.clear();
  };
}
if (!v.hoisted) {
  // vitest hoists this above imports at transform time; bun hoists vi.mock the
  // same way jest.mock is hoisted, so a plain immediate call is equivalent for
  // the factory-state pattern these tests use.
  v.hoisted = <T>(factory: () => T): T => factory();
}
