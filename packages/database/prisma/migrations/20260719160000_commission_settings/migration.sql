-- Step 4.5: configurable platform commission. Additive only.
-- Scoped rows: one global default (inserted below so every environment
-- resolves without seeding); per-center / per-teacher overrides are future
-- ROWS, not future migrations.

CREATE TYPE commission_scope AS ENUM ('global', 'center', 'teacher');

CREATE TABLE commission_settings (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                        commission_scope NOT NULL DEFAULT 'global',
  center_id                    uuid,
  teacher_id                   uuid,
  teacher_direct_commission_bp integer NOT NULL CHECK (teacher_direct_commission_bp BETWEEN 0 AND 10000),
  platform_teacher_fee         integer NOT NULL CHECK (platform_teacher_fee >= 0),
  platform_center_fee          integer NOT NULL CHECK (platform_center_fee >= 0),
  updated_by                   uuid,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_scope_shape CHECK (
    (scope = 'global' AND center_id IS NULL AND teacher_id IS NULL) OR
    (scope = 'center' AND center_id IS NOT NULL AND teacher_id IS NULL) OR
    (scope = 'teacher' AND teacher_id IS NOT NULL AND center_id IS NULL)
  )
);

-- Exactly one global row; at most one override per center / per teacher.
CREATE UNIQUE INDEX commission_one_global ON commission_settings ((true)) WHERE scope = 'global';
CREATE UNIQUE INDEX commission_one_per_center ON commission_settings (center_id) WHERE scope = 'center';
CREATE UNIQUE INDEX commission_one_per_teacher ON commission_settings (teacher_id) WHERE scope = 'teacher';

CREATE INDEX commission_settings_scope_idx ON commission_settings (scope);

-- Platform defaults: 15% teacher-direct commission, 2 EGP + 2 EGP flat
-- per-present-student platform fees on the center split (PRD §5.1).
INSERT INTO commission_settings (scope, teacher_direct_commission_bp, platform_teacher_fee, platform_center_fee)
VALUES ('global', 1500, 200, 200);

COMMENT ON TABLE commission_settings IS 'Platform commission config (Step 4.5). Global default row + future scoped overrides. App-scoped, no RLS.';
