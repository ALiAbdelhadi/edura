-- Volume seed for the LOCAL load-test database (edura_load). Run by
-- tests/load/seed/seed.sh, which refuses any host that is not localhost and any
-- database whose label is not `edura-env:test`.
--
-- Shape (psql variables, defaults set by seed.sh):
--   :centers centres, each with 1 owner, 3 receptionists, :teachers teachers,
--   2 assistants, :students students and :students/2 parents (2 children each).
--   Every teacher runs 2 groups; every student sits in 2 groups; every group has
--   one lesson TODAY (so the counter board and the teacher's day are full),
--   :past_weeks weeks of completed lessons with attendance, and 4 upcoming.
--
-- WHAT THIS DELIBERATELY DOES NOT WRITE: payments, transactions, wallet ledgers,
-- settlements, payouts, points. Every money row in the load database is produced
-- by the real engine through the HTTP API during a run, which is what lets the
-- post-run reconciliation mean something. The `subscriptions` rows below are
-- coverage WITHOUT a payment (payment_id NULL, is_demo) -- a fixture shortcut
-- that exists only so a covered check-in can be exercised; on a real database a
-- subscription is only ever created together with its payment.
--
-- Ids are deterministic and RFC-4122 shaped (version 5 / variant a), because the
-- API validates uuids strictly and a bare md5()::uuid is rejected.

\set ON_ERROR_STOP on
SET app.bypass_rls = 'on';
SET client_min_messages = warning;

CREATE OR REPLACE FUNCTION pg_temp.lid(t text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT (substr(h,1,12) || '5' || substr(h,14,3) || 'a' || substr(h,18,15))::uuid
  FROM (SELECT md5('edura-load:' || t) AS h) x
$$;

-- One bcrypt hash, reused: hashing 16k passwords would dominate the seed, and
-- every virtual user signing in with the same password changes nothing measured.
SELECT crypt(:'password', gen_salt('bf', 10)) AS pw_hash \gset

SELECT to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') AS day_key \gset
SELECT (:'day_key' || 'T00:00:00Z')::timestamptz AS today \gset

SELECT id AS subject_id FROM subjects WHERE code = 'math' \gset
SELECT id AS grade_id FROM grade_levels WHERE code = 'general-secondary-3' \gset
SELECT id AS track_id FROM tracks WHERE code = 'general-sci-math' \gset

BEGIN;

-- ---------------------------------------------------------------- platform staff
INSERT INTO users (id, email, name, role, status, password_hash, is_demo, updated_at)
SELECT pg_temp.lid('sa:' || g), 'load-sa-' || g || '@load.edura.test', 'Load Super ' || g,
       'super_admin', 'active', :'pw_hash', true, now()
FROM generate_series(1, :staff_accounts) g
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, name, role, status, password_hash, is_demo, updated_at)
SELECT pg_temp.lid('acc:' || g), 'load-acc-' || g || '@load.edura.test', 'Load Accountant ' || g,
       'accountant', 'active', :'pw_hash', true, now()
FROM generate_series(1, :staff_accounts) g
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------- centres
INSERT INTO centers (id, name, short_id, status, subjects, address, onboarding_completed, is_demo, updated_at)
SELECT pg_temp.lid('center:' || c), 'مركز الحمل ' || c, 'LOAD' || lpad(c::text, 3, '0'),
       'active', ARRAY['Math'], 'القاهرة', true, true, now()
FROM generate_series(1, :centers) c
ON CONFLICT (id) DO NOTHING;

INSERT INTO rooms (id, center_id, name, updated_at)
SELECT pg_temp.lid('room:' || c || ':' || r), pg_temp.lid('center:' || c), 'قاعة ' || r, now()
FROM generate_series(1, :centers) c, generate_series(1, 4) r
ON CONFLICT (id) DO NOTHING;

-- owners
INSERT INTO users (id, email, name, role, status, password_hash, is_demo, updated_at)
SELECT pg_temp.lid('owner:' || c), 'load-owner-' || c || '@load.edura.test', 'مالك المركز ' || c,
       'center_admin', 'active', :'pw_hash', true, now()
FROM generate_series(1, :centers) c
ON CONFLICT (id) DO NOTHING;

INSERT INTO center_admin_profiles (user_id, center_id, updated_at)
SELECT pg_temp.lid('owner:' || c), pg_temp.lid('center:' || c), now()
FROM generate_series(1, :centers) c
ON CONFLICT (user_id) DO NOTHING;

-- receptionists (3 per centre)
INSERT INTO users (id, email, name, role, status, password_hash, is_demo, updated_at)
SELECT pg_temp.lid('staff:' || c || ':' || s), 'load-staff-' || c || '-' || s || '@load.edura.test',
       'استقبال ' || c || '-' || s, 'center_staff', 'active', :'pw_hash', true, now()
FROM generate_series(1, :centers) c, generate_series(1, 3) s
ON CONFLICT (id) DO NOTHING;

INSERT INTO center_staff (id, center_id, staff_user_id, role, title)
SELECT pg_temp.lid('staffrow:' || c || ':' || s), pg_temp.lid('center:' || c),
       pg_temp.lid('staff:' || c || ':' || s), 'receptionist', 'استقبال'
FROM generate_series(1, :centers) c, generate_series(1, 3) s
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------- teachers
INSERT INTO users (id, email, name, role, status, password_hash, is_demo, updated_at)
SELECT pg_temp.lid('teacher:' || c || ':' || t), 'load-teacher-' || c || '-' || t || '@load.edura.test',
       'أ. مدرس ' || c || '-' || t, 'teacher', 'active', :'pw_hash', true, now()
FROM generate_series(1, :centers) c, generate_series(1, :teachers) t
ON CONFLICT (id) DO NOTHING;

-- onboarding_completed MUST be true: an un-onboarded teacher's every page is a
-- streamed redirect to /onboarding that still answers HTTP 200, so a load run
-- measures the redirect stub while the status mix looks perfect (it happened).
INSERT INTO teacher_profiles (user_id, subjects, onboarding_completed, updated_at)
SELECT pg_temp.lid('teacher:' || c || ':' || t), ARRAY['Math'], true, now()
FROM generate_series(1, :centers) c, generate_series(1, :teachers) t
ON CONFLICT (user_id) DO UPDATE SET onboarding_completed = true;

INSERT INTO center_teacher_affiliations (id, center_id, teacher_id, status, responded_at, expires_at, updated_at)
SELECT pg_temp.lid('aff:' || c || ':' || t), pg_temp.lid('center:' || c), pg_temp.lid('teacher:' || c || ':' || t),
       'active', now(), now() + interval '365 days', now()
FROM generate_series(1, :centers) c, generate_series(1, :teachers) t
ON CONFLICT (id) DO NOTHING;

INSERT INTO teacher_subjects (teacher_id, subject_id)
SELECT pg_temp.lid('teacher:' || c || ':' || t), :'subject_id'
FROM generate_series(1, :centers) c, generate_series(1, :teachers) t
ON CONFLICT DO NOTHING;

INSERT INTO teacher_grade_levels (teacher_id, grade_level_id)
SELECT pg_temp.lid('teacher:' || c || ':' || t), :'grade_id'
FROM generate_series(1, :centers) c, generate_series(1, :teachers) t
ON CONFLICT DO NOTHING;

-- assistants: teachers 1 and 2 of every centre get one each
INSERT INTO users (id, email, name, role, status, password_hash, is_demo, updated_at)
SELECT pg_temp.lid('assistant:' || c || ':' || t), 'load-assistant-' || c || '-' || t || '@load.edura.test',
       'مساعد ' || c || '-' || t, 'assistant', 'active', :'pw_hash', true, now()
FROM generate_series(1, :centers) c, generate_series(1, 2) t
ON CONFLICT (id) DO NOTHING;

INSERT INTO teacher_assistants (id, teacher_id, assistant_id, title, updated_at)
SELECT pg_temp.lid('ta:' || c || ':' || t), pg_temp.lid('teacher:' || c || ':' || t),
       pg_temp.lid('assistant:' || c || ':' || t), 'مساعد أول', now()
FROM generate_series(1, :centers) c, generate_series(1, 2) t
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------- students
INSERT INTO users (id, email, name, role, status, password_hash, is_demo, updated_at)
SELECT pg_temp.lid('student:' || c || ':' || s), 'load-student-' || c || '-' || s || '@load.edura.test',
       'طالب ' || c || '-' || s, 'student', 'active', :'pw_hash', true, now()
FROM generate_series(1, :centers) c, generate_series(1, :students) s
ON CONFLICT (id) DO NOTHING;

INSERT INTO student_profiles (id, user_id, full_name, phone, family_link_code, grade_level_id, track_id,
                              guardian_email, onboarding_completed, updated_at)
SELECT pg_temp.lid('sp:' || c || ':' || s), pg_temp.lid('student:' || c || ':' || s),
       'طالب ' || c || '-' || s, '+2010' || lpad((c * 100000 + s)::text, 8, '0'),
       upper(substr(md5('flc:' || c || ':' || s), 1, 8)), :'grade_id', :'track_id',
       'load-parent-' || c || '-' || ((s + 1) / 2) || '@load.edura.test', true, now()
FROM generate_series(1, :centers) c, generate_series(1, :students) s
ON CONFLICT (id) DO NOTHING;

INSERT INTO center_student_rosters (center_id, student_id, updated_at)
SELECT pg_temp.lid('center:' || c), pg_temp.lid('student:' || c || ':' || s), now()
FROM generate_series(1, :centers) c, generate_series(1, :students) s
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------- parents
INSERT INTO users (id, email, name, role, status, password_hash, is_demo, updated_at)
SELECT pg_temp.lid('parent:' || c || ':' || p), 'load-parent-' || c || '-' || p || '@load.edura.test',
       'ولي أمر ' || c || '-' || p, 'parent', 'active', :'pw_hash', true, now()
FROM generate_series(1, :centers) c, generate_series(1, :students / 2) p
ON CONFLICT (id) DO NOTHING;

INSERT INTO parent_profiles (user_id, updated_at)
SELECT pg_temp.lid('parent:' || c || ':' || p), now()
FROM generate_series(1, :centers) c, generate_series(1, :students / 2) p
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO parent_student_links (id, parent_id, student_id, status, initiated_by, updated_at)
SELECT pg_temp.lid('psl:' || c || ':' || s), pg_temp.lid('parent:' || c || ':' || ((s + 1) / 2)),
       pg_temp.lid('student:' || c || ':' || s), 'approved', 'parent', now()
FROM generate_series(1, :centers) c, generate_series(1, :students) s
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------- courses
-- Two groups per teacher. Start times are spread over the afternoon so "today"
-- looks like a real centre's day rather than forty lessons at one minute.
INSERT INTO courses (id, center_id, teacher_id, default_room_id, title, subject, subject_id, grade_level_id,
                     track_id, days_of_week, start_time, end_time, start_date, price, price_per_month,
                     price_per_session, max_students, status, is_demo, updated_at)
SELECT pg_temp.lid('course:' || c || ':' || t || ':' || k), pg_temp.lid('center:' || c),
       pg_temp.lid('teacher:' || c || ':' || t), pg_temp.lid('room:' || c || ':' || (1 + (t + k) % 4)),
       'رياضيات — مجموعة ' || t || '/' || k, 'Math', :'subject_id', :'grade_id', :'track_id',
       ARRAY[0,1,2,3,4,5,6],
       lpad((12 + ((t * 2 + k) % 9))::text, 2, '0') || ':00',
       lpad((13 + ((t * 2 + k) % 9))::text, 2, '0') || ':30',
       now() - interval '90 days', 30000, 30000, 5000, 200, 'active', true, now()
FROM generate_series(1, :centers) c, generate_series(1, :teachers) t, generate_series(1, 2) k
ON CONFLICT (id) DO NOTHING;

-- Student s sits in course slots (s mod N) and ((s + N/2) mod N), N = 2*teachers.
CREATE TEMP TABLE load_enrol ON COMMIT DROP AS
SELECT c, s, slot,
       pg_temp.lid('student:' || c || ':' || s) AS student_id,
       pg_temp.lid('center:' || c) AS center_id,
       pg_temp.lid('teacher:' || c || ':' || (1 + slot / 2)) AS teacher_id,
       pg_temp.lid('course:' || c || ':' || (1 + slot / 2) || ':' || (1 + slot % 2)) AS course_id,
       pg_temp.lid('enrol:' || c || ':' || s || ':' || slot) AS enrollment_id
FROM generate_series(1, :centers) c,
     generate_series(1, :students) s,
     LATERAL (VALUES (s % (2 * :teachers)), ((s + :teachers) % (2 * :teachers))) v(slot);

INSERT INTO enrollments (id, student_id, course_id, center_id, status, enrolled_by, updated_at)
SELECT enrollment_id, student_id, course_id, center_id, 'active', pg_temp.lid('owner:' || c), now()
FROM load_enrol
ON CONFLICT (id) DO NOTHING;

-- Coverage for the FIRST of each student's two groups only. The second stays
-- uncovered on purpose: that is the student who pays cash at the counter.
INSERT INTO subscriptions (id, student_id, target_type, teacher_id, center_id, course_id, plan, price,
                           payment_method, status, source, period_start, period_end, enrollment_id,
                           activated_at, is_demo, updated_at)
SELECT pg_temp.lid('sub:' || c || ':' || s || ':' || slot), student_id, 'center', teacher_id, center_id,
       course_id, 'monthly', 30000, 'cash', 'active', 'walk_in',
       now() - interval '5 days', now() + interval '25 days', enrollment_id, now() - interval '5 days', true, now()
FROM load_enrol
WHERE slot = s % (2 * :teachers)
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------- sessions
-- d = 0 is today; negative = completed history; positive = upcoming.
INSERT INTO sessions (id, course_id, teacher_id, room_id, original_date, date, start_time, end_time, status, updated_at)
SELECT pg_temp.lid('session:' || co.id || ':' || d), co.id, co.teacher_id, co.default_room_id,
       :'today'::timestamptz + make_interval(days => d), :'today'::timestamptz + make_interval(days => d),
       co.start_time, co.end_time,
       (CASE WHEN d < 0 THEN 'completed' ELSE 'scheduled' END)::session_status, now()
FROM courses co,
     LATERAL (
       SELECT -7 * w - x AS d FROM generate_series(0, :past_weeks - 1) w, (VALUES (2), (5)) v(x)
       UNION ALL SELECT 0
       UNION ALL SELECT g FROM generate_series(1, 4) g
     ) days
WHERE co.is_demo AND co.title LIKE 'رياضيات — مجموعة %'
ON CONFLICT (id) DO NOTHING;

-- Attendance history: ~85% present, the rest absent. No money is implied by an
-- attendance row; settlement is a separate, explicit action.
INSERT INTO attendance_records (id, session_id, student_id, course_id, center_id, status, marked_by,
                                counter_at, updated_at)
SELECT pg_temp.lid('att:' || se.id || ':' || e.student_id), se.id, e.student_id, e.course_id, e.center_id,
       (CASE WHEN (hashtext(se.id::text || e.student_id::text) % 100) < 85 THEN 'present' ELSE 'absent' END)::attendance_status,
       se.teacher_id, se.date + interval '14 hours', now()
FROM load_enrol e
JOIN sessions se ON se.course_id = e.course_id AND se.status = 'completed'
ON CONFLICT (session_id, student_id) DO NOTHING;

-- A handful of unread notifications per student and parent, so the bell and the
-- notifications page read real rows.
INSERT INTO notifications (id, user_id, type, title, body)
SELECT pg_temp.lid('notif:' || u.id || ':' || n), u.id, 'admin_broadcast', 'إشعار تجريبي ' || n, 'نص الإشعار رقم ' || n
FROM users u, generate_series(1, 5) n
WHERE u.email LIKE 'load-%@load.edura.test' AND u.role IN ('student', 'parent', 'teacher')
ON CONFLICT (id) DO NOTHING;

COMMIT;

ANALYZE;

SELECT role, count(*) FROM users WHERE email LIKE 'load-%' GROUP BY 1 ORDER BY 1;
SELECT 'centers' t, count(*) FROM centers UNION ALL SELECT 'courses', count(*) FROM courses
UNION ALL SELECT 'enrollments', count(*) FROM enrollments UNION ALL SELECT 'subscriptions', count(*) FROM subscriptions
UNION ALL SELECT 'sessions', count(*) FROM sessions UNION ALL SELECT 'attendance_records', count(*) FROM attendance_records
UNION ALL SELECT 'auth_accounts', count(*) FROM auth_accounts
UNION ALL SELECT 'payments (must be 0 after seed)', count(*) FROM payments
UNION ALL SELECT 'transactions (must be 0 after seed)', count(*) FROM transactions;
