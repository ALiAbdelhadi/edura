-- Keep the two money knobs cleanly separate. A per-center / per-room revenue
-- SPLIT override row (scope='center' | 'room') carries ONLY the three
-- *_share_bp columns — it must NOT also override that center's flat platform
-- commission (teacher_direct_commission_bp / platform_*_fee). So allow those
-- flat columns to be NULL on split-only rows. The GLOBAL row still carries both
-- (flat commission + default split); resolveCommission() only considers rows
-- whose flat columns are set, and resolveRevenueSplit() only considers rows
-- whose split columns are set. Existing CHECKs pass on NULL, so no CHECK change.
ALTER TABLE commission_settings ALTER COLUMN teacher_direct_commission_bp DROP NOT NULL;
ALTER TABLE commission_settings ALTER COLUMN platform_teacher_fee DROP NOT NULL;
ALTER TABLE commission_settings ALTER COLUMN platform_center_fee DROP NOT NULL;
