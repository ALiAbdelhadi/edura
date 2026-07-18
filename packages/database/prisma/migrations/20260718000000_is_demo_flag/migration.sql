-- is_demo convention (CLAUDE.md): demo/seed data is flagged on ROOT entities
-- only — users, centers, courses. Child rows (enrollments, sessions, payments,
-- attendance, …) inherit demo-ness by ancestry through their FKs, so a purge
-- can cascade from these three tables without flagging all 50+ tables.
-- The education catalog (systems/stages/grades/tracks/subjects/offerings) is
-- permanent reference data, NOT demo — deliberately no flag there.

ALTER TABLE "users"   ADD COLUMN "is_demo" boolean NOT NULL DEFAULT false;
ALTER TABLE "centers" ADD COLUMN "is_demo" boolean NOT NULL DEFAULT false;
ALTER TABLE "courses" ADD COLUMN "is_demo" boolean NOT NULL DEFAULT false;

-- Backfill the rows the pre-flag seed already created, so a re-seed is not
-- required for existing environments. Seeded identifiers are stable:
-- the NILE demo center, the @…nile-academy.eg / seed platform accounts,
-- and any course belonging to a demo center.
UPDATE "centers" SET "is_demo" = true WHERE "short_id" = 'NILE';

UPDATE "users" SET "is_demo" = true
WHERE "email" IN (
  'superadmin@edura.eg',
  'accountant@edura.eg',
  'admin@nile-academy.eg',
  'hossam.aziz@nile-academy.eg',
  'sara.fawzy@nile-academy.eg',
  'lina.hassan@student.nile-academy.eg',
  'mona.hassan@email.eg'
);

UPDATE "courses" SET "is_demo" = true
WHERE "center_id" IN (SELECT "id" FROM "centers" WHERE "is_demo");
