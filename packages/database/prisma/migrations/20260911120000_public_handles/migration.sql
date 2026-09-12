-- Public handles: the single namespace behind `<handle>.edura.com` and
-- `/p/<handle>`. One table for BOTH centers and teachers, on purpose: a
-- centre and a teacher must never resolve to the same name, and a plain
-- UNIQUE on one column is the only way to say that at the database. Two
-- columns (centers.slug + teacher_profiles.slug) could each be unique and
-- still collide with each other.
--
-- The handle is a routing key, never identity: renaming it is an UPDATE on
-- this row, the owner's uuid never changes, and nothing else references it.

CREATE TYPE "public_handle_kind" AS ENUM ('center', 'teacher');

CREATE TABLE "public_handles" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "handle"             text NOT NULL,
  "kind"               "public_handle_kind" NOT NULL,
  "center_id"          uuid REFERENCES "centers"("id") ON DELETE CASCADE,
  "teacher_profile_id" uuid REFERENCES "teacher_profiles"("id") ON DELETE CASCADE,
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "public_handles_handle_key" ON "public_handles" ("handle");
CREATE UNIQUE INDEX "public_handles_center_id_key" ON "public_handles" ("center_id");
CREATE UNIQUE INDEX "public_handles_teacher_profile_id_key" ON "public_handles" ("teacher_profile_id");

-- Exactly one owner, and the owner column agrees with `kind`.
-- Prisma cannot model this CHECK: `prisma migrate dev` WILL offer to drop it. Refuse.
ALTER TABLE "public_handles"
  ADD CONSTRAINT "public_handles_one_owner" CHECK (
    ("kind" = 'center'  AND "center_id" IS NOT NULL AND "teacher_profile_id" IS NULL) OR
    ("kind" = 'teacher' AND "teacher_profile_id" IS NOT NULL AND "center_id" IS NULL)
  );

-- DNS-label shape, enforced where it cannot be bypassed: lowercase a-z, 0-9
-- and single hyphens, 3..40 chars, no leading/trailing/double hyphen. A row
-- that violates this would be a hostname that cannot exist.
-- Prisma cannot model this CHECK either. Refuse the drop.
ALTER TABLE "public_handles"
  ADD CONSTRAINT "public_handles_shape" CHECK (
    "handle" ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' AND "handle" !~ '--'
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "public_handles" TO "edura_app";
  END IF;
END $$;
