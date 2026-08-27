import { platformDb } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import {
  approveAgreementTx,
  rejectAgreementTx,
  terminateAgreementTx,
  listAgreementProposals,
} from "@repo/server-core/services/finance/agreements";

async function audit(
  actor: SessionUser,
  centerId: string,
  action: string,
  targetId: string,
  after: Record<string, unknown>,
) {
  await platformDb(
    (tx) =>
      tx.auditLog.create({
        data: {
          actorId: actor.id,
          action,
          targetType: "teacher_agreement",
          targetId,
          centerId,
          afterState: after as never,
          onBehalfOf: null,
        },
      }),
    { actorId: actor.id },
  );
}

export function listProposals(status?: string) {
  return listAgreementProposals({ status });
}

export async function approveAgreement(
  proposalId: string,
  user: SessionUser,
  effectiveFrom?: string,
) {
  const row = await platformDb(
    (tx) =>
      approveAgreementTx(
        tx,
        proposalId,
        user.id,
        effectiveFrom ? new Date(effectiveFrom) : new Date(),
      ),
    { actorId: user.id },
  );
  await audit(user, row.centerId, "teacher_agreement.approved", row.id, {
    teacherId: row.teacherId,
    basis: row.basis,
    rateBp: row.rateBp,
    rateFlat: row.rateFlat,
    residual: row.residual,
    effectiveFrom: row.effectiveFrom,
  });
  return row;
}

export async function rejectAgreement(proposalId: string, user: SessionUser) {
  const row = await platformDb((tx) => rejectAgreementTx(tx, proposalId, user.id), {
    actorId: user.id,
  });
  await audit(user, row.centerId, "teacher_agreement.rejected", row.id, {
    teacherId: row.teacherId,
  });
  return row;
}

export async function terminateAgreement(agreementId: string, user: SessionUser) {
  const row = await platformDb((tx) => terminateAgreementTx(tx, agreementId), {
    actorId: user.id,
  });
  await audit(user, row.centerId, "teacher_agreement.terminated", row.id, {
    teacherId: row.teacherId,
    endedAt: row.endedAt,
  });
  return row;
}
