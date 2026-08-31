import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AR_MESSAGES,
  AR_PATTERNS,
  AR_TEMPLATE_SOURCES,
  arabicErrorMessage,
} from "@repo/server-core/errors/messages-ar";

const ROOTS = [
  join(__dirname, "../../../../apps/erp/src"),
  join(__dirname, "../../../../apps/superadmin/src"),
  join(__dirname, "../../../../packages/server-core/src"),
];

// `new BusinessRuleError(<literal>)` — including `"a" + "b"` concatenations
// and multi-line constructor calls.
const CALL_RE =
  /new BusinessRuleError\(\s*("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)((?:\s*\+\s*"(?:[^"\\]|\\.)*")*)/g;

function unquote(literal: string): string {
  return literal
    .slice(1, -1)
    .replace(/\\(["'`\\])/g, "$1")
    .replace(/\\n/g, "\n");
}

function harvest(): { statics: Set<string>; templates: Set<string> } {
  const statics = new Set<string>();
  const templates = new Set<string>();

  const scan = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === "node_modules" || name === "generated" || name.startsWith(".")) continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        scan(p);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(CALL_RE)) {
        let message = unquote(m[1]!);
        for (const cont of m[2]!.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
          message += unquote(cont[0]);
        }
        if (message.includes("${")) templates.add(message);
        else statics.add(message);
      }
    }
  };
  for (const root of ROOTS) scan(root);
  return { statics, templates };
}

describe("Arabic coverage of business-rule messages", () => {
  const { statics, templates } = harvest();

  it("harvests a plausible number of messages", () => {
    expect(statics.size).toBeGreaterThan(150);
    expect(templates.size).toBeGreaterThan(15);
  });

  it("every static BusinessRuleError message has an Arabic translation", () => {
    const missing = [...statics].filter((m) => !(m in AR_MESSAGES));
    expect(missing).toEqual([]);
  });

  it("every templated BusinessRuleError message is a known template source", () => {
    const missing = [...templates].filter((t) => !AR_TEMPLATE_SOURCES.includes(t));
    expect(missing).toEqual([]);
  });

  it("every pattern matches its own sample and produces Arabic", () => {
    for (const { sample } of AR_PATTERNS) {
      const ar = arabicErrorMessage(sample);
      expect(ar, sample).toBeTruthy();
      expect(ar).not.toBe(sample);
    }
  });

  it("no dictionary entry is left empty or identical to the English", () => {
    for (const [en, ar] of Object.entries(AR_MESSAGES)) {
      expect(ar.trim().length, en).toBeGreaterThan(0);
      expect(ar, en).not.toBe(en);
    }
  });
});

describe("fail() envelope carries messageAr", () => {
  it("attaches the Arabic rendering next to the canonical English message", async () => {
    const { fail } = await import("@repo/server-core/http/envelope");
    const res = fail(400, "business_rule", "Session is cancelled");
    const body = (await res.json()) as {
      error: { code: string; message: string; messageAr?: string };
    };
    expect(body.error.message).toBe("Session is cancelled");
    expect(body.error.messageAr).toBe(AR_MESSAGES["Session is cancelled"]);
  });

  it("renders templated messages through the pattern table", async () => {
    const { fail } = await import("@repo/server-core/http/envelope");
    const res = fail(
      400,
      "business_rule",
      "Amount exceeds available balance (50.00 EGP available)",
    );
    const body = (await res.json()) as { error: { messageAr?: string } };
    expect(body.error.messageAr).toContain("50.00");
    expect(body.error.messageAr).toContain("جنيه");
  });

  it("omits messageAr for untranslated strings instead of guessing", async () => {
    const { fail } = await import("@repo/server-core/http/envelope");
    const res = fail(500, "internal", "Internal error");
    const body = (await res.json()) as { error: { messageAr?: string } };
    expect(body.error.messageAr).toBeUndefined();
  });
});
