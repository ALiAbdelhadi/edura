// Demo halls for the room-amenities feature, so the teacher's amenity filter and
// the "مرافق السنتر" section on the public centre page have something to show.
//
// Writes ONLY `rooms`, on the demo centre NILE (seed.ts), which is is_demo — the
// halls inherit that by ancestry. `price` is left null on purpose: nothing here
// touches money, pricing config or commission_settings.
//
// Idempotent (deterministic ids). `--purge` removes exactly these halls, and
// keeps any a demo course or session has since been attached to, deactivated.
import { assertNotProduction } from "../scripts/db-guard";
import { prisma, withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";

const PURGE = process.argv.includes("--purge");
const did = seedId("edura-roomamenities:");

const HALLS = [
  {
    key: "hall-a",
    name: "قاعة أ — المدرج",
    capacity: 60,
    description: "قاعة كبيرة للمراجعات النهائية",
    facilities: ["ac", "projector", "speakers", "microphone", "wifi", "seating", "cctv"],
  },
  {
    key: "hall-b",
    name: "قاعة ب",
    capacity: 30,
    description: "قاعة متوسطة للمجموعات",
    facilities: ["ac", "smart_board", "screen", "wifi", "power_outlets", "accessible"],
  },
  {
    key: "hall-c",
    name: "قاعة ج — الصغيرة",
    capacity: 15,
    description: "قاعة صغيرة للمجموعات الخاصة",
    facilities: ["fans", "whiteboard", "lighting", "شباك على الشارع"],
  },
] as const;

async function main() {
  await assertNotProduction("room-amenities-demo-seed");
  const ids = HALLS.map((h) => did(`room:${h.key}`));

  await withPlatformContext(async (tx) => {
    const center = await tx.center.findUnique({ where: { shortId: "NILE" } });
    if (!center) throw new Error("Demo centre NILE not found — run `bun run seed` first.");
    if (!center.isDemo) throw new Error("Centre NILE is not flagged is_demo; refusing to add halls to it.");

    if (PURGE) {
      const used = await tx.room.findMany({
        where: { id: { in: ids }, OR: [{ courses: { some: {} } }, { sessions: { some: {} } }] },
        select: { id: true },
      });
      const keep = new Set(used.map((r) => r.id));
      if (keep.size) await tx.room.updateMany({ where: { id: { in: [...keep] } }, data: { isActive: false } });
      const gone = await tx.room.deleteMany({ where: { id: { in: ids.filter((id) => !keep.has(id)) } } });
      console.log(`purged ${gone.count} demo hall(s)${keep.size ? `, deactivated ${keep.size} still in use` : ""}`);
      return;
    }

    for (const [i, h] of HALLS.entries()) {
      const data = {
        name: h.name,
        capacity: h.capacity,
        description: h.description,
        facilities: [...h.facilities],
        isActive: true,
      };
      await tx.room.upsert({
        where: { id: ids[i]! },
        update: data,
        create: { id: ids[i]!, centerId: center.id, ...data },
      });
    }
    console.log(`seeded ${HALLS.length} demo halls on ${center.name} (${center.shortId})`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
