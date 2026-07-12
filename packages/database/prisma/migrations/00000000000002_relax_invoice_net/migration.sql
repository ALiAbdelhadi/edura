-- A statement invoice can legitimately have a NEGATIVE net_amount (e.g. a
-- center that owes the platform more than it earned when centerShare is 0).
-- Keep subtotal/commission non-negative (they are sums), but allow net_amount
-- to be negative.
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_amounts_nonneg";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_nonneg" CHECK (
  coalesce("subtotal", 0) >= 0 AND coalesce("commission", 0) >= 0
);
