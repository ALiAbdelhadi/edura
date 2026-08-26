import { platformDb, scopedDb, type TenantTx } from "../../db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";

// ===========================================================================
// TEACHER AGREEMENTS (Phase 5, D1/D2) — resolution + the proposal workflow.
//
// GOVERNANCE (D2): the ERP writes PROPOSALS ONLY. `proposeAgreement` is the
// single center-side writer and it can only ever produce status='proposed' —
// center-share-governance keeps its exact meaning: no rate crosses the app
// boundary until a superadmin approval activates it. Approval/rejection/
// termination live in apps/superadmin's service layer, which calls the tx
// helpers below and audits.
//
// RESOLUTION (D1): effective-dated. A lesson settles under the row that was
// live ON ITS DATE — `effective_from <= date < ended_at` — so a reopen-and-
// settle-later still answers with the agreement the lesson happened under.
// Proposed/rejected rows never resolve.
// ===========================================================================

export type ResolvedAgreement = {
  id: string;
  basis: "percent_of_net" | "fixed_per_student";
  rateBp: number | null;
  rateFlat: number | null;
  residual: "teacher" | "center";
};

/** The agreement live for this pair ON this date, or null. */
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

/** D2 — the CENTER's writer: proposals only, never a rate in force. */
export async function proposeAgreement(input: AgreementProposalInput, user: SessionUser) {
  if (user.role !== "center_admin" || !user.centerId) throw new ForbiddenError();
  const centerId = user.centerId;
  assertRateShape(input);

  return scopedDb(user, async (tx) => {
    // The teacher must actually work with this center.
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

    const created = await tx.teacherAgreement.create({
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
    });

    // PRECEDENCE warning (D1): an agreement governs NO-ROOM courses only. If
    // every active course of this pair is room-based, say so at creation —
    // the proposal is legal but currently reaches nothing.
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

// ---------------------------------------------------------------------------
// Tx helpers for the SUPERADMIN service layer (which audits around them).
// ---------------------------------------------------------------------------

/** Approve a proposal: end any live row for the pair at `effectiveFrom`, then
 *  activate this one. One tx — the partial unique one_active_per_pair holds. */
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
  return tx.teacherAgreement.update({
    where: { id: proposal.id },
    data: { status: "active", approvedBy, effectiveFrom },
  });
}

export async function rejectAgreementTx(tx: TenantTx, proposalId: string, rejectedBy: string) {
  const proposal = await tx.teacherAgreement.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new NotFoundError("Agreement proposal not found");
  if (proposal.status !== "proposed") {
    throw new BusinessRuleError("Only a pending proposal can be rejected");
  }
  return tx.teacherAgreement.update({
    where: { id: proposal.id },
    data: { status: "rejected", approvedBy: rejectedBy },
  });
}

/** End the live agreement now — the pair falls back to the affiliation rate. */
export async function terminateAgreementTx(tx: TenantTx, agreementId: string) {
  const row = await tx.teacherAgreement.findUnique({ where: { id: agreementId } });
  if (!row) throw new NotFoundError("Agreement not found");
  if (row.status !== "active") throw new BusinessRuleError("Only an active agreement can be ended");
  return tx.teacherAgreement.update({
    where: { id: agreementId },
    data: { status: "ended", endedAt: new Date() },
  });
}

/** Platform-wide proposal queue (superadmin list). */
export function listAgreementProposals(filters: { status?: string } = {}) {
  return platformDb((tx) =>
    tx.teacherAgreement.findMany({
      where: { status: (filters.status ?? "proposed") as never },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  );
}
