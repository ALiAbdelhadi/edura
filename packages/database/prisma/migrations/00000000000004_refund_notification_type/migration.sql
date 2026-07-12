-- Refund/reversal support: a dedicated notification type for issued refunds
-- (PRD §6 — "payment received" analogue). ADD VALUE is idempotent and safe on
-- PG12+ (Neon is PG15).
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'payment_refunded';
