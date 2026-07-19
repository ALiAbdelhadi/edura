-- Step 5: collaboration requests. REPLACES ClassroomBooking (dropped below —
-- pre-launch decision #3, no data migration: legacy per-session room-booking
-- test rows with no UI, superseded by the schedule-proposal model).

CREATE TYPE collaboration_initiator AS ENUM ('teacher', 'center');
CREATE TYPE collaboration_status AS ENUM ('pending', 'accepted', 'rejected', 'cancelled', 'expired');

CREATE TABLE collaboration_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator             collaboration_initiator NOT NULL,
  teacher_id            uuid NOT NULL,
  center_id             uuid NOT NULL,
  subject_id            uuid NOT NULL,
  grade_level_id        uuid NOT NULL,
  track_id              uuid,
  room_id               uuid,
  days_of_week          integer[] NOT NULL,
  start_time            text NOT NULL,
  end_time              text NOT NULL,
  start_date            timestamptz NOT NULL,
  end_date              timestamptz,
  expected_students     integer,
  proposed_center_share integer NOT NULL,
  message               text,
  status                collaboration_status NOT NULL DEFAULT 'pending',
  responded_at          timestamptz,
  responded_by          uuid,
  response_note         text,
  course_id             uuid,
  affiliation_id        uuid,
  expires_at            timestamptz NOT NULL,
  created_by            uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collab_share_range CHECK (proposed_center_share BETWEEN 0 AND 99999900),
  CONSTRAINT collab_expected_positive CHECK (expected_students IS NULL OR expected_students > 0),
  CONSTRAINT collab_time_shape CHECK (start_time ~ '^\d\d:\d\d$' AND end_time ~ '^\d\d:\d\d$')
);

-- Duplicate guard: at most one OPEN request per teacher+center+subject,
-- regardless of which side initiated.
CREATE UNIQUE INDEX collab_one_open ON collaboration_requests (teacher_id, center_id, subject_id)
  WHERE status = 'pending';

CREATE INDEX collab_teacher_status_idx ON collaboration_requests (teacher_id, status);
CREATE INDEX collab_center_status_idx ON collaboration_requests (center_id, status);
CREATE INDEX collab_status_expires_idx ON collaboration_requests (status, expires_at);

-- Center-scoped RLS, same tenant_isolation policy as the other center tables
-- (teachers operate via platform context with app-layer scoping).
ALTER TABLE collaboration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON collaboration_requests
  USING (rls_bypass() OR center_id = current_center_id())
  WITH CHECK (rls_bypass() OR center_id = current_center_id());

COMMENT ON TABLE collaboration_requests IS 'Teacher<->center collaboration proposals (Step 5). Acceptance creates affiliation + course + sessions transactionally.';

-- Retire ClassroomBooking.
DROP TABLE IF EXISTS classroom_bookings;
DROP TYPE IF EXISTS booking_status;
