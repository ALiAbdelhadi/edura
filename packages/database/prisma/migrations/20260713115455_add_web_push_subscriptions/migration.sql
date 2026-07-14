-- DropIndex
DROP INDEX "blacklist_entries_target_active_idx";

-- DropIndex
DROP INDEX "notifications_user_read_idx";

-- DropIndex
DROP INDEX "transactions_created_at_idx";

-- CreateTable
CREATE TABLE "web_push_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6),

    CONSTRAINT "web_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "web_push_subscriptions_endpoint_key" ON "web_push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "web_push_subscriptions_user_id_idx" ON "web_push_subscriptions"("user_id");

-- RenameIndex
ALTER INDEX "points_ledger_student_created_idx" RENAME TO "points_ledger_student_id_created_at_idx";

-- RenameIndex
ALTER INDEX "transactions_type_status_created_idx" RENAME TO "transactions_type_status_created_at_idx";
