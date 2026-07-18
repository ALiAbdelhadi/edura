-- CreateEnum
CREATE TYPE "subject_request_status" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "education_system_id" UUID,
ADD COLUMN     "grade_level_id" UUID,
ADD COLUMN     "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onboarding_draft" JSONB,
ADD COLUMN     "second_language_subject_id" UUID,
ADD COLUMN     "stage_id" UUID,
ADD COLUMN     "track_id" UUID;

-- AlterTable
ALTER TABLE "teacher_profiles" ADD COLUMN     "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onboarding_draft" JSONB;

-- AlterTable
ALTER TABLE "centers" ADD COLUMN     "governorate" TEXT,
ADD COLUMN     "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onboarding_draft" JSONB;

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "grade_level_id" UUID,
ADD COLUMN     "subject_id" UUID,
ADD COLUMN     "track_id" UUID;

-- CreateTable
CREATE TABLE "education_systems" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "icon_key" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "education_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "education_system_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "has_second_language" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_levels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stage_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "level" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "grade_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stage_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_level_tracks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "grade_level_id" UUID NOT NULL,
    "track_id" UUID NOT NULL,

    CONSTRAINT "grade_level_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "language" "locale" NOT NULL DEFAULT 'ar',
    "is_azhari" BOOLEAN NOT NULL DEFAULT false,
    "is_second_language" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_offerings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject_id" UUID NOT NULL,
    "grade_level_id" UUID NOT NULL,
    "track_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subject_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_grade_levels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "grade_level_id" UUID NOT NULL,

    CONSTRAINT "teacher_grade_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,

    CONSTRAINT "teacher_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "center_stages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "center_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,

    CONSTRAINT "center_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requested_by_id" UUID NOT NULL,
    "suggested_name" TEXT NOT NULL,
    "grade_level_id" UUID,
    "notes" TEXT,
    "status" "subject_request_status" NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "created_subject_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "education_systems_code_key" ON "education_systems"("code");

-- CreateIndex
CREATE INDEX "education_systems_is_active_sort_order_idx" ON "education_systems"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "stages_code_key" ON "stages"("code");

-- CreateIndex
CREATE INDEX "stages_education_system_id_is_active_sort_order_idx" ON "stages"("education_system_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "grade_levels_code_key" ON "grade_levels"("code");

-- CreateIndex
CREATE INDEX "grade_levels_stage_id_is_active_sort_order_idx" ON "grade_levels"("stage_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "tracks_code_key" ON "tracks"("code");

-- CreateIndex
CREATE INDEX "tracks_stage_id_is_active_sort_order_idx" ON "tracks"("stage_id", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "grade_level_tracks_track_id_idx" ON "grade_level_tracks"("track_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_level_tracks_grade_level_id_track_id_key" ON "grade_level_tracks"("grade_level_id", "track_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateIndex
CREATE INDEX "subjects_is_active_sort_order_idx" ON "subjects"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "subject_offerings_grade_level_id_track_id_idx" ON "subject_offerings"("grade_level_id", "track_id");

-- CreateIndex
CREATE INDEX "subject_offerings_subject_id_idx" ON "subject_offerings"("subject_id");

-- CreateIndex
CREATE INDEX "teacher_grade_levels_grade_level_id_idx" ON "teacher_grade_levels"("grade_level_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_grade_levels_teacher_id_grade_level_id_key" ON "teacher_grade_levels"("teacher_id", "grade_level_id");

-- CreateIndex
CREATE INDEX "teacher_subjects_subject_id_idx" ON "teacher_subjects"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_subjects_teacher_id_subject_id_key" ON "teacher_subjects"("teacher_id", "subject_id");

-- CreateIndex
CREATE INDEX "center_stages_center_id_idx" ON "center_stages"("center_id");

-- CreateIndex
CREATE UNIQUE INDEX "center_stages_center_id_stage_id_key" ON "center_stages"("center_id", "stage_id");

-- CreateIndex
CREATE INDEX "subject_requests_status_idx" ON "subject_requests"("status");

-- CreateIndex
CREATE INDEX "subject_requests_requested_by_id_idx" ON "subject_requests"("requested_by_id");

-- CreateIndex
CREATE INDEX "student_profiles_grade_level_id_track_id_idx" ON "student_profiles"("grade_level_id", "track_id");

-- CreateIndex
CREATE INDEX "courses_grade_level_id_track_id_idx" ON "courses"("grade_level_id", "track_id");

-- CreateIndex
CREATE INDEX "courses_subject_id_idx" ON "courses"("subject_id");

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_education_system_id_fkey" FOREIGN KEY ("education_system_id") REFERENCES "education_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_second_language_subject_id_fkey" FOREIGN KEY ("second_language_subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stages" ADD CONSTRAINT "stages_education_system_id_fkey" FOREIGN KEY ("education_system_id") REFERENCES "education_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_levels" ADD CONSTRAINT "grade_levels_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_level_tracks" ADD CONSTRAINT "grade_level_tracks_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_level_tracks" ADD CONSTRAINT "grade_level_tracks_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offerings" ADD CONSTRAINT "subject_offerings_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offerings" ADD CONSTRAINT "subject_offerings_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_offerings" ADD CONSTRAINT "subject_offerings_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_grade_levels" ADD CONSTRAINT "teacher_grade_levels_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_grade_levels" ADD CONSTRAINT "teacher_grade_levels_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "center_stages" ADD CONSTRAINT "center_stages_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "center_stages" ADD CONSTRAINT "center_stages_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =============================================================================
-- Education catalog hardening (raw SQL — Prisma cannot model these).
-- Follows the conventions of 00000000000001_rls_and_constraints and
-- 00000000000003_integrity_sequences_indexes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. True offering uniqueness including NULL track (PG15+ NULLS NOT DISTINCT).
--    Without this, "same subject, same grade, track NULL" could be inserted
--    twice — Postgres treats plain-unique NULLs as distinct.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "subject_offerings_subject_grade_track_key"
  ON "subject_offerings" ("subject_id", "grade_level_id", "track_id") NULLS NOT DISTINCT;

-- ---------------------------------------------------------------------------
-- 2. RLS for the platform-global catalog: world-readable (wizards, browsing),
--    writable ONLY under the platform bypass (super_admin admin panel /
--    withPlatformContext). ENABLE + FORCE per repo convention so even the
--    table owner is subject to policies.
--    subject_requests stays app-layer scoped (teachers write their own rows
--    at runtime without bypass), like notifications/profiles.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  catalog_tables text[] := ARRAY[
    'education_systems', 'stages', 'grade_levels', 'tracks',
    'grade_level_tracks', 'subjects', 'subject_offerings'
  ];
BEGIN
  FOREACH t IN ARRAY catalog_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY catalog_read ON %I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY catalog_insert ON %I FOR INSERT WITH CHECK (rls_bypass())', t);
    EXECUTE format('CREATE POLICY catalog_update ON %I FOR UPDATE USING (rls_bypass()) WITH CHECK (rls_bypass())', t);
    EXECUTE format('CREATE POLICY catalog_delete ON %I FOR DELETE USING (rls_bypass())', t);
  END LOOP;
END $$;

-- center_stages is tenant-scoped (has center_id) → standard tenant isolation,
-- same policy shape as the 00000000000001 migration's center_tables loop.
ALTER TABLE "center_stages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "center_stages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "center_stages"
  USING (rls_bypass() OR "center_id" = current_center_id())
  WITH CHECK (rls_bypass() OR "center_id" = current_center_id());

-- ---------------------------------------------------------------------------
-- 3. Validation CHECKs (last line of defense; API validates too).
-- ---------------------------------------------------------------------------
ALTER TABLE "grade_levels" ADD CONSTRAINT "grade_levels_level_range"
  CHECK ("level" BETWEEN 1 AND 12);
ALTER TABLE "education_systems" ADD CONSTRAINT "education_systems_sort_nonneg" CHECK ("sort_order" >= 0);
ALTER TABLE "stages"            ADD CONSTRAINT "stages_sort_nonneg"            CHECK ("sort_order" >= 0);
ALTER TABLE "grade_levels"      ADD CONSTRAINT "grade_levels_sort_nonneg"      CHECK ("sort_order" >= 0);
ALTER TABLE "tracks"            ADD CONSTRAINT "tracks_sort_nonneg"            CHECK ("sort_order" >= 0);
ALTER TABLE "subjects"          ADD CONSTRAINT "subjects_sort_nonneg"          CHECK ("sort_order" >= 0);

-- ---------------------------------------------------------------------------
-- 4. Privileges for the runtime role (idempotent even if schema-level default
--    privileges already cover new tables).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      "education_systems", "stages", "grade_levels", "tracks",
      "grade_level_tracks", "subjects", "subject_offerings",
      "teacher_grade_levels", "teacher_subjects", "center_stages",
      "subject_requests"
    TO "edura_app";
  END IF;
END $$;
