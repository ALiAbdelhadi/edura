import { isHTTPError } from "ky";
import { api } from "@/lib/api/client";

const DB_NAME = "edura-offline";
const DB_VERSION = 1;
const STORE_NAME = "attendance-outbox";

export type AttendanceStatus = "present" | "absent" | "excused";

export type AttendanceStage = "door";

export type QueuedAttendanceRecord = {
  id: number;
  teacherId: string;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  localTimestamp: string;
  stage?: AttendanceStage;
};

type NewAttendanceRecord = Omit<QueuedAttendanceRecord, "id">;

function isSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueAttendance(
  teacherId: string,
  sessionId: string,
  records: {
    studentId: string;
    status: AttendanceStatus;
    stage?: AttendanceStage;
  }[],
): Promise<void> {
  if (!isSupported() || records.length === 0) return;
  const db = await openDb();
  const localTimestamp = new Date().toISOString();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const r of records) {
      const entry: NewAttendanceRecord = {
        teacherId,
        sessionId,
        studentId: r.studentId,
        status: r.status,
        localTimestamp,
        ...(r.stage ? { stage: r.stage } : {}),
      };
      store.add(entry);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listQueuedAttendance(): Promise<
  QueuedAttendanceRecord[]
> {
  if (!isSupported()) return [];
  const db = await openDb();
  const records = await new Promise<QueuedAttendanceRecord[]>(
    (resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result as QueuedAttendanceRecord[]);
      req.onerror = () => reject(req.error);
    },
  );
  db.close();
  return records;
}

export async function removeQueuedAttendance(ids: number[]): Promise<void> {
  if (!isSupported() || ids.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export type SyncOutcome = { synced: number; conflicts: number; errors: number };

type SyncRecordResult = {
  sessionId: string;
  studentId: string;
  result: "synced" | "conflict" | "error";
  reason?: string;
};

export const SYNC_CHUNK_SIZE = 500;

// Only rows the server actually processed leave the device. A row the server
// answered "error" for stays queued so it is retried (e.g. door before
// counter) or visibly surfaced — never silently dropped.
export function partitionSyncedRows(
  chunk: QueuedAttendanceRecord[],
  results: SyncRecordResult[] | undefined,
): { removable: QueuedAttendanceRecord[]; kept: QueuedAttendanceRecord[] } {
  const rejectedKeys = new Set(
    (results ?? [])
      .filter((r) => r.result === "error")
      .map((r) => `${r.sessionId}:${r.studentId}`),
  );
  if (rejectedKeys.size === 0) return { removable: chunk, kept: [] };
  const removable: QueuedAttendanceRecord[] = [];
  const kept: QueuedAttendanceRecord[] = [];
  for (const row of chunk) {
    (rejectedKeys.has(`${row.sessionId}:${row.studentId}`) ? kept : removable).push(row);
  }
  return { removable, kept };
}

export type SyncResult =
  | { status: "empty" }
  | {
      status: "offline";
      synced: number;
      conflicts: number;
      errors: number;
      rejected: number;
    }
  | {
      status: "failed";
      message: string;
      synced: number;
      conflicts: number;
      errors: number;
      rejected: number;
    }
  | {
      status: "done";
      synced: number;
      conflicts: number;
      errors: number;
      rejected: number;
    };

function isNetworkFailure(err: unknown): boolean {
  return !isHTTPError(err);
}

export async function syncQueuedAttendance(
  teacherId: string,
): Promise<SyncResult> {
  const all = await listQueuedAttendance();
  const mine = all.filter((r) => r.teacherId === teacherId);
  if (mine.length === 0) return { status: "empty" };

  let synced = 0;
  let conflicts = 0;
  let errors = 0;
  let rejected = 0;

  for (let i = 0; i < mine.length; i += SYNC_CHUNK_SIZE) {
    const chunk = mine.slice(i, i + SYNC_CHUNK_SIZE);
    try {
      const response = await api
        .post("teacher/attendance/sync", {
          json: {
            records: chunk.map((r) => ({
              sessionId: r.sessionId,
              studentId: r.studentId,
              status: r.status,
              localTimestamp: r.localTimestamp,
              ...(r.stage ? { stage: r.stage } : {}),
            })),
          },
        })
        .json<{ data: SyncOutcome & { results?: SyncRecordResult[] } }>();

      const { removable, kept } = partitionSyncedRows(chunk, response.data.results);
      await removeQueuedAttendance(removable.map((r) => r.id));
      rejected += kept.length;

      synced += response.data.synced;
      conflicts += response.data.conflicts;
      errors += response.data.errors;
    } catch (err) {
      if (isNetworkFailure(err)) {
        return { status: "offline", synced, conflicts, errors, rejected };
      }
      return {
        status: "failed",
        message:
          err instanceof Error && err.message
            ? err.message
            : "Attendance sync was refused",
        synced,
        conflicts,
        errors,
        rejected,
      };
    }
  }

  return { status: "done", synced, conflicts, errors, rejected };
}
