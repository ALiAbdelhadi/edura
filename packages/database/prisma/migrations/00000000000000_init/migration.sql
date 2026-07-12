-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "role" AS ENUM ('super_admin', 'accountant', 'center_admin', 'teacher', 'parent', 'student');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'shell', 'pending', 'suspended', 'blacklisted', 'deleted');

-- CreateEnum
CREATE TYPE "locale" AS ENUM ('ar', 'en');

-- CreateEnum
CREATE TYPE "theme" AS ENUM ('light', 'dark', 'system');

-- CreateEnum
CREATE TYPE "entity_type" AS ENUM ('registered', 'invited', 'external', 'shadow');

-- CreateEnum
CREATE TYPE "center_status" AS ENUM ('pending', 'active', 'suspended', 'rejected', 'blacklisted');

-- CreateEnum
CREATE TYPE "affiliation_status" AS ENUM ('pending', 'active', 'declined', 'expired', 'removed');

-- CreateEnum
CREATE TYPE "course_status" AS ENUM ('active', 'ended', 'cancelled');

-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('scheduled', 'ongoing', 'cancelled', 'postponed', 'completed');

-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('active', 'unenrolled');

-- CreateEnum
CREATE TYPE "enrollment_request_status" AS ENUM ('pending', 'approved', 'declined', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "parent_link_status" AS ENUM ('pending', 'approved', 'rejected', 'revoked');

-- CreateEnum
CREATE TYPE "link_actor" AS ENUM ('parent', 'student');

-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('present', 'absent', 'late', 'excused', 'removed');

-- CreateEnum
CREATE TYPE "grade_type" AS ENUM ('numeric', 'letter');

-- CreateEnum
CREATE TYPE "material_type" AS ENUM ('lecture', 'homework', 'exam', 'other');

-- CreateEnum
CREATE TYPE "material_storage" AS ENUM ('cloudinary', 'external');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "expense_category" AS ENUM ('rent', 'utilities', 'salaries', 'supplies', 'marketing', 'maintenance', 'other');

-- CreateEnum
CREATE TYPE "deletion_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "invite_purpose" AS ENUM ('student_activation', 'teacher_activation', 'admin_invite');

-- CreateEnum
CREATE TYPE "device_platform" AS ENUM ('ios', 'android', 'web');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "transaction_type" AS ENUM ('payment', 'commission', 'payout', 'refund', 'adjustment');

-- CreateEnum
CREATE TYPE "transaction_status" AS ENUM ('pending', 'completed', 'failed', 'reversed');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('cash', 'online_paymob', 'online_fawry');

-- CreateEnum
CREATE TYPE "invoice_type" AS ENUM ('payment_receipt', 'student_invoice', 'teacher_statement', 'center_statement');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('issued', 'paid', 'void');

-- CreateEnum
CREATE TYPE "payout_status" AS ENUM ('pending', 'approved', 'paid', 'rejected');

-- CreateEnum
CREATE TYPE "beneficiary_type" AS ENUM ('teacher', 'center');

-- CreateEnum
CREATE TYPE "blacklist_level" AS ENUM ('platform', 'center', 'teacher');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('absence_marked', 'attendance_corrected', 'session_cancelled', 'session_postponed', 'course_cancelled', 'grade_entered', 'material_uploaded', 'payment_recorded', 'enrollment_request_submitted', 'enrollment_request_approved', 'enrollment_request_declined', 'student_added_to_roster', 'teacher_invited', 'parent_link_requested', 'admin_broadcast', 'password_reset_requested', 'shell_activation_invite', 'registration_approved', 'registration_rejected', 'blacklist_action', 'payout_approved', 'classroom_request', 'classroom_request_decided', 'lesson_reminder', 'homework_deadline', 'invite_code_sent', 'new_chat_message');

-- CreateEnum
CREATE TYPE "bot_type" AS ENUM ('support', 'academic');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT,
    "phone" TEXT,
    "password_hash" TEXT,
    "role" "role" NOT NULL,
    "name" TEXT NOT NULL,
    "locale" "locale" NOT NULL DEFAULT 'ar',
    "theme" "theme" NOT NULL DEFAULT 'system',
    "status" "user_status" NOT NULL DEFAULT 'active',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "fcm_token" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "grade" TEXT,
    "family_link_code" TEXT NOT NULL,
    "entity_type" "entity_type" NOT NULL DEFAULT 'registered',
    "invite_code" TEXT,
    "points_balance" INTEGER NOT NULL DEFAULT 0,
    "saved_area_city" TEXT,
    "saved_area_lat" DOUBLE PRECISION,
    "saved_area_lng" DOUBLE PRECISION,
    "invitation_sent_at" TIMESTAMPTZ(6),
    "claimed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "parent_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "bio" TEXT,
    "subjects" TEXT[],
    "qualifications" TEXT,
    "experience_years" INTEGER NOT NULL DEFAULT 0,
    "photo_url" TEXT,
    "lesson_price" INTEGER,
    "rating_avg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "wallet_balance" INTEGER NOT NULL DEFAULT 0,
    "certificates" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "center_admin_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "center_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "center_admin_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "centers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_user_id" UUID,
    "name" TEXT NOT NULL,
    "short_id" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "area" TEXT,
    "subjects" TEXT[],
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "logo_url" TEXT,
    "classroom_count" INTEGER NOT NULL DEFAULT 0,
    "entity_type" "entity_type" NOT NULL DEFAULT 'registered',
    "status" "center_status" NOT NULL DEFAULT 'pending',
    "wallet_balance" INTEGER NOT NULL DEFAULT 0,
    "receipt_seq" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "purpose" "invite_purpose" NOT NULL,
    "center_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_device_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "device_platform" NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_prefs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "tour_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_prefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "center_student_rosters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "center_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "operational_parent_name" TEXT,
    "operational_parent_phone" TEXT,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),
    "blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "blacklist_reason" TEXT,
    "blacklisted_at" TIMESTAMPTZ(6),
    "blacklisted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "center_student_rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "center_teacher_affiliations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "center_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "status" "affiliation_status" NOT NULL DEFAULT 'pending',
    "center_share" INTEGER,
    "invited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(6),
    "removed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "center_teacher_affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parent_student_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "parent_link_status" NOT NULL DEFAULT 'pending',
    "initiated_by" "link_actor" NOT NULL,
    "revoked_by" "link_actor",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "parent_student_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "center_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "facilities" TEXT[],
    "photos" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "center_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "default_room_id" UUID,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "grade_tag" TEXT,
    "days_of_week" INTEGER[],
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "start_date" TIMESTAMPTZ(6) NOT NULL,
    "end_date" TIMESTAMPTZ(6),
    "price" INTEGER NOT NULL,
    "max_students" INTEGER NOT NULL,
    "status" "course_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "room_id" UUID,
    "original_date" TIMESTAMPTZ(6) NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "status" "session_status" NOT NULL DEFAULT 'scheduled',
    "cancellation_reason" TEXT,
    "postponed_from_date" TIMESTAMPTZ(6),
    "edited_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "center_id" UUID NOT NULL,
    "status" "enrollment_status" NOT NULL DEFAULT 'active',
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unenrolled_at" TIMESTAMPTZ(6),
    "enrolled_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "center_id" UUID NOT NULL,
    "status" "enrollment_request_status" NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(6),
    "responded_by" UUID,
    "decline_reason" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "center_id" UUID NOT NULL,
    "status" "attendance_status" NOT NULL,
    "marked_by" UUID NOT NULL,
    "edited_at" TIMESTAMPTZ(6),
    "synced" BOOLEAN NOT NULL DEFAULT true,
    "local_timestamp" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "center_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "grade_type" "grade_type" NOT NULL DEFAULT 'numeric',
    "max_score" INTEGER NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_scores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "grade_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "grade_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "center_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "material_type" NOT NULL,
    "storage_provider" "material_storage" NOT NULL DEFAULT 'cloudinary',
    "cloudinary_public_id" TEXT,
    "cloudinary_url" TEXT,
    "external_url" TEXT,
    "file_size_bytes" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "center_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "session_id" UUID,
    "course_id" UUID,
    "teacher_id" UUID NOT NULL,
    "status" "booking_status" NOT NULL DEFAULT 'pending',
    "center_share" INTEGER,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(6),
    "decided_by" UUID,
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "classroom_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "center_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "course_id" UUID,
    "status" "payment_status" NOT NULL DEFAULT 'paid',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "note" TEXT,
    "receipt_number" TEXT NOT NULL,
    "recorded_by" UUID NOT NULL,
    "paid_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "center_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "category" "expense_category" NOT NULL,
    "description" TEXT,
    "recorded_by" UUID NOT NULL,
    "expense_date" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ref_number" TEXT NOT NULL,
    "type" "transaction_type" NOT NULL,
    "amount" INTEGER NOT NULL,
    "from_entity_id" UUID,
    "to_entity_id" UUID,
    "center_id" UUID,
    "lesson_id" UUID,
    "status" "transaction_status" NOT NULL DEFAULT 'pending',
    "payment_method" "payment_method",
    "gateway_ref" TEXT,
    "reversal_of_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_number" TEXT NOT NULL,
    "type" "invoice_type" NOT NULL,
    "center_id" UUID,
    "issued_to_id" UUID,
    "period_start" DATE,
    "period_end" DATE,
    "subtotal" INTEGER,
    "commission" INTEGER,
    "net_amount" INTEGER,
    "status" "invoice_status" NOT NULL DEFAULT 'issued',
    "pdf_url" TEXT,
    "qr_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "center_id" UUID,
    "beneficiary_id" UUID NOT NULL,
    "beneficiary_type" "beneficiary_type" NOT NULL,
    "period_start" DATE,
    "period_end" DATE,
    "lesson_count" INTEGER,
    "gross_amount" INTEGER,
    "commission" INTEGER,
    "net_payable" INTEGER,
    "status" "payout_status" NOT NULL DEFAULT 'pending',
    "approved_by" UUID,
    "paid_at" TIMESTAMPTZ(6),
    "receipt_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_name" TEXT NOT NULL,
    "points_value" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "points_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "event_name" TEXT,
    "rule_id" UUID,
    "adjusted_by" UUID,
    "reason" TEXT,
    "internal_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "notification_status" NOT NULL DEFAULT 'pending',
    "fcm_message_id" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blacklist_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "target_id" UUID NOT NULL,
    "level" "blacklist_level" NOT NULL,
    "center_id" UUID,
    "imposed_by_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "removed_at" TIMESTAMPTZ(6),
    "removed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blacklist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" UUID,
    "center_id" UUID,
    "before_state" JSONB,
    "after_state" JSONB,
    "ip_address" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deletion_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "center_id" UUID,
    "reason" TEXT NOT NULL,
    "status" "deletion_status" NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "center_id" UUID,
    "lesson_id" UUID,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "participant_ids" UUID[],
    "center_id" UUID,
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_body" TEXT,
    "unread_counts" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thread_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "support_bot_enabled" BOOLEAN NOT NULL DEFAULT true,
    "academic_bot_enabled" BOOLEAN NOT NULL DEFAULT true,
    "monthly_token_limit" INTEGER NOT NULL DEFAULT 1000000,
    "tokens_used_this_month" INTEGER NOT NULL DEFAULT 0,
    "last_reset_at" DATE,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chatbot_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_faq" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "session_id" UUID,
    "messages" JSONB,
    "bot_type" "bot_type",
    "handed_off" BOOLEAN NOT NULL DEFAULT false,
    "handoff_to" TEXT,
    "satisfaction" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_user_id_key" ON "student_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_family_link_code_key" ON "student_profiles"("family_link_code");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_invite_code_key" ON "student_profiles"("invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "parent_profiles_user_id_key" ON "parent_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_user_id_key" ON "teacher_profiles"("user_id");

-- CreateIndex
CREATE INDEX "teacher_profiles_subjects_idx" ON "teacher_profiles"("subjects");

-- CreateIndex
CREATE UNIQUE INDEX "center_admin_profiles_user_id_key" ON "center_admin_profiles"("user_id");

-- CreateIndex
CREATE INDEX "center_admin_profiles_center_id_idx" ON "center_admin_profiles"("center_id");

-- CreateIndex
CREATE UNIQUE INDEX "centers_short_id_key" ON "centers"("short_id");

-- CreateIndex
CREATE INDEX "centers_status_idx" ON "centers"("status");

-- CreateIndex
CREATE INDEX "centers_area_idx" ON "centers"("area");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invite_tokens_token_hash_key" ON "invite_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "invite_tokens_email_idx" ON "invite_tokens"("email");

-- CreateIndex
CREATE INDEX "invite_tokens_center_id_idx" ON "invite_tokens"("center_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_device_tokens_token_key" ON "user_device_tokens"("token");

-- CreateIndex
CREATE INDEX "user_device_tokens_user_id_idx" ON "user_device_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_prefs_user_id_key" ON "user_prefs"("user_id");

-- CreateIndex
CREATE INDEX "center_student_rosters_student_id_idx" ON "center_student_rosters"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "center_student_rosters_center_id_student_id_key" ON "center_student_rosters"("center_id", "student_id");

-- CreateIndex
CREATE INDEX "center_teacher_affiliations_center_id_idx" ON "center_teacher_affiliations"("center_id");

-- CreateIndex
CREATE INDEX "center_teacher_affiliations_teacher_id_idx" ON "center_teacher_affiliations"("teacher_id");

-- CreateIndex
CREATE INDEX "center_teacher_affiliations_center_id_teacher_id_idx" ON "center_teacher_affiliations"("center_id", "teacher_id");

-- CreateIndex
CREATE INDEX "parent_student_links_parent_id_idx" ON "parent_student_links"("parent_id");

-- CreateIndex
CREATE INDEX "parent_student_links_student_id_idx" ON "parent_student_links"("student_id");

-- CreateIndex
CREATE INDEX "rooms_center_id_idx" ON "rooms"("center_id");

-- CreateIndex
CREATE INDEX "courses_center_id_idx" ON "courses"("center_id");

-- CreateIndex
CREATE INDEX "courses_teacher_id_idx" ON "courses"("teacher_id");

-- CreateIndex
CREATE INDEX "courses_subject_idx" ON "courses"("subject");

-- CreateIndex
CREATE INDEX "courses_status_idx" ON "courses"("status");

-- CreateIndex
CREATE INDEX "sessions_course_id_date_idx" ON "sessions"("course_id", "date");

-- CreateIndex
CREATE INDEX "sessions_teacher_id_date_idx" ON "sessions"("teacher_id", "date");

-- CreateIndex
CREATE INDEX "sessions_room_id_date_idx" ON "sessions"("room_id", "date");

-- CreateIndex
CREATE INDEX "enrollments_student_id_idx" ON "enrollments"("student_id");

-- CreateIndex
CREATE INDEX "enrollments_course_id_idx" ON "enrollments"("course_id");

-- CreateIndex
CREATE INDEX "enrollments_center_id_idx" ON "enrollments"("center_id");

-- CreateIndex
CREATE INDEX "enrollment_requests_student_id_idx" ON "enrollment_requests"("student_id");

-- CreateIndex
CREATE INDEX "enrollment_requests_course_id_idx" ON "enrollment_requests"("course_id");

-- CreateIndex
CREATE INDEX "enrollment_requests_center_id_idx" ON "enrollment_requests"("center_id");

-- CreateIndex
CREATE INDEX "attendance_records_student_id_idx" ON "attendance_records"("student_id");

-- CreateIndex
CREATE INDEX "attendance_records_course_id_idx" ON "attendance_records"("course_id");

-- CreateIndex
CREATE INDEX "attendance_records_center_id_idx" ON "attendance_records"("center_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_session_id_student_id_key" ON "attendance_records"("session_id", "student_id");

-- CreateIndex
CREATE INDEX "grades_course_id_idx" ON "grades"("course_id");

-- CreateIndex
CREATE INDEX "grades_center_id_idx" ON "grades"("center_id");

-- CreateIndex
CREATE INDEX "grade_scores_student_id_idx" ON "grade_scores"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_scores_grade_id_student_id_key" ON "grade_scores"("grade_id", "student_id");

-- CreateIndex
CREATE INDEX "materials_course_id_idx" ON "materials"("course_id");

-- CreateIndex
CREATE INDEX "materials_center_id_idx" ON "materials"("center_id");

-- CreateIndex
CREATE INDEX "classroom_bookings_center_id_idx" ON "classroom_bookings"("center_id");

-- CreateIndex
CREATE INDEX "classroom_bookings_room_id_idx" ON "classroom_bookings"("room_id");

-- CreateIndex
CREATE INDEX "classroom_bookings_teacher_id_idx" ON "classroom_bookings"("teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receipt_number_key" ON "payments"("receipt_number");

-- CreateIndex
CREATE INDEX "payments_center_id_paid_at_idx" ON "payments"("center_id", "paid_at" DESC);

-- CreateIndex
CREATE INDEX "payments_student_id_paid_at_idx" ON "payments"("student_id", "paid_at" DESC);

-- CreateIndex
CREATE INDEX "expenses_center_id_expense_date_idx" ON "expenses"("center_id", "expense_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "transactions_ref_number_key" ON "transactions"("ref_number");

-- CreateIndex
CREATE INDEX "transactions_center_id_idx" ON "transactions"("center_id");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "transactions"("type");

-- CreateIndex
CREATE INDEX "transactions_status_idx" ON "transactions"("status");

-- CreateIndex
CREATE INDEX "transactions_lesson_id_idx" ON "transactions"("lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_center_id_idx" ON "invoices"("center_id");

-- CreateIndex
CREATE INDEX "invoices_type_idx" ON "invoices"("type");

-- CreateIndex
CREATE INDEX "invoices_issued_to_id_idx" ON "invoices"("issued_to_id");

-- CreateIndex
CREATE INDEX "payouts_center_id_idx" ON "payouts"("center_id");

-- CreateIndex
CREATE INDEX "payouts_beneficiary_id_idx" ON "payouts"("beneficiary_id");

-- CreateIndex
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

-- CreateIndex
CREATE INDEX "points_rules_event_name_idx" ON "points_rules"("event_name");

-- CreateIndex
CREATE INDEX "points_ledger_student_id_idx" ON "points_ledger"("student_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_read_idx" ON "notifications"("read");

-- CreateIndex
CREATE INDEX "blacklist_entries_target_id_idx" ON "blacklist_entries"("target_id");

-- CreateIndex
CREATE INDEX "blacklist_entries_center_id_idx" ON "blacklist_entries"("center_id");

-- CreateIndex
CREATE INDEX "blacklist_entries_level_idx" ON "blacklist_entries"("level");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_logs_center_id_idx" ON "audit_logs"("center_id");

-- CreateIndex
CREATE INDEX "deletion_requests_user_id_idx" ON "deletion_requests"("user_id");

-- CreateIndex
CREATE INDEX "deletion_requests_center_id_status_idx" ON "deletion_requests"("center_id", "status");

-- CreateIndex
CREATE INDEX "reviews_teacher_id_idx" ON "reviews"("teacher_id");

-- CreateIndex
CREATE INDEX "reviews_center_id_idx" ON "reviews"("center_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_student_id_teacher_id_key" ON "reviews"("student_id", "teacher_id");

-- CreateIndex
CREATE INDEX "message_threads_participant_ids_idx" ON "message_threads"("participant_ids");

-- CreateIndex
CREATE INDEX "message_threads_center_id_last_message_at_idx" ON "message_threads"("center_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "messages_thread_id_created_at_idx" ON "messages"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "chatbot_conversations_user_id_idx" ON "chatbot_conversations"("user_id");

-- CreateIndex
CREATE INDEX "chatbot_conversations_handed_off_idx" ON "chatbot_conversations"("handed_off");

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parent_profiles" ADD CONSTRAINT "parent_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "center_admin_profiles" ADD CONSTRAINT "center_admin_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "center_admin_profiles" ADD CONSTRAINT "center_admin_profiles_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_default_room_id_fkey" FOREIGN KEY ("default_room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_scores" ADD CONSTRAINT "grade_scores_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "points_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

