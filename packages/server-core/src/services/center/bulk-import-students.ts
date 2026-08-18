// =============================================================================
// BULK STUDENT IMPORT — get a whole roster onto the platform in one file.
//
// THE PROBLEM. A center joining the platform already has hundreds of students
// in a spreadsheet from whatever they ran before. Typing them one at a time at
// the walk-in counter is days of work, and the counter flow is built for a
// child standing in front of you, not a migration. This turns the spreadsheet
// into roster rows.
//
// WHAT IT DOES, AND DELIBERATELY DOES NOT:
//   * DOES — create-or-REUSE one student per row (same dedup as the counter),
//     and put them on THIS center's roster. That is the whole job.
//   * DOES NOT touch money. No subscription, no payment, no enrollment into a
//     group. Importing a name is not charging anyone, and coupling the two
//     would make a mistyped row a financial event. Enrolment + payment stay
//     the deliberate per-student step they already are.
//   * DOES NOT notify. The rows are shell accounts with no login (same as a
//     walk-in before they claim their invite); firing hundreds of
//     notifications at accounts nobody can read yet is noise, not service.
//
// DEDUP IS THE SAME ONE DEFINITION as the counter. It imports
// `findStudentByKeys` / `normalizeNationalId` from the manual-student module
// rather than re-deriving "same child" — a second definition here could
// disagree, which is exactly the duplicate-record failure that module's
// header warns about. Reuse is automatic and has no "create anyway" flag.
//
// PER-ROW ISOLATION. Each row is its own transaction. A file of 400 good rows
// and 3 bad ones imports the 400 and reports the 3 — one bad row can never
// roll back the rest (a single big transaction would, and in Postgres a row
// error aborts the whole transaction). The cost is N transactions for N rows;
// this is a one-time migration, not a hot path, so that is the right trade.
//
// COST, MEASURED — read this before raising the chunk size. Each row costs one
// transaction and ~8 database round trips (the dedup lookup, the two inserts,
// the roster upsert). Against a remote Neon that was ~1.3s per row from a
// laptop on 2026-08-09; from a server in the database's own region it is far
// less, but it is never free. Two consequences the caller MUST respect:
//   * a serverless function has a hard execution limit, so a 400-row file
//     cannot be one request — the UI uploads in CHUNKS and passes `lineOffset`;
//   * the browser's HTTP client has a timeout, and a single chunk must fit
//     inside it (a 10.4s request against a 10s default client timeout is how
//     this was found: the import SUCCEEDED and the user was told it failed).
// If centers ever outgrow this, the next optimisation is batching the dedup
// LOOKUP across the chunk — deliberately not done here, because it would mean
// a second definition of "the same child" living beside findStudentByKeys.
//
// Native `.xlsx` is a deliberate follow-on: it needs a parser dependency and a
// decision to add one. CSV/TSV (what every spreadsheet exports via Save As) is
// dependency-free and covers the case today. See student-csv.ts.
// =============================================================================

import { Prisma } from "@repo/database";
import { scopedDb, type TenantTx } from "../../db/scope";
import { BusinessRuleError, ForbiddenError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { generateFamilyCode, generateInviteCode } from "../../utils/random";
import {
  findStudentByKeys,
  normalizeNationalId,
} from "../external-teachers/manual-students";
import { parseStudentCsv, type StudentCsvRow } from "./student-csv";

/** Hard cap per call — a bigger file is split rather than run as one job. */
export const MAX_IMPORT_ROWS = 1000;

export type ImportRowStatus =
  | "created"
  | "reused"
  | "duplicate_in_file"
  | "would_create" // dry run
  | "would_reuse" // dry run
  | "error";

export type ImportRowResult = {
  line: number;
  name: string;
  status: ImportRowStatus;
  studentId?: string;
  studentCode?: string;
  /** For a reuse: which key matched. For a dup/error: the reason. */
  matchedOn?: "phone" | "national_id";
  /** For duplicate_in_file: the earlier line this row duplicates. */
  duplicateOfLine?: number;
  /**
   * Machine-readable cause, so the UI can render the reason in the reader's
   * OWN language. `error` below stays as the raw fallback for anything not on
   * this list (and for direct API callers), but a center staff member reading
   * a rejected row in an Arabic screen must not be shown English.
   */
  errorCode?: "name_required" | "invalid_national_id" | "already_exists";
  error?: string;
};

export type ImportSummary = {
  dryRun: boolean;
  total: number;
  created: number;
  reused: number;
  duplicatesInFile: number;
  failed: number;
  rows: ImportRowResult[];
};

type ImportActor = { acting: SessionUser; actorId: string; onBehalfOf?: string | null };

export type ImportOptions = {
  dryRun?: boolean;
  /**
   * Added to every reported line number.
   *
   * WHY IT EXISTS: a real file is uploaded in CHUNKS (see the cost note below),
   * and each chunk is a standalone CSV whose own line numbering restarts at 2.
   * Without this, row 250 of the center's spreadsheet would be reported as
   * "line 4" and nobody could find it. The offset is presentational only — it
   * never affects which student is matched or written.
   */
  lineOffset?: number;
};

function centerOf(acting: SessionUser): string {
  if (!acting.centerId) throw new ForbiddenError("Actor has no center scope");
  return acting.centerId;
}

function norm(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/**
 * Map the three per-row failures this importer can actually produce onto codes
 * the UI can translate. Anything else stays uncoded and falls back to the raw
 * message — better an untranslated true message than a wrong translated one.
 */
function classifyRowError(message: string): ImportRowResult["errorCode"] {
  if (/name is required/i.test(message)) return "name_required";
  if (/14 digits/i.test(message)) return "invalid_national_id";
  if (/already exists/i.test(message)) return "already_exists";
  return undefined;
}

/**
 * Parse the CSV/TSV and import it. The route's single entry point: a top-level
 * parse failure (empty, no name column) comes back as a BusinessRuleError; a
 * per-row problem comes back inside the summary with the row still counted.
 */
export async function importStudentCsv(
  actor: ImportActor,
  csvText: string,
  opts: ImportOptions = {},
): Promise<ImportSummary> {
  const parsed = parseStudentCsv(csvText);
  if (!parsed.ok) throw new BusinessRuleError(parsed.error);
  const offset = opts.lineOffset ?? 0;
  const rows = offset ? parsed.rows.map((r) => ({ ...r, line: r.line + offset })) : parsed.rows;
  return importStudents(actor, rows, opts);
}

/**
 * Import already-parsed rows. Separated from parsing so it is testable without
 * a file, and so a future `.xlsx` reader can feed the same rows in.
 */
export async function importStudents(
  actor: ImportActor,
  rows: StudentCsvRow[],
  opts: ImportOptions = {},
): Promise<ImportSummary> {
  const dryRun = opts.dryRun ?? false;
  const centerId = centerOf(actor.acting);

  if (rows.length === 0) {
    throw new BusinessRuleError("The file has a header but no student rows");
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new BusinessRuleError(
      `This file has ${rows.length} rows; the limit is ${MAX_IMPORT_ROWS} per import. Split it and import each part.`,
    );
  }

  const results: ImportRowResult[] = [];
  // Within-file dedup: two rows sharing a phone / national ID are the same
  // child typed twice. The FIRST wins; later ones are reported as duplicates of
  // it rather than reused, so the person reading the report sees their own
  // double-entry instead of a silent merge.
  const seenPhone = new Map<string, number>();
  const seenNationalId = new Map<string, number>();

  let created = 0;
  let reused = 0;
  let duplicatesInFile = 0;
  let failed = 0;

  for (const row of rows) {
    const name = norm(row.name);
    try {
      if (!name) throw new BusinessRuleError("Name is required");

      const phone = norm(row.phone);
      // normalizeNationalId throws on a non-14-digit value — a per-row error,
      // never a whole-file failure.
      const nationalId = normalizeNationalId(row.nationalId);

      // Within-file duplicate check, before any DB work.
      const dupLine =
        (nationalId ? seenNationalId.get(nationalId) : undefined) ??
        (phone ? seenPhone.get(phone) : undefined);
      if (dupLine) {
        duplicatesInFile++;
        results.push({
          line: row.line,
          name,
          status: "duplicate_in_file",
          duplicateOfLine: dupLine,
        });
        continue;
      }
      if (nationalId) seenNationalId.set(nationalId, row.line);
      if (phone) seenPhone.set(phone, row.line);

      const outcome = await importOneRow(actor, centerId, { name, phone, nationalId, row }, dryRun);
      if (outcome.status === "created" || outcome.status === "would_create") created++;
      else reused++;
      results.push(outcome);
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({
        line: row.line,
        name: name ?? row.name,
        status: "error",
        errorCode: classifyRowError(message),
        error: message,
      });
    }
  }

  // ONE audit row for the whole import (not one per student — a 400-row file
  // must not write 400 audit rows). Skipped on a dry run, which writes nothing.
  if (!dryRun) {
    await scopedDb(actor.acting, async (tx) => {
      await tx.auditLog.create({
        data: {
          actorId: actor.actorId,
          action: "center.students_imported",
          targetType: "center",
          targetId: centerId,
          centerId,
          onBehalfOf: actor.onBehalfOf ?? null,
          afterState: { total: rows.length, created, reused, duplicatesInFile, failed },
        },
      });
    });
  }

  return {
    dryRun,
    total: rows.length,
    created,
    reused,
    duplicatesInFile,
    failed,
    rows: results,
  };
}

/**
 * One row, in its own transaction: find-or-create the student and put them on
 * the roster. On a dry run it only READS and reports what it WOULD do.
 */
async function importOneRow(
  actor: ImportActor,
  centerId: string,
  input: { name: string; phone: string | null; nationalId: string | null; row: StudentCsvRow },
  dryRun: boolean,
): Promise<ImportRowResult> {
  const { name, phone, nationalId, row } = input;

  return scopedDb(actor.acting, async (tx) => {
    const existing = await findStudentByKeys(tx, { phone, nationalId, studentCode: null });

    if (dryRun) {
      return existing
        ? {
            line: row.line,
            name,
            status: "would_reuse" as const,
            studentCode: existing.studentCode ?? undefined,
            matchedOn: existing.matchedOn === "student_code" ? undefined : existing.matchedOn,
          }
        : { line: row.line, name, status: "would_create" as const };
    }

    if (existing) {
      // Reuse. Backfill the national ID only when the record is missing one —
      // never overwrite the family's own data (same rule as the counter).
      const profile = await tx.studentProfile.findUnique({
        where: { userId: existing.userId },
        select: { id: true, studentCode: true, nationalId: true },
      });
      if (nationalId && profile && !profile.nationalId) {
        await tx.studentProfile.update({ where: { id: profile.id }, data: { nationalId } });
      }
      await upsertRoster(tx, centerId, existing.userId, row);
      return {
        line: row.line,
        name,
        status: "reused",
        studentId: existing.userId,
        studentCode: existing.studentCode ?? profile?.studentCode ?? undefined,
        matchedOn: existing.matchedOn === "student_code" ? undefined : existing.matchedOn,
      };
    }

    // Create — same shell shape as a walk-in: no password, no login, until the
    // student claims an invite. The DB unique keys are the backstop under a
    // race the JS-level dedup cannot see (a concurrent import or counter).
    let studentId: string;
    let studentCode: string;
    try {
      const shell = await tx.user.create({
        data: { name, phone, role: "student", status: "shell", passwordHash: null },
      });
      const profile = await tx.studentProfile.create({
        data: {
          userId: shell.id,
          fullName: name,
          phone,
          nationalId,
          entityType: "invited",
          inviteCode: generateInviteCode(),
          familyLinkCode: generateFamilyCode(),
          guardianEmail: norm(row.guardianEmail),
          guardianPhone: norm(row.guardianPhone),
        },
      });
      studentId = shell.id;
      studentCode = profile.studentCode;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // A unique phone / national ID already exists — created a moment ago by
        // a concurrent writer, or duplicated across two files. Surface it as a
        // per-row error rather than a crash; a re-import will REUSE it.
        throw new BusinessRuleError(
          "A student with this phone or national ID already exists — re-run the import to link them",
        );
      }
      throw err;
    }

    await upsertRoster(tx, centerId, studentId, row);
    return { line: row.line, name, status: "created", studentId, studentCode };
  });
}

/**
 * Roster membership, idempotent: a child already on the roster is left as-is; a
 * child who previously left rejoins on the SAME row (never a second one). Same
 * behaviour as the counter's roster handling.
 */
async function upsertRoster(
  tx: TenantTx,
  centerId: string,
  studentId: string,
  row: StudentCsvRow,
): Promise<void> {
  const roster = await tx.centerStudentRoster.findUnique({
    where: { centerId_studentId: { centerId, studentId } },
  });
  if (!roster) {
    await tx.centerStudentRoster.create({
      data: {
        centerId,
        studentId,
        dataSource: "manual",
        operationalParentName: norm(row.guardianName),
        operationalParentPhone: norm(row.guardianPhone),
      },
    });
  } else if (roster.leftAt) {
    await tx.centerStudentRoster.update({ where: { id: roster.id }, data: { leftAt: null } });
  }
}
