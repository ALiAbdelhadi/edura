import { Prisma } from "@repo/database";
import { scopedDb, type TenantTx } from "../../db/scope";
import { isOnCenterRoster } from "./roster-membership";
import { BusinessRuleError, ForbiddenError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { generateFamilyCode, generateInviteCode } from "../../utils/random";
import {
  findStudentByKeys,
  normalizeNationalId,
} from "../external-teachers/manual-students";
import { parseStudentCsv, type StudentCsvRow } from "./student-csv";

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
  matchedOn?: "phone" | "national_id";
  onOurRoster?: boolean;
  duplicateOfLine?: number;
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

function classifyRowError(message: string): ImportRowResult["errorCode"] {
  if (/name is required/i.test(message)) return "name_required";
  if (/14 digits/i.test(message)) return "invalid_national_id";
  if (/already exists/i.test(message)) return "already_exists";
  return undefined;
}

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
      const nationalId = normalizeNationalId(row.nationalId);

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
      if (!existing) return { line: row.line, name, status: "would_create" as const };

      // A dry run writes nothing and leaves no audit row, so what it echoes is all
      // the caller gets — and a global match must not turn it into a lookup service.
      // For a student this centre does not already hold, the answer is limited to
      // "a record exists": no student code, and not even which key matched, because
      // "matched on national_id" confirms a national ID the caller merely guessed.
      const onOurRoster = await isOnCenterRoster(tx, centerId, existing.userId);
      if (!onOurRoster) {
        return { line: row.line, name, status: "would_reuse" as const, onOurRoster: false };
      }
      return {
        line: row.line,
        name,
        status: "would_reuse" as const,
        onOurRoster: true,
        studentCode: existing.studentCode ?? undefined,
        matchedOn: existing.matchedOn === "student_code" ? undefined : existing.matchedOn,
      };
    }

    if (existing) {
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
