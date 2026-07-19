-- Step 4: subscriptions — the biggest schema change of the roadmap.
-- Everything here is additive or constraint-relaxing (DROP NOT NULL); no data
-- is modified or destroyed.

CREATE TYPE subscription_target AS ENUM ('teacher', 'center');
CREATE TYPE subscription_plan AS ENUM ('monthly', 'per_session');
CREATE TYPE subscription_status AS ENUM ('pending_payment', 'active', 'expired', 'cancelled');
CREATE TYPE subscription_source AS ENUM ('online', 'walk_in');

-- Teacher-direct groundwork: NULL center_id = teacher-owned (NO shadow
-- centers). Under the existing tenant_isolation policies, NULL center_id rows
-- are visible only under rls_bypass() — the documented intended behavior —
-- so no policy changes are needed: teacher-direct rows are app-layer scoped
-- exactly like the sessions table.
ALTER TABLE courses ALTER COLUMN center_id DROP NOT NULL;
ALTER TABLE courses ADD COLUMN price_per_month integer CHECK (price_per_month > 0);
ALTER TABLE courses ADD COLUMN price_per_session integer CHECK (price_per_session > 0);
ALTER TABLE courses ADD COLUMN location text;
ALTER TABLE enrollments ALTER COLUMN center_id DROP NOT NULL;
ALTER TABLE attendance_records ALTER COLUMN center_id DROP NOT NULL;
ALTER TABLE payments ALTER COLUMN center_id DROP NOT NULL;

-- Online payments can now pay for a subscription.
ALTER TABLE payment_intents ADD COLUMN subscription_id uuid;

-- Teacher-direct receipts have no center receipt_seq — platform-wide sequence
-- (RCP-EDURA-YYYY-NNNNN).
CREATE SEQUENCE platform_receipt_seq;

CREATE TABLE subscriptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid NOT NULL,
  target_type       subscription_target NOT NULL,
  teacher_id        uuid NOT NULL,
  center_id         uuid,
  course_id         uuid NOT NULL,
  session_id        uuid,
  subject_id        uuid,
  grade_level_id    uuid,
  track_id          uuid,
  plan              subscription_plan NOT NULL,
  price             integer NOT NULL,
  currency          text NOT NULL DEFAULT 'EGP',
  payment_method    payment_method,
  status            subscription_status NOT NULL DEFAULT 'pending_payment',
  source            subscription_source NOT NULL,
  period_start      timestamptz,
  period_end        timestamptz,
  enrollment_id     uuid,
  payment_intent_id uuid,
  payment_id        uuid,
  created_by        uuid,
  activated_at      timestamptz,
  cancelled_at      timestamptz,
  is_demo           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subs_target_shape CHECK (
    (target_type = 'center' AND center_id IS NOT NULL) OR
    (target_type = 'teacher' AND center_id IS NULL)
  ),
  CONSTRAINT subs_plan_session CHECK (
    (plan = 'per_session' AND session_id IS NOT NULL) OR
    (plan = 'monthly' AND session_id IS NULL)
  ),
  CONSTRAINT subs_price_positive CHECK (price > 0),
  CONSTRAINT subs_active_needs_activation CHECK (status <> 'active' OR activated_at IS NOT NULL)
);

-- One live monthly subscription per (student, course); one live single-session
-- pass per (student, session).
CREATE UNIQUE INDEX subs_one_active_monthly ON subscriptions (student_id, course_id)
  WHERE status = 'active' AND plan = 'monthly';
CREATE UNIQUE INDEX subs_one_active_pass ON subscriptions (student_id, session_id)
  WHERE status = 'active' AND plan = 'per_session';

CREATE INDEX subs_student_created_idx ON subscriptions (student_id, created_at DESC);
CREATE INDEX subs_course_status_idx ON subscriptions (course_id, status);
CREATE INDEX subs_center_status_idx ON subscriptions (center_id, status);
CREATE INDEX subs_teacher_status_idx ON subscriptions (teacher_id, status);
CREATE INDEX subs_status_period_end_idx ON subscriptions (status, period_end);
CREATE INDEX subs_session_idx ON subscriptions (session_id);

-- RLS: center-target subscriptions are tenant-visible to their center (walk-in
-- management at the counter); teacher-target rows (NULL center_id) are
-- bypass-only per the documented convention.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON subscriptions
  USING (rls_bypass() OR center_id = current_center_id())
  WITH CHECK (rls_bypass() OR center_id = current_center_id());

COMMENT ON TABLE subscriptions IS 'Payment coverage wrapping enrollment (Step 4). Center rows tenant-scoped; teacher-direct rows bypass-only/app-scoped.';
