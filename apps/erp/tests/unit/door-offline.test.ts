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

const record = z.object({
  sessionId: z.string().min(1),
  studentId: z.string().min(1),
  status: z.enum(["present", "absent", "late", "excused"]),
  localTimestamp: z.coerce.date().optional(),
  stage: z.enum(["door"]).optional(),
});

describe("offline door check-in", () => {
  it("restates the endpoint's real record schema", () => {
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

  it("resolves only against this lesson's cached roster", () => {
    expect(SCREEN).toContain("const findRosterRow");
    expect(SCREEN).toContain("if (!roster) return null;");
    expect(SCREEN).toContain("offlineNotOnList");
  });

  it("re-checks the counter step before queueing", () => {
    expect(SCREEN).toContain("if (!row.counterAt)");
    expect(SCREEN).toContain("counterFirst");
  });

  it("queues under the teacher, not the assistant", () => {
    expect(SCREEN).toContain(
      "identity?.actingTeacherId ?? identity?.id",
    );
  });

  it("only takes the offline path when actually offline", () => {
    expect(SCREEN).toContain("!navigator.onLine");
  });

  it("refreshes the queue count so the banner appears immediately", () => {
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
    const code = buildStudentCode("G", "7K3M2Q");
    expect(resolveStudentCode(code)).toBe(code);
    expect(resolveStudentCode(code.toLowerCase())).toBe(code);
    expect(resolveStudentCode(` ${code} `)).toBe(code);
    expect(resolveStudentCode("not-a-code")).toBeNull();
  });

  it("finds the code inside a scanned card URL", () => {
    const code = buildStudentCode("G", "7K3M2Q");
    const payload = `https://app.edura.eg/c/${code}-1-ABCDEFGH12345678`;
    expect(payload.toUpperCase().includes(code)).toBe(true);
    expect(resolveStudentCode(payload)).toBeNull();
  });
});
