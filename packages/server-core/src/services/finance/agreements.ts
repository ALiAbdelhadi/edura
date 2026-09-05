import { platformDb, scopedDb, type TenantTx } from "../../db/scope";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from "../../errors/classes";
import { isUniqueViolation } from "../../errors/prisma";
import { AGREEMENT_ONE_ACTIVE_PER_PAIR, AGREEMENT_ONE_PROPOSED_PER_PAIR } from "../../db/unique-indexes";
import type { Prisma } from "@repo/database";
import type { SessionUser } from "../../auth/types";

export type ResolvedAgreement = {
  id: string;
  basis: "percent_of_net" | "fixed_per_student";
  rateBp: number | null;
  rateFlat: number | null;
  residual: "teacher" | "center";
};

export async function resolveTeacherAgreement(
  tx: TenantTx,
  args: { centerId: string; teacherId: string; onDate: Date },
): Promise<ResolvedAgreement | null> {
  const row = await tx.teacherAgreement.findFirst({
    where: {
      centerId: args.centerId,
      teacherId: args.teacherId,
      status: { in: ["active", "ended"] },
      effectiveFrom: { lte: args.onDate },
      OR: [{ endedAt: null }, { endedAt: { gt: args.onDate } }],
    },
    orderBy: { effectiveFrom: "desc" },
    select: { id: true, basis: true, rateBp: true, rateFlat: true, residual: true },
  });
  return row ?? null;
}

export type AgreementProposalInput = {
  teacherId: string;
  basis: "percent_of_net" | "fixed_per_student";
  rateBp?: number | null;
  rateFlat?: number | null;
  residual?: "teacher" | "center";
  note?: string;
};

function assertRateShape(input: AgreementProposalInput) {
  if (input.basis === "percent_of_net") {
    if (
      input.rateBp == null ||
      !Number.isInteger(input.rateBp) ||
      input.rateBp < 0 ||
      input.rateBp > 10_000 ||
      input.rateFlat != null
    ) {
      throw new BusinessRuleError("percent_of_net needs rateBp between 0 and 10000, and no rateFlat");
    }
  } else {
    if (
      input.rateFlat == null ||
      !Number.isInteger(input.rateFlat) ||
      input.rateFlat <= 0 ||
      input.rateBp != null
    ) {
      throw new BusinessRuleError("fixed_per_student needs a positive rateFlat, and no rateBp");
    }
  }
}

export async function proposeAgreement(input: AgreementProposalInput, user: SessionUser) {
  if (user.role !== "center_admin" || !user.centerId) throw new ForbiddenError();
  const centerId = user.centerId;
  assertRateShape(input);

  return scopedDb(user, async (tx) => {
    const affiliation = await tx.centerTeacherAffiliation.findFirst({
      where: { centerId, teacherId: input.teacherId, status: "active" },
      select: { id: true },
    });
    if (!affiliation) throw new BusinessRuleError("No active affiliation with this teacher");

    const pending = await tx.teacherAgreement.findFirst({
      where: { centerId, teacherId: input.teacherId, status: "proposed" },
      select: { id: true },
    });
    if (pending) {
      throw new BusinessRuleError("A proposal for this teacher is already awaiting approval");
    }

    const created = await tx.teacherAgreement
      .create({
        data: {
          centerId,
          teacherId: input.teacherId,
          basis: input.basis,
          rateBp: input.basis === "percent_of_net" ? input.rateBp : null,
          rateFlat: input.basis === "fixed_per_student" ? input.rateFlat : null,
          residual: input.residual ?? "teacher",
          status: "proposed",
          proposedBy: user.id,
          note: input.note ?? null,
        },
      })
      .catch((err: unknown) => {
        // The findFirst above is advisory; the partial unique
        // teacher_agreements_one_proposed_per_pair is the real guard under a
        // concurrent double-submit (C-5). Same class and message as the
        // sequential check, so the client shows one string for both orderings.
        if (isUniqueViolation(err, AGREEMENT_ONE_PROPOSED_PER_PAIR)) {
          throw new BusinessRuleError("A proposal for this teacher is already awaiting approval");
        }
        throw err;
      });

    const noRoomCourses = await tx.course.count({
      where: {
        centerId,
        teacherId: input.teacherId,
        status: "active",
        pricingMethod: null,
        splitPlatformBp: null,
      },
    });
    return {
      ...created,
      warning:
        noRoomCourses === 0
          ? "every active course of this pair is room-based; the agreement will govern nothing until a no-room course exists"
          : null,
    };
  });
}

export async function listCenterAgreements(user: SessionUser, teacherId?: string) {
  if (user.role !== "center_admin" || !user.centerId) throw new ForbiddenError();
  const centerId = user.centerId;
  return scopedDb(user, (tx) =>
    tx.teacherAgreement.findMany({
      where: { centerId, ...(teacherId ? { teacherId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  );
}

/**
 * Moves one agreement row out of `from` and into whatever `data` says, and
 * reports whether THIS caller is the one that moved it.
 *
 * Every decide below used to be read-check-update: two concurrent requests both
 * read `proposed`, both passed the check, and both ran the update -- so the
 * second silently overwrote the first's `approvedBy` and the row recorded the
 * wrong deciding admin. Making the status the update's own WHERE clause means
 * exactly one of them writes; the loser sees `count === 0` and is told the
 * transition is no longer available.
 */
async function transitionAgreement(
  tx: TenantTx,
  agreementId: string,
  from: Prisma.TeacherAgreementWhereInput["status"],
  data: Prisma.TeacherAgreementUpdateManyMutationInput,
): Promise<boolean> {
  const moved = await tx.teacherAgreement.updateMany({
    where: { id: agreementId, status: from },
    data,
  });
  return moved.count > 0;
}

export async function approveAgreementTx(
  tx: TenantTx,
  proposalId: string,
  approvedBy: string,
  effectiveFrom: Date = new Date(),
) {
  const proposal = await tx.teacherAgreement.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new NotFoundError("Agreement proposal not found");
  if (proposal.status !== "proposed") {
    throw new BusinessRuleError("Only a pending proposal can be approved");
  }
  const current = await tx.teacherAgreement.findFirst({
    where: { centerId: proposal.centerId, teacherId: proposal.teacherId, status: "active" },
  });
  if (current) {
    if (current.effectiveFrom && current.effectiveFrom >= effectiveFrom) {
      throw new BusinessRuleError(
        "effectiveFrom must be after the current agreement's own start",
      );
    }
    await tx.teacherAgreement.update({
      where: { id: current.id },
      data: { status: "ended", endedAt: effectiveFrom },
    });
  }

  const won = await transitionAgreement(tx, proposal.id, "proposed", {
    status: "active",
    approvedBy,
    effectiveFrom,
  }).catch((err: unknown) => {
    // The partial unique `teacher_agreements_one_active_per_pair` is what
    // actually enforces "one live rate per pair" -- Prisma cannot express it,
    // so the check above is advisory and this is the real guard. Left unmapped
    // it surfaced as a bare 409 "a record with these unique values already
    // exists", which tells an admin nothing about what to do next.
    if (isUniqueViolation(err, AGREEMENT_ONE_ACTIVE_PER_PAIR)) {
      throw new ConflictError(
        "Another agreement for this teacher was activated at the same time; reload and try again",
      );
    }
    throw err;
  });
  if (!won) throw new BusinessRuleError("Only a pending proposal can be approved");

  return tx.teacherAgreement.findUniqueOrThrow({ where: { id: proposal.id } });
}

export async function rejectAgreementTx(tx: TenantTx, proposalId: string, rejectedBy: string) {
  const proposal = await tx.teacherAgreement.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new NotFoundError("Agreement proposal not found");
  if (proposal.status !== "proposed") {
    throw new BusinessRuleError("Only a pending proposal can be rejected");
  }
  const won = await transitionAgreement(tx, proposal.id, "proposed", {
    status: "rejected",
    approvedBy: rejectedBy,
  });
  if (!won) throw new BusinessRuleError("Only a pending proposal can be rejected");
  return tx.teacherAgreement.findUniqueOrThrow({ where: { id: proposal.id } });
}

export async function terminateAgreementTx(tx: TenantTx, agreementId: string) {
  const row = await tx.teacherAgreement.findUnique({ where: { id: agreementId } });
  if (!row) throw new NotFoundError("Agreement not found");
  if (row.status !== "active") throw new BusinessRuleError("Only an active agreement can be ended");
  const won = await transitionAgreement(tx, agreementId, "active", {
    status: "ended",
    endedAt: new Date(),
  });
  if (!won) throw new BusinessRuleError("Only an active agreement can be ended");
  return tx.teacherAgreement.findUniqueOrThrow({ where: { id: agreementId } });
}

export function listAgreementProposals(filters: { status?: string } = {}) {
  return platformDb((tx) =>
    tx.teacherAgreement.findMany({
      where: { status: (filters.status ?? "proposed") as never },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  );
}
