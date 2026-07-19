-- Step 7: WhatsApp delivery log + invite-token support for phone-only users.
-- Additive except two relaxations on invite_tokens (user_id added, email nullable).

CREATE TYPE whatsapp_message_status AS ENUM ('queued', 'sent', 'failed');
CREATE TYPE whatsapp_provider AS ENUM ('mock', 'cloud_api');

CREATE TABLE whatsapp_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_phone     text NOT NULL,
  template            text NOT NULL,
  params              jsonb,
  locale              text NOT NULL DEFAULT 'ar',
  status              whatsapp_message_status NOT NULL DEFAULT 'queued',
  provider            whatsapp_provider NOT NULL,
  provider_message_id text,
  provider_response   jsonb,
  error               text,
  user_id             uuid,
  center_id           uuid,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Platform-level delivery log written by server code and read by the
-- back-office; app-layer scoped like payment_intents — NOT in the
-- tenant_isolation RLS set.
COMMENT ON TABLE whatsapp_messages IS 'WhatsApp send attempts (mock + Cloud API). App-scoped, no RLS.';

CREATE INDEX whatsapp_messages_status_created_idx    ON whatsapp_messages (status, created_at DESC);
CREATE INDEX whatsapp_messages_recipient_created_idx ON whatsapp_messages (recipient_phone, created_at DESC);
CREATE INDEX whatsapp_messages_user_idx              ON whatsapp_messages (user_id);
CREATE INDEX whatsapp_messages_created_idx           ON whatsapp_messages (created_at DESC);

-- invite_tokens: walk-in students have a phone, not an email — token rows for
-- purpose walk_in_onboarding link straight to the shell user instead.
ALTER TABLE invite_tokens ADD COLUMN user_id uuid;
ALTER TABLE invite_tokens ALTER COLUMN email DROP NOT NULL;
CREATE INDEX invite_tokens_user_idx ON invite_tokens (user_id);
