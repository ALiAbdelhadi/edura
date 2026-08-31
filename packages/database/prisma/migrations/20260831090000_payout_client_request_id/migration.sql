-- Keyed idempotency for payout requests: a client retry after a timeout must
-- resolve to the SAME payout row, not mint a second one. Legacy rows and
-- keyless callers carry NULL, which Postgres treats as distinct under a
-- unique index, so they keep the amount-based replay guard instead.
ALTER TABLE "payouts" ADD COLUMN "client_request_id" TEXT;

CREATE UNIQUE INDEX "payouts_client_request_unique"
  ON "payouts" ("beneficiary_id", "client_request_id");
