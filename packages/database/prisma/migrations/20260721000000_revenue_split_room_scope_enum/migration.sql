-- Room-based revenue split (extends Step 4.5 commission_settings scope rows).
-- The 'room' scope value is added in its OWN migration because Postgres forbids
-- USING a newly-added enum value in the same transaction that added it. The
-- migration runner commits each migration separately, so the value is safe to
-- reference in the next migration (…_room_pricing_and_revenue_split).
ALTER TYPE commission_scope ADD VALUE IF NOT EXISTS 'room';
