-- Step 3: Paymob payment foundation — payment_intents.
-- Additive only. Money-table style (no FK constraints, cf. payments/transactions).

CREATE TYPE payment_gateway AS ENUM ('mock', 'paymob');
CREATE TYPE payment_intent_method AS ENUM ('card', 'wallet');
CREATE TYPE payment_intent_status AS ENUM ('pending', 'paid', 'failed', 'expired');

CREATE TABLE payment_intents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid NOT NULL,
  course_id        uuid,
  center_id        uuid,
  amount           integer NOT NULL CHECK (amount > 0),
  currency         text NOT NULL DEFAULT 'EGP',
  method           payment_intent_method NOT NULL,
  gateway          payment_gateway NOT NULL,
  status           payment_intent_status NOT NULL DEFAULT 'pending',
  idempotency_key  text NOT NULL,
  gateway_order_id text,
  gateway_ref      text,
  failure_reason   text,
  webhook_payload  jsonb,
  payment_id       uuid,
  transaction_id   uuid,
  expires_at       timestamptz NOT NULL,
  paid_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_intents_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT payment_intents_gateway_order_id_key UNIQUE (gateway_order_id),
  CONSTRAINT payment_intents_paid_consistency CHECK (status <> 'paid' OR paid_at IS NOT NULL)
);

-- App-layer scoped by design (like sessions/grade_scores): platform-level money
-- object read by back-office roles and the owning student; NOT added to the
-- tenant_isolation RLS set.
COMMENT ON TABLE payment_intents IS 'Online payment intents (gateway checkout lifecycle). App-scoped, no RLS.';

CREATE INDEX payment_intents_student_created_idx ON payment_intents (student_id, created_at DESC);
CREATE INDEX payment_intents_status_created_idx  ON payment_intents (status, created_at DESC);
CREATE INDEX payment_intents_center_created_idx  ON payment_intents (center_id, created_at DESC);
