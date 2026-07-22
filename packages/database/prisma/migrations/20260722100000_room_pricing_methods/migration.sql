-- Room Pricing Methods — two calculation modes for the center's share of a
-- room-based course. Additive, migration-safe (one CHECK swap, backfilled first).
--
-- Method 1 (whole_room_percent)    = the EXISTING 3-way % split, unchanged.
-- Method 2 (per_attending_student) = NEW: superadmin-set rate × actual
--   attendees, settled per session at completion through the same ledger.
--
-- Control model: superadmin sets every number (split % AND the Method-2 rate,
-- room > center > global); the center only picks which methods each room
-- allows; the teacher only picks a method when both are allowed.

-- ---------------------------------------------------------------------------
-- 1. The method enum (new type — safe to create AND use in one migration;
--    only ALTER TYPE ... ADD VALUE needs its own migration)
-- ---------------------------------------------------------------------------
CREATE TYPE room_pricing_method AS ENUM ('whole_room_percent', 'per_attending_student');

-- ---------------------------------------------------------------------------
-- 2. Per-room method availability (center-set; NOT a number)
-- ---------------------------------------------------------------------------
ALTER TABLE rooms ADD COLUMN allowed_pricing_methods room_pricing_method[]
  NOT NULL DEFAULT '{whole_room_percent}';
ALTER TABLE rooms ADD CONSTRAINT rooms_methods_nonempty
  CHECK (cardinality(allowed_pricing_methods) BETWEEN 1 AND 2);
COMMENT ON COLUMN rooms.allowed_pricing_methods IS
  'Which pricing methods this room offers. One value = forced; two = teacher chooses at booking. Center-set availability only — the numbers stay superadmin-only (commission_settings).';

-- ---------------------------------------------------------------------------
-- 3. Method-2 rate on commission_settings (superadmin-only, room>center>global)
--    At most ONE of flat-fee / bp set per row. No global default is seeded on
--    purpose: a room can only enable Method 2 once superadmin has configured a
--    rate that resolves for it (no invented numbers).
-- ---------------------------------------------------------------------------
ALTER TABLE commission_settings
  ADD COLUMN center_per_student_fee integer,
  ADD COLUMN center_per_student_bp  integer;

ALTER TABLE commission_settings ADD CONSTRAINT commission_m2_rate_shape CHECK (
  (center_per_student_fee IS NULL OR center_per_student_bp IS NULL)
  AND (center_per_student_fee IS NULL OR center_per_student_fee BETWEEN 0 AND 99999900)
  AND (center_per_student_bp  IS NULL OR center_per_student_bp  BETWEEN 0 AND 10000)
);
COMMENT ON COLUMN commission_settings.center_per_student_fee IS
  'Method 2 rate: flat piasters the center earns per ATTENDING student per session. Mutually exclusive with center_per_student_bp.';
COMMENT ON COLUMN commission_settings.center_per_student_bp IS
  'Method 2 rate: basis points of the per-session price the center earns per ATTENDING student. Mutually exclusive with center_per_student_fee.';

-- ---------------------------------------------------------------------------
-- 4. Course snapshot: method + Method-2 rate frozen at creation (M4.5 — rate/
--    method config changes only ever affect NEW courses)
-- ---------------------------------------------------------------------------
ALTER TABLE courses
  ADD COLUMN pricing_method room_pricing_method,
  ADD COLUMN m2_center_fee  integer,
  ADD COLUMN m2_center_bp   integer;

-- Existing room-based courses (split snapshot present) ARE Method 1 — name it.
UPDATE courses SET pricing_method = 'whole_room_percent' WHERE split_platform_bp IS NOT NULL;

-- Method-aware shape replaces course_split_shape (same rule for Method 1 rows):
--   NULL method  → no pricing columns at all (legacy / no-room / teacher-direct)
--   Method 1     → the three split bps, >= 0, summing to exactly 10000; no m2 cols
--   Method 2     → platform bp alone (0..10000) + EXACTLY one m2 rate column;
--                  bp-type rate additionally can never exceed the remainder
--                  (platform + center <= 100% → teacher net >= 0 by construction)
ALTER TABLE courses DROP CONSTRAINT course_split_shape;
ALTER TABLE courses ADD CONSTRAINT course_pricing_shape CHECK (
  (
    pricing_method IS NULL
    AND split_platform_bp IS NULL AND split_teacher_bp IS NULL AND split_center_bp IS NULL
    AND m2_center_fee IS NULL AND m2_center_bp IS NULL
  ) OR (
    pricing_method = 'whole_room_percent'
    AND split_platform_bp >= 0 AND split_teacher_bp >= 0 AND split_center_bp >= 0
    AND split_platform_bp + split_teacher_bp + split_center_bp = 10000
    AND m2_center_fee IS NULL AND m2_center_bp IS NULL
  ) OR (
    pricing_method = 'per_attending_student'
    AND split_platform_bp BETWEEN 0 AND 10000
    AND split_teacher_bp IS NULL AND split_center_bp IS NULL
    AND (
      (m2_center_fee BETWEEN 0 AND 99999900 AND m2_center_bp IS NULL)
      OR (m2_center_bp BETWEEN 0 AND 10000 AND m2_center_fee IS NULL
          AND split_platform_bp + m2_center_bp <= 10000)
    )
  )
);
COMMENT ON COLUMN courses.pricing_method IS
  'Room pricing method snapshot, frozen at creation (M4.5). NULL = legacy/no-room/teacher-direct. per_attending_student → split_platform_bp is the platform % and exactly one of m2_center_fee/m2_center_bp is the center rate; teacher takes the remainder.';

-- ---------------------------------------------------------------------------
-- 5. The method proposed on a collaboration request (teacher's choice for
--    both-methods rooms; the forced value for forced rooms; NULL until the
--    teacher chooses at accept time on center-initiated requests)
-- ---------------------------------------------------------------------------
ALTER TABLE collaboration_requests ADD COLUMN proposed_pricing_method room_pricing_method;
