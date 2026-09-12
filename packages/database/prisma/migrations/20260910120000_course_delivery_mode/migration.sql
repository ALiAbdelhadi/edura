-- Course delivery mode: onsite (default, what every existing row already is), online, hybrid.
-- Additive and backfill-free: the DEFAULT is 'onsite', which is what every course
-- created before this migration actually was, so no existing row changes meaning.
-- online_url is the meeting link for an online/hybrid course; NULL for onsite.

CREATE TYPE "course_delivery_mode" AS ENUM ('onsite', 'online', 'hybrid');

ALTER TABLE "courses"
  ADD COLUMN "delivery_mode" "course_delivery_mode" NOT NULL DEFAULT 'onsite',
  ADD COLUMN "online_url" TEXT;

-- Structural truth only: a course that meets in a hall has nowhere to put a
-- meeting link, so a link on an onsite row is a data error whoever wrote it.
-- "An online course must HAVE a link" is deliberately NOT here: a teacher
-- routinely creates the group before the Zoom/Meet room exists, and a link
-- filled in later must not be blocked by the database. That rule lives in
-- createTeacherDirectCourse / createCourse, where it can be relaxed without a
-- migration.
-- Prisma cannot model this CHECK: `prisma migrate dev` WILL offer to drop it. Refuse.
ALTER TABLE "courses"
  ADD CONSTRAINT "courses_delivery_mode_shape" CHECK (
    "delivery_mode" <> 'onsite' OR "online_url" IS NULL
  );

CREATE INDEX "courses_delivery_mode_idx" ON "courses" ("delivery_mode");
