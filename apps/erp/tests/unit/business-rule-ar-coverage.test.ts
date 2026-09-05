import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AR_MESSAGES,
  AR_PATTERNS,
  AR_TEMPLATE_SOURCES,
  arabicErrorMessage,
} from "@repo/server-core/errors/messages-ar";
import {
  AuthError,
  BusinessRuleError,
  ConflictError,
  ExpiredError,
  ForbiddenError,
  NotFoundError,
  SessionConflictError,
  ValidationError,
} from "@repo/server-core/errors/classes";

const ROOTS = [
  join(__dirname, "../../../../apps/erp/src"),
  join(__dirname, "../../../../apps/superadmin/src"),
  join(__dirname, "../../../../packages/server-core/src"),
];

// Every error class whose message reaches the operator through the envelope's
// `messageAr`. A 404 / 403 / 409 is read by the same counter staff as a 422, so
// the same coverage applies (VERIFICATION_REPORT.md §2.4, 2026-09-05).
const CLASSES = ["BusinessRuleError", "NotFoundError", "ForbiddenError", "ConflictError"];

// `new <Class>(<literal>)` — including `"a" + "b"` concatenations, multi-line
// constructor calls, and the BARE `new ForbiddenError()` that falls back to the
// class default message.
const CALL_RE = new RegExp(
  `new (${CLASSES.join("|")})\\(\\s*(\\)|"(?:[^"\\\\]|\\\\.)*"|\`(?:[^\`\\\\]|\\\\.)*\`)((?:\\s*\\+\\s*"(?:[^"\\\\]|\\\\.)*")*)`,
  "g",
);

// What a bare `new X()` throws — read from the classes themselves, not retyped.
const CLASS_DEFAULTS = [
  new AuthError(),
  new BusinessRuleError(),
  new ConflictError(),
  new ExpiredError(),
  new ForbiddenError(),
  new NotFoundError(),
  new SessionConflictError(),
  new ValidationError(),
].map((e) => e.message);

function unquote(literal: string): string {
  return literal
    .slice(1, -1)
    .replace(/\\(["'`\\])/g, "$1")
    .replace(/\\n/g, "\n");
}

function harvest(): { statics: Set<string>; templates: Set<string>; bare: number } {
  const statics = new Set<string>();
  const templates = new Set<string>();
  let bare = 0;

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
        if (m[2] === ")") {
          bare += 1;
          continue;
        }
        let message = unquote(m[2]!);
        for (const cont of m[3]!.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
          message += unquote(cont[0]);
        }
        if (message.includes("${")) templates.add(message);
        else statics.add(message);
      }
    }
  };
  for (const root of ROOTS) scan(root);
  return { statics, templates, bare };
}

describe("Arabic coverage of server error messages", () => {
  const { statics, templates, bare } = harvest();

  it("harvests a plausible number of messages", () => {
    // 2026-09-05: 443 statics / 43 templates / 53 bare across the three roots.
    expect(statics.size).toBeGreaterThan(400);
    expect(templates.size).toBeGreaterThan(35);
    expect(bare).toBeGreaterThan(30);
  });

  it("every static NotFound / Forbidden / Conflict / BusinessRule message has an Arabic translation", () => {
    const missing = [...statics].filter((m) => !(m in AR_MESSAGES));
    expect(missing).toEqual([]);
  });

  it("every class default message (a bare `new ForbiddenError()`) has an Arabic translation", () => {
    const missing = CLASS_DEFAULTS.filter((m) => !(m in AR_MESSAGES));
    expect(missing).toEqual([]);
  });

  it("every templated message is a known template source", () => {
    const missing = [...templates].filter((t) => !AR_TEMPLATE_SOURCES.includes(t));
    expect(missing).toEqual([]);
  });

  it("every template source is actually matched by a pattern once rendered", () => {
    // A source listed here but matched by no pattern would pass the test above
    // and still reach the operator in English. Stub every interpolation and
    // demand Arabic back.
    const unmatched = AR_TEMPLATE_SOURCES.filter(
      (t) => !arabicErrorMessage(t.replace(/\$\{[^}]*\}/g, "1")),
    );
    expect(unmatched).toEqual([]);
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
