import { describe, expect, it } from "vitest";
import {
  partitionSyncedRows,
  type QueuedAttendanceRecord,
} from "@/lib/pwa/attendance-outbox";

function row(id: number, sessionId: string, studentId: string): QueuedAttendanceRecord {
  return {
    id,
    teacherId: "t1",
    sessionId,
    studentId,
    status: "present",
    localTimestamp: "2026-08-30T10:00:00.000Z",
    stage: "door",
  };
}

describe("partitionSyncedRows", () => {
  it("removes everything when the server reported no per-record errors", () => {
    const chunk = [row(1, "s1", "a"), row(2, "s1", "b")];
    const { removable, kept } = partitionSyncedRows(chunk, [
      { sessionId: "s1", studentId: "a", result: "synced" },
      { sessionId: "s1", studentId: "b", result: "conflict", reason: "server_record_kept" },
    ]);
    expect(removable).toHaveLength(2);
    expect(kept).toHaveLength(0);
  });

  it("keeps rows the server refused instead of deleting them", () => {
    const chunk = [row(1, "s1", "a"), row(2, "s1", "b"), row(3, "s2", "a")];
    const { removable, kept } = partitionSyncedRows(chunk, [
      { sessionId: "s1", studentId: "a", result: "synced" },
      { sessionId: "s1", studentId: "b", result: "error", reason: "no_counter_checkin" },
      { sessionId: "s2", studentId: "a", result: "error", reason: "student_not_enrolled" },
    ]);
    expect(removable.map((r) => r.id)).toEqual([1]);
    expect(kept.map((r) => r.id)).toEqual([2, 3]);
  });

  it("falls back to removing the whole chunk when the server sends no per-record results", () => {
    const chunk = [row(1, "s1", "a")];
    const { removable, kept } = partitionSyncedRows(chunk, undefined);
    expect(removable).toHaveLength(1);
    expect(kept).toHaveLength(0);
  });
});
