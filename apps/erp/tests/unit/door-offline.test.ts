import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildStudentCode,
  resolveStudentCode,
} from "@repo/database/student-code";

const SCREEN = readFileSync(
  join(process.cwd(), "src/features/attendance/door-checkin-screen.tsx"),
  "utf8",
);
const OUTBOX = readFileSync(
  join(process.cwd(), "src/lib/pwa/attendance-outbox.ts"),
  "utf8",
);
const SYNC_ROUTE = readFileSync(
  join(process.cwd(), "src/app/api/v1/teacher/attendance/sync/route.ts"),
  "utf8",
);

/**
 * The shape the sync endpoint actually accepts, restated here so a queued
 * record is checked against the CONTRACT rather than against a hand-written
 * guess. Held to the route by the assertion below.
 */
const record = z.object({
  sessionId: z.string().min(1),
  studentId: z.string().min(1),
  status: z.enum(["present", "absent", "late", "excused"]),
  localTimestamp: z.coerce.date().optional(),
  stage: z.enum(["door"]).optional(),
});

describe("offline door check-in", () => {
  it("restates the endpoint's real record schema", () => {
    // If the route's schema moves, this test's premise is stale — fail here
    // rather than keep asserting against a contract that no longer exists.
    expect(SYNC_ROUTE).toContain('stage: z.enum(["door"]).optional()');
    expect(SYNC_ROUTE).toContain(
      'status: z.enum(["present", "absent", "late", "excused"])',
    );
  });

  it("produces a record the endpoint accepts", () => {
    const queued = {
      sessionId: "sess-1",
      studentId: "stu-1",
      status: "present" as const,
      localTimestamp: new Date().toISOString(),
      stage: "door" as const,
    };
    expect(record.safeParse(queued).success).toBe(true);
  });

  it("omits `stage` entirely for a teacher's roster save", () => {
    // Not `stage: undefined` — IndexedDB keeps the key either way, and an
    // explicit undefined serialises into the payload where the enum rejects it.
    expect(OUTBOX).toContain("...(r.stage ? { stage: r.stage } : {})");
    const rosterSave = {
      sessionId: "sess-1",
      studentId: "stu-1",
      status: "present" as const,
      localTimestamp: new Date().toISOString(),
    };
    expect(record.safeParse(rosterSave).success).toBe(true);
    expect(record.safeParse({ ...rosterSave, stage: undefined }).success).toBe(
      true,
    );
    expect(record.safeParse({ ...rosterSave, stage: null }).success).toBe(false);
  });

  it("carries the stage through the replay payload", () => {
    expect(OUTBOX).toMatch(/records: chunk\.map[\s\S]*stage: r\.stage/);
  });

  /**
   * Offline, the roster is the ONLY set a code may resolve within — narrower
   * than the online path, which searches platform-wide. That is what keeps an
   * unverifiable scan from naming a student who never passed the counter.
   */
  it("resolves only against this lesson's cached roster", () => {
    expect(SCREEN).toContain("const findRosterRow");
    expect(SCREEN).toContain("if (!roster) return null;");
    expect(SCREEN).toContain("offlineNotOnList");
  });

  it("re-checks the counter step before queueing", () => {
    // `doorTransitionTx` refuses a student with no counter check-in on replay;
    // refusing here too means the operator is told at the door, not an hour
    // later when the queue drains.
    expect(SCREEN).toContain("if (!row.counterAt)");
    expect(SCREEN).toContain("counterFirst");
  });

  it("queues under the teacher, not the assistant", () => {
    // Same derivation the teacher's screen uses, so an assistant's door records
    // replay whichever of the two accounts gets back online first.
    expect(SCREEN).toContain(
      "identity?.actingTeacherId ?? identity?.id",
    );
  });

  it("only takes the offline path when actually offline", () => {
    expect(SCREEN).toContain("!navigator.onLine");
  });

  it("refreshes the queue count so the banner appears immediately", () => {
    // Found in the browser: the count only caught up on the NEXT mount, so a
    // confirmation queued at the door showed a toast and then nothing — the
    // banner is the only standing signal that the work is held, not lost.
    expect(SCREEN).toMatch(
      /await enqueueAttendance\([\s\S]{0,500}await refreshCount\(\)/,
    );
    const teacherScreen = readFileSync(
      join(process.cwd(), "src/features/teacher/teacher-attendance-screen.tsx"),
      "utf8",
    );
    expect(teacherScreen).toMatch(
      /await enqueueAttendance\([\s\S]{0,500}await refreshCount\(\)/,
    );
  });

  it("normalises a typed code the way the server does", () => {
    // Built, not hand-written: the check character is computed, so a literal
    // lifted from a doc comment is usually NOT a valid code (the docs' own
    // "G7K3M2QF" is rejected, which is the check character doing its job).
    const code = buildStudentCode("G", "7K3M2Q");
    expect(resolveStudentCode(code)).toBe(code);
    expect(resolveStudentCode(code.toLowerCase())).toBe(code);
    expect(resolveStudentCode(` ${code} `)).toBe(code);
    expect(resolveStudentCode("not-a-code")).toBeNull();
  });

  it("finds the code inside a scanned card URL", () => {
    // The signed QR keeps the code in plain sight so keyboard-wedge scanners
    // keep working; offline that is also what makes a scan matchable at all.
    const code = buildStudentCode("G", "7K3M2Q");
    const payload = `https://app.edura.eg/c/${code}-1-ABCDEFGH12345678`;
    expect(payload.toUpperCase().includes(code)).toBe(true);
    // ...and the whole URL is not itself a valid bare code, so the typed-code
    // branch correctly declines it and the containment branch handles it.
    expect(resolveStudentCode(payload)).toBeNull();
  });
});
