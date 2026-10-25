/* eslint-disable no-console */
import "./load-env";
import { withPlatformContext } from "../src/index";
import { GRADE_TRACKS, OFFERINGS, SUBJECTS_SEED, TRACKS, seedCatalog } from "../prisma/seed-catalog";

const write = process.argv.includes("--write");
const TX = { timeout: 120_000, maxWait: 15_000 };

const REMAP_GRADE = "general-secondary-2";
const REMAP_FROM = ["general-sci-science", "general-sci-math"];
const REMAP_TO = "general-scientific";

// 2026/27: azhari-secondary-1 becomes the common Azhari Baccalaureate year, with no tracks.
const RETIRED_LINKS: [grade: string, track: string][] = [
  ...REMAP_FROM.map((t): [string, string] => [REMAP_GRADE, t]),
  ["azhari-secondary-1", "azhari-scientific"],
  ["azhari-secondary-1", "azhari-literary"],
];

const RETIRED_OFFERINGS: [grade: string, track: string | null, subject: string][] = [
  ["azhari-preparatory-1", null, "imla"],
  ["azhari-preparatory-1", null, "khatt"],
  ["azhari-preparatory-2", null, "imla"],
  ["azhari-preparatory-2", null, "khatt"],
  ["azhari-preparatory-3", null, "imla"],
  ["azhari-preparatory-3", null, "khatt"],
  ["azhari-primary-1", null, "fiqh"],
  ["azhari-primary-1", null, "ict"],
  ["azhari-primary-1", null, "nahw"],
  ["azhari-primary-1", null, "science"],
  ["azhari-primary-1", null, "seerah"],
  ["azhari-primary-1", null, "social-studies"],
  ["azhari-primary-1", null, "tawheed"],
  ["azhari-primary-1", null, "vocational"],
  ["azhari-primary-2", null, "fiqh"],
  ["azhari-primary-2", null, "ict"],
  ["azhari-primary-2", null, "nahw"],
  ["azhari-primary-2", null, "science"],
  ["azhari-primary-2", null, "seerah"],
  ["azhari-primary-2", null, "social-studies"],
  ["azhari-primary-2", null, "tawheed"],
  ["azhari-primary-2", null, "vocational"],
  ["azhari-primary-3", null, "fiqh"],
  ["azhari-primary-3", null, "ict"],
  ["azhari-primary-3", null, "nahw"],
  ["azhari-primary-3", null, "science"],
  ["azhari-primary-3", null, "seerah"],
  ["azhari-primary-3", null, "social-studies"],
  ["azhari-primary-3", null, "tawheed"],
  ["azhari-primary-3", null, "vocational"],
  ["azhari-primary-4", null, "fiqh"],
  ["azhari-primary-4", null, "nahw"],
  ["azhari-primary-4", null, "seerah"],
  ["azhari-primary-4", null, "tawheed"],
  ["azhari-primary-5", null, "fiqh"],
  ["azhari-primary-5", null, "nahw"],
  ["azhari-primary-5", null, "seerah"],
  ["azhari-primary-5", null, "tawheed"],
  ["azhari-primary-6", null, "fiqh"],
  ["azhari-primary-6", null, "nahw"],
  ["azhari-primary-6", null, "seerah"],
  ["azhari-primary-6", null, "tawheed"],
  ["azhari-secondary-1", null, "arud"],
  ["azhari-secondary-1", null, "biology"],
  ["azhari-secondary-1", null, "chemistry"],
  ["azhari-secondary-1", null, "geography"],
  ["azhari-secondary-1", null, "history"],
  ["azhari-secondary-1", null, "imla"],
  ["azhari-secondary-1", null, "khatt"],
  ["azhari-secondary-1", null, "physics"],
  ["azhari-secondary-1", null, "seerah"],
  ["azhari-secondary-1", null, "usul-fiqh"],
  ["azhari-secondary-2", null, "arud"],
  ["azhari-secondary-2", null, "imla"],
  ["azhari-secondary-2", null, "khatt"],
  ["azhari-secondary-2", null, "mantiq"],
  ["azhari-secondary-2", null, "seerah"],
  ["azhari-secondary-2", null, "usul-fiqh"],
  ["azhari-secondary-2", "azhari-literary", "philosophy"],
  ["azhari-secondary-2", "azhari-literary", "psychology-sociology"],
  ["azhari-secondary-3", null, "arud"],
  ["azhari-secondary-3", null, "imla"],
  ["azhari-secondary-3", null, "khatt"],
  ["azhari-secondary-3", null, "mantiq"],
  ["azhari-secondary-3", null, "seerah"],
  ["azhari-secondary-3", null, "usul-fiqh"],
  ["azhari-secondary-3", "azhari-literary", "philosophy"],
  ["azhari-secondary-3", "azhari-literary", "psychology-sociology"],
  ["bacc-secondary-1", null, "egyptian-history"],
  ["bacc-secondary-1", null, "science"],
  ["bacc-secondary-2", "bacc-arts", "geography"],
  ["bacc-secondary-2", "bacc-arts", "statistics"],
  ["bacc-secondary-2", "bacc-business", "economics"],
  ["bacc-secondary-2", "bacc-business", "math"],
  ["bacc-secondary-2", "bacc-engineering", "math-advanced"],
  ["bacc-secondary-2", "bacc-engineering", "physics"],
  ["bacc-secondary-2", "bacc-medicine", "biology-advanced"],
  ["bacc-secondary-2", "bacc-medicine", "chemistry"],
  ["bacc-secondary-3", null, "arabic"],
  ["bacc-secondary-3", null, "egyptian-history"],
  ["bacc-secondary-3", null, "foreign-lang-1"],
  ["bacc-secondary-3", "bacc-arts", "geography"],
  ["bacc-secondary-3", "bacc-business", "economics"],
  ["bacc-secondary-3", "bacc-engineering", "physics"],
  ["bacc-secondary-3", "bacc-medicine", "chemistry"],
  ["general-primary-1", null, "ict"],
  ["general-primary-1", null, "science"],
  ["general-primary-1", null, "social-studies"],
  ["general-primary-1", null, "vocational"],
  ["general-primary-2", null, "ict"],
  ["general-primary-2", null, "science"],
  ["general-primary-2", null, "social-studies"],
  ["general-primary-2", null, "vocational"],
  ["general-primary-3", null, "ict"],
  ["general-primary-3", null, "science"],
  ["general-primary-3", null, "social-studies"],
  ["general-primary-3", null, "vocational"],
  ["general-secondary-1", null, "biology"],
  ["general-secondary-1", null, "chemistry"],
  ["general-secondary-1", null, "civics"],
  ["general-secondary-1", null, "geography"],
  ["general-secondary-1", null, "physics"],
  ["general-secondary-2", "general-literary", "history"],
  ["general-secondary-2", "general-literary", "philosophy"],
  ["general-secondary-2", "general-literary", "psychology-sociology"],
  ["general-secondary-2", "general-literary", "statistics"],
  ["general-secondary-2", "general-sci-math", "chemistry"],
  ["general-secondary-2", "general-sci-math", "math"],
  ["general-secondary-2", "general-sci-math", "physics"],
  ["general-secondary-2", "general-sci-science", "biology"],
  ["general-secondary-2", "general-sci-science", "chemistry"],
  ["general-secondary-2", "general-sci-science", "geology"],
  ["general-secondary-2", "general-sci-science", "physics"],
  ["general-secondary-3", "general-literary", "philosophy"],
  ["general-secondary-3", "general-literary", "psychology-sociology"],
  ["general-secondary-3", "general-sci-science", "geology"],
  ["azhari-preparatory-1", null, "fiqh"],
  ["azhari-preparatory-2", null, "fiqh"],
  ["azhari-preparatory-3", null, "fiqh"],
  ["azhari-secondary-1", null, "fiqh"],
  ["azhari-secondary-2", null, "fiqh"],
  ["azhari-secondary-3", null, "fiqh"],
  ["azhari-secondary-1", "azhari-scientific", "math"],
  ["azhari-secondary-1", "azhari-scientific", "integrated-science"],
  ["azhari-secondary-1", "azhari-scientific", "programming-ai"],
  ["azhari-secondary-1", "azhari-scientific", "islamic-culture"],
  ["azhari-secondary-1", "azhari-literary", "history"],
  ["azhari-secondary-1", "azhari-literary", "philosophy"],
  ["azhari-secondary-1", "azhari-literary", "mantiq"],
  ["azhari-secondary-1", "azhari-literary", "programming-ai"],
  ["azhari-secondary-1", "azhari-literary", "islamic-culture"],
  ["azhari-secondary-1", "azhari-literary", "lang2-french"],
  ["azhari-secondary-1", "azhari-literary", "lang2-german"],
  ["azhari-secondary-1", "azhari-literary", "lang2-italian"],
  ["azhari-secondary-1", "azhari-literary", "lang2-spanish"],
];

// Retired by the 2025/26 pass, offered again by the 2026/27 common first year.
// seedCatalog() skips existing rows, so these are switched back on here.
const REVIVED_OFFERINGS: [grade: string, track: string | null, subject: string][] = [
  ["azhari-secondary-1", null, "mantiq"],
  ["azhari-secondary-1", null, "math"],
  ["azhari-secondary-1", null, "philosophy"],
];

const offeringKey = (g: string, t: string | null, s: string) => `${g}|${t ?? "-"}|${s}`;

async function census() {
  return withPlatformContext(async (tx) => {
    const [tracks, subjects, grades] = await Promise.all([
      tx.track.findMany({ select: { id: true, code: true, isActive: true } }),
      tx.subject.findMany({ select: { id: true, code: true, isActive: true } }),
      tx.gradeLevel.findMany({ select: { id: true, code: true } }),
    ]);
    const tCode = new Map(tracks.map((t) => [t.id, t.code]));
    const sCode = new Map(subjects.map((s) => [s.id, s.code]));
    const gCode = new Map(grades.map((g) => [g.id, g.code]));
    const links = await tx.gradeLevelTrack.findMany({ select: { id: true, gradeLevelId: true, trackId: true } });
    const offerings = await tx.subjectOffering.findMany({
      select: { id: true, gradeLevelId: true, trackId: true, subjectId: true, isActive: true },
    });
    return {
      trackIds: new Map(tracks.map((t) => [t.code, t.id])),
      gradeIds: new Map(grades.map((g) => [g.code, g.id])),
      activeTracks: new Set(tracks.filter((t) => t.isActive).map((t) => t.code)),
      activeSubjects: new Set(subjects.filter((s) => s.isActive).map((s) => s.code)),
      links: links.map((l) => ({ id: l.id, key: `${gCode.get(l.gradeLevelId)}|${tCode.get(l.trackId)}` })),
      offerings: offerings.map((o) => ({
        id: o.id,
        isActive: o.isActive,
        key: offeringKey(gCode.get(o.gradeLevelId)!, o.trackId ? tCode.get(o.trackId)! : null, sCode.get(o.subjectId)!),
      })),
    };
  }, TX);
}

function specSets() {
  return {
    tracks: new Set<string>(TRACKS.map((t) => t.code)),
    subjects: new Set(SUBJECTS_SEED.map((s) => s.code)),
    links: new Set(GRADE_TRACKS.flatMap((gt) => gt.tracks.map((t) => `${gt.grade}|${t}`))),
    offerings: new Set(
      OFFERINGS.flatMap((o) => o.grades.flatMap((g) => o.subjects.map((s) => offeringKey(g, o.track ?? null, s)))),
    ),
  };
}

const minus = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x)).sort();

function compare(c: Awaited<ReturnType<typeof census>>) {
  const spec = specSets();
  const links = new Set(c.links.map((l) => l.key));
  const offerings = new Set(c.offerings.filter((o) => o.isActive).map((o) => o.key));
  return {
    tracksMissing: minus(spec.tracks, c.activeTracks),
    tracksExtra: minus(c.activeTracks, spec.tracks),
    subjectsMissing: minus(spec.subjects, c.activeSubjects),
    subjectsExtra: minus(c.activeSubjects, spec.subjects),
    linksMissing: minus(spec.links, links),
    linksExtra: minus(links, spec.links),
    offeringsMissing: minus(spec.offerings, offerings),
    offeringsExtra: minus(offerings, spec.offerings),
  };
}

function printCompare(label: string, d: ReturnType<typeof compare>) {
  console.log(`\n${label}`);
  for (const [k, v] of Object.entries(d)) {
    console.log(`  ${k.padEnd(18)} ${v.length}${v.length ? `  ${v.slice(0, 6).join(", ")}${v.length > 6 ? ", …" : ""}` : ""}`);
  }
}

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "";
  const [row] = await withPlatformContext((tx) =>
    tx.$queryRaw<{ label: string | null }[]>`SELECT shobj_description(d.oid, 'pg_database') label FROM pg_database d WHERE d.datname = current_database()`,
  );
  console.log(`database: ${url ? new URL(url).host : "?"}  label: ${row?.label ?? "UNLABELLED"}  mode: ${write ? "WRITE" : "dry run"}`);

  const before = await census();
  printCompare("before — DB vs seed spec", compare(before));

  const spec = specSets();
  const retiredKeys = new Set(RETIRED_OFFERINGS.map(([g, t, s]) => offeringKey(g, t, s)));
  const clash = [...retiredKeys].filter((k) => spec.offerings.has(k));
  if (clash.length) throw new Error(`reconcile-catalog: retired offerings are still in the seed spec: ${clash.join(", ")}`);
  const toDeactivate = before.offerings.filter((o) => o.isActive && retiredKeys.has(o.key));
  const revivedKeys = new Set(REVIVED_OFFERINGS.map(([g, t, s]) => offeringKey(g, t, s)));
  const toReactivate = before.offerings.filter((o) => !o.isActive && revivedKeys.has(o.key));
  const retiredLinkKeys = new Set(RETIRED_LINKS.map(([g, t]) => `${g}|${t}`));
  const toUnlink = before.links.filter((l) => retiredLinkKeys.has(l.key));

  const gradeId = before.gradeIds.get(REMAP_GRADE)!;
  const fromIds = REMAP_FROM.map((c) => before.trackIds.get(c)).filter((x): x is string => !!x);
  const remapWhere = { gradeLevelId: gradeId, trackId: { in: fromIds } };
  const [students, courses, requests] = await withPlatformContext(
    (tx) =>
      Promise.all([
        tx.studentProfile.count({ where: remapWhere }),
        tx.course.count({ where: remapWhere }),
        tx.collaborationRequest.count({ where: { ...remapWhere, status: "pending" } }),
      ]),
    TX,
  );
  console.log(`\nplanned changes:`);
  console.log(`  offerings to deactivate   ${toDeactivate.length}`);
  console.log(`  offerings to reactivate   ${toReactivate.length}`);
  console.log(`  grade-track links to drop ${toUnlink.length}`);
  console.log(`  ${REMAP_GRADE} ${REMAP_FROM.join("/")} -> ${REMAP_TO}: students ${students}, courses ${courses}, pending collaboration requests ${requests}`);

  if (!write) {
    console.log("\ndry run — pass --write to apply (the seed adds the missing rows first)");
    return;
  }

  await seedCatalog();
  const toId = (await census()).trackIds.get(REMAP_TO);
  if (!toId) throw new Error(`reconcile-catalog: track ${REMAP_TO} missing after seed`);

  const applied = await withPlatformContext(async (tx) => {
    const s = await tx.studentProfile.updateMany({ where: remapWhere, data: { trackId: toId } });
    const c = await tx.course.updateMany({ where: remapWhere, data: { trackId: toId } });
    const r = await tx.collaborationRequest.updateMany({ where: { ...remapWhere, status: "pending" }, data: { trackId: toId } });
    const l = await tx.gradeLevelTrack.deleteMany({ where: { id: { in: toUnlink.map((x) => x.id) } } });
    const o = await tx.subjectOffering.updateMany({
      where: { id: { in: toDeactivate.map((x) => x.id) }, isActive: true },
      data: { isActive: false },
    });
    const v = await tx.subjectOffering.updateMany({
      where: { id: { in: toReactivate.map((x) => x.id) }, isActive: false },
      data: { isActive: true },
    });
    return { students: s.count, courses: c.count, requests: r.count, links: l.count, offerings: o.count, reactivated: v.count };
  }, TX);
  console.log("\napplied:", applied);

  const after = await census();
  const d = compare(after);
  printCompare("after — DB vs seed spec", d);

  const stranded = await withPlatformContext(
    (tx) =>
      tx.$queryRaw<{ id: string; title: string }[]>`
        SELECT c.id, c.title FROM courses c
         WHERE c.subject_id IS NOT NULL AND c.grade_level_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM subject_offerings o
              WHERE o.is_active AND o.subject_id = c.subject_id AND o.grade_level_id = c.grade_level_id
                AND (o.track_id IS NULL OR o.track_id = c.track_id))`,
    TX,
  );
  const azhariWithTrack = await withPlatformContext(
    (tx) => tx.studentProfile.count({ where: { gradeLevelId: after.gradeIds.get("azhari-secondary-1"), trackId: { not: null } } }),
    TX,
  );
  console.log(`\nreport only: courses with no active offering ${stranded.length}${stranded.length ? ` (${stranded.map((x) => x.title).join("; ")})` : ""}`);
  console.log(`report only: azhari-secondary-1 students still carrying a track ${azhariWithTrack}`);

  const drift = Object.values(d).reduce((n, v) => n + v.length, 0);
  if (drift) {
    console.error(`\nFAIL: ${drift} differences remain between the database and the seed spec`);
    process.exitCode = 1;
  } else {
    console.log("\nOK: active catalog equals the seed spec");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
