import { api } from "@/lib/api/client";

const DB_NAME = "edura-offline";
const DB_VERSION = 1;
const STORE_NAME = "attendance-outbox";

export type AttendanceStatus = "present" | "absent" | "excused";

export type QueuedAttendanceRecord = {
  id: number;
  teacherId: string;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  localTimestamp: string;
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
  records: { studentId: string; status: AttendanceStatus }[],
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

export async function syncQueuedAttendance(
  teacherId: string,
): Promise<SyncOutcome | null> {
  const all = await listQueuedAttendance();
  const mine = all.filter((r) => r.teacherId === teacherId);
  if (mine.length === 0) return null;

  try {
    const response = await api
      .post("teacher/attendance/sync", {
        json: {
          records: mine.map((r) => ({
            sessionId: r.sessionId,
            studentId: r.studentId,
            status: r.status,
            localTimestamp: r.localTimestamp,
          })),
        },
      })
      .json<{ data: SyncOutcome }>();

    await removeQueuedAttendance(mine.map((r) => r.id));
    return response.data;
  } catch {
    return null;
  }
}
