import { vi } from "vitest";

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
  v.hoisted = <T>(factory: () => T): T => factory();
}
