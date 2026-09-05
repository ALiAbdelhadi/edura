import { platformDb } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import { writeAdminAudit } from "@/lib/services/admin/admin-audit";
import {
  approveAgreementTx,
  rejectAgreementTx,
  terminateAgreementTx,
  listAgreementProposals,
} from "@repo/server-core/services/finance/agreements";

export function listProposals(status?: string) {
  return listAgreementProposals({ status });
}

export function approveAgreement(proposalId: string, user: SessionUser, effectiveFrom?: string) {
  return platformDb(
    async (tx) => {
      const row = await approveAgreementTx(
        tx,
        proposalId,
        user.id,
        effectiveFrom ? new Date(effectiveFrom) : new Date(),
      );
      await writeAdminAudit(tx, user, {
        action: "teacher_agreement.approved",
        targetType: "teacher_agreement",
        targetId: row.id,
        centerId: row.centerId,
        after: {
          teacherId: row.teacherId,
          basis: row.basis,
          rateBp: row.rateBp,
          rateFlat: row.rateFlat,
          residual: row.residual,
          effectiveFrom: row.effectiveFrom,
        },
      });
      return row;
    },
    { actorId: user.id },
  );
}

export function rejectAgreement(proposalId: string, user: SessionUser) {
  return platformDb(
    async (tx) => {
      const row = await rejectAgreementTx(tx, proposalId, user.id);
      await writeAdminAudit(tx, user, {
        action: "teacher_agreement.rejected",
        targetType: "teacher_agreement",
        targetId: row.id,
        centerId: row.centerId,
        after: { teacherId: row.teacherId },
      });
      return row;
    },
    { actorId: user.id },
  );
}

export function terminateAgreement(agreementId: string, user: SessionUser) {
  return platformDb(
    async (tx) => {
      const row = await terminateAgreementTx(tx, agreementId);
      await writeAdminAudit(tx, user, {
        action: "teacher_agreement.terminated",
        targetType: "teacher_agreement",
        targetId: row.id,
        centerId: row.centerId,
        after: { teacherId: row.teacherId, endedAt: row.endedAt },
      });
      return row;
    },
    { actorId: user.id },
  );
}
