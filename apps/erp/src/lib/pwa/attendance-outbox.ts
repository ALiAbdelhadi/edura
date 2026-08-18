import { isHTTPError } from "ky";
import { api } from "@/lib/api/client";

const DB_NAME = "edura-offline";
const DB_VERSION = 1;
const STORE_NAME = "attendance-outbox";

export type AttendanceStatus = "present" | "absent" | "excused";

/**
 * A door-stage record is the assistant's confirmation at the classroom door,
 * not a raw status write: on replay the server applies the counter → present
 * TRANSITION (`doorTransitionTx`), which is idempotent, refuses a student who
 * never passed the counter, and keeps the device's own time as the `doorAt`
 * fact. The endpoint has accepted `stage: "door"` since Step 6; the outbox was
 * simply never able to produce one, so the door — the surface standing in a
 * hall doorway on a phone, i.e. the one most likely to lose signal — was the
 * only attendance surface with no offline path.
 *
 * A record with no stage is the teacher's roster save, unchanged.
 */
export type AttendanceStage = "door";

export type QueuedAttendanceRecord = {
  id: number;
  /**
   * The teacher these records BELONG to, not necessarily who queued them — an
   * assistant queues under their acting teacher's id (`actingTeacherId ?? id`),
   * the same derivation the teacher screen uses. Every read filters on it, so a
   * different teacher signing into a shared device never sees this queue, and
   * the sync endpoint resolves the same teacher from either account.
   */
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
        // Omitted rather than set to undefined: IndexedDB stores the key either
        // way, and a stored `stage: undefined` would serialise into the sync
        // payload where the server's enum rejects it.
        ...(r.stage ? { stage: r.stage } : {}),
      };
      store.add(entry);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** How many of this teacher's queued records are door confirmations. */
export function countDoorRecords(records: QueuedAttendanceRecord[]): number {
  return records.filter((r) => r.stage === "door").length;
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

export async function clearAttendanceOutbox(): Promise<void> {
  if (!isSupported()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export type SyncOutcome = { synced: number; conflicts: number; errors: number };

/**
 * The server refuses a batch larger than this (`records: z.array(...).max(500)`
 * on /teacher/attendance/sync). A queue that grows past it used to fail on
 * EVERY attempt, forever, and report itself as "you are offline" — so the one
 * teacher whose outbox needed draining most was the one who could never drain
 * it. Send it in chunks the server will accept instead.
 */
export const SYNC_CHUNK_SIZE = 500;

export type SyncResult =
  | { status: "empty" }
  /** The request never reached the server. Worth retrying as-is. */
  | { status: "offline"; synced: number; conflicts: number; errors: number }
  /** The server answered and refused. Retrying unchanged will refuse again. */
  | {
      status: "failed";
      message: string;
      synced: number;
      conflicts: number;
      errors: number;
    }
  | { status: "done"; synced: number; conflicts: number; errors: number };

function isNetworkFailure(err: unknown): boolean {
  // ky raises HTTPError only once a response exists; anything else here
  // (TypeError from fetch, TimeoutError, an aborted request) means the request
  // never got an answer.
  return !isHTTPError(err);
}

/**
 * Replay this teacher's queued attendance.
 *
 * A chunk is deleted from the outbox only after the server has accounted for
 * it, and a chunk that fails stops the run with everything after it still
 * queued — so a failure costs a retry, never a record.
 */
export async function syncQueuedAttendance(
  teacherId: string,
): Promise<SyncResult> {
  const all = await listQueuedAttendance();
  const mine = all.filter((r) => r.teacherId === teacherId);
  if (mine.length === 0) return { status: "empty" };

  let synced = 0;
  let conflicts = 0;
  let errors = 0;

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
        .json<{ data: SyncOutcome }>();

      await removeQueuedAttendance(chunk.map((r) => r.id));
      synced += response.data.synced;
      conflicts += response.data.conflicts;
      errors += response.data.errors;
    } catch (err) {
      if (isNetworkFailure(err)) {
        return { status: "offline", synced, conflicts, errors };
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
      };
    }
  }

  return { status: "done", synced, conflicts, errors };
}
