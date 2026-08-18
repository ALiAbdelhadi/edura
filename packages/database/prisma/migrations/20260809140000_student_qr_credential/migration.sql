-- ===========================================================================
-- بطاقة الطالب — the QR credential's persisted state.
--
-- The card's QR stops being a picture of the student code and becomes a SIGNED
-- credential. What has to live in the database is the part a signature cannot
-- carry on its own: WHICH ISSUE of the card is currently valid.
--
-- ── WHY COLUMNS AND NOT A TABLE ────────────────────────────────────────────
--
-- Every read of the card already loads `student_profiles`, so these ride along
-- with zero extra queries and zero joins on a path a receptionist waits on. A
-- `student_qr_credentials` table would have bought a reissue HISTORY, and this
-- codebase already has one place history lives: `audit_logs`, which every
-- reissue and revocation writes to.
--
-- ── AND WHY NO SECRET IS STORED ────────────────────────────────────────────
--
-- The signature is DERIVED — HMAC(STUDENT_QR_SECRET, code|version) — never
-- persisted, not even as a hash. So this migration adds no secret material:
-- a dump of this table is not a kit for forging cards, and the card can still
-- be re-rendered years later from the student's own row.
--
-- Revocation is therefore a bump, not a deletion: raising `qr_version`
-- invalidates every card ever printed at the old version, everywhere, at once.
--
-- ADDITIVE ONLY. `DEFAULT 1` covers every existing row, so no backfill runs
-- and every student already on the platform has a valid card the moment this
-- lands. `qr_issued_at` is NULL for those rows on purpose — we know when a
-- card was REISSUED, and claiming a first-issue date we never recorded would
-- be inventing one.
-- ===========================================================================

ALTER TABLE "student_profiles"
  ADD COLUMN "qr_version"        INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "qr_issued_at"      TIMESTAMPTZ(6),
  ADD COLUMN "qr_revoked_at"     TIMESTAMPTZ(6),
  ADD COLUMN "qr_revoked_reason" TEXT;

-- Version 0 would make `qr_version` indistinguishable from "unset" in a
-- payload, and a negative one is nonsense the signer would happily sign.
ALTER TABLE "student_profiles"
  ADD CONSTRAINT "student_profiles_qr_version_positive" CHECK ("qr_version" >= 1);

-- A revocation reason is not optional: the counter SHOWS it to the person
-- holding the refused card ("reported lost"), and a revocation nobody can
-- explain is one nobody can safely undo.
ALTER TABLE "student_profiles"
  ADD CONSTRAINT "student_profiles_qr_revoked_reason_present"
  CHECK (("qr_revoked_at" IS NULL) = ("qr_revoked_reason" IS NULL));
