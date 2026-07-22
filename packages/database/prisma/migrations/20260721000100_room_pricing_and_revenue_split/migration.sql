-- Room enhancements + per-center/per-room revenue split. Additive, migration-safe.
--
-- 1) Room profile pricing: the center's hall price shown to teachers at booking
--    (presentation only — NOT the revenue split). photos/facilities/capacity
--    already exist on rooms.
-- 2) Per-room / per-center 3-way revenue split (platform/teacher/center %),
--    stored as commission_settings scope rows so adding an override needs NO
--    further migration. Resolution room > center > global (resolveRevenueSplit).
--    Superadmin-only config.
-- 3) Course-level SNAPSHOT of the resolved split, frozen at creation for
--    room-based courses (M4.5: never retroactively re-rated).

-- ---------------------------------------------------------------------------
-- 1. Room profile pricing (center-managed)
-- ---------------------------------------------------------------------------
ALTER TABLE rooms ADD COLUMN price integer CHECK (price IS NULL OR price >= 0); -- piasters
ALTER TABLE rooms ADD COLUMN description text;

-- ---------------------------------------------------------------------------
-- 2. Per-center / per-room revenue split on commission_settings
-- ---------------------------------------------------------------------------
ALTER TABLE commission_settings ADD COLUMN room_id uuid;

ALTER TABLE commission_settings
  ADD COLUMN platform_share_bp integer,
  ADD COLUMN teacher_share_bp  integer,
  ADD COLUMN center_share_bp   integer;

-- Widen the scope/id shape CHECK to include the new 'room' scope.
ALTER TABLE commission_settings DROP CONSTRAINT commission_scope_shape;
ALTER TABLE commission_settings ADD CONSTRAINT commission_scope_shape CHECK (
  (scope = 'global'  AND center_id IS NULL     AND teacher_id IS NULL     AND room_id IS NULL) OR
  (scope = 'center'  AND center_id IS NOT NULL AND teacher_id IS NULL     AND room_id IS NULL) OR
  (scope = 'teacher' AND teacher_id IS NOT NULL AND center_id IS NULL     AND room_id IS NULL) OR
  (scope = 'room'    AND room_id IS NOT NULL    AND center_id IS NULL     AND teacher_id IS NULL)
);

-- The three shares are all-null (split not configured here) OR all-set,
-- non-negative, and sum to EXACTLY 10000 basis points (= 100%). DB-enforced.
ALTER TABLE commission_settings ADD CONSTRAINT commission_split_shape CHECK (
  (platform_share_bp IS NULL AND teacher_share_bp IS NULL AND center_share_bp IS NULL)
  OR (
    platform_share_bp >= 0 AND teacher_share_bp >= 0 AND center_share_bp >= 0
    AND platform_share_bp + teacher_share_bp + center_share_bp = 10000
  )
);

-- At most one split override per room.
CREATE UNIQUE INDEX commission_one_per_room ON commission_settings (room_id) WHERE scope = 'room';

-- Seed a sensible, FULLY EDITABLE default 3-way split on the existing global
-- row: platform 15% / teacher 70% / center 15%. Nothing is hardcoded in app
-- code — superadmin edits this row (and per-center/per-room overrides) from the
-- back-office. Only set if not already configured.
UPDATE commission_settings
  SET platform_share_bp = 1500, teacher_share_bp = 7000, center_share_bp = 1500
  WHERE scope = 'global' AND platform_share_bp IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Course revenue-split snapshot (frozen at creation, room-based courses)
-- ---------------------------------------------------------------------------
ALTER TABLE courses
  ADD COLUMN split_platform_bp integer,
  ADD COLUMN split_teacher_bp  integer,
  ADD COLUMN split_center_bp   integer;

ALTER TABLE courses ADD CONSTRAINT course_split_shape CHECK (
  (split_platform_bp IS NULL AND split_teacher_bp IS NULL AND split_center_bp IS NULL)
  OR (
    split_platform_bp >= 0 AND split_teacher_bp >= 0 AND split_center_bp >= 0
    AND split_platform_bp + split_teacher_bp + split_center_bp = 10000
  )
);

COMMENT ON COLUMN courses.split_platform_bp IS 'Revenue-split snapshot (bp) frozen at creation for room-based courses. NULL = legacy/no-room course (uses Step 4.5 commission).';
