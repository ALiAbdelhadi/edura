// The one catalogue of room amenities, shared by both apps' clients and
// servers. It used to be copied into apps/erp and apps/superadmin, the copies
// drifted, and the back office ended up printing every label in English.
//
// Keys are what `rooms.facilities` stores. NEVER rename or remove one: rooms
// already saved with it would stop resolving and fall back to showing the raw
// key. Add new keys at the end. A value that is not a key here is a centre's
// own free-text extra and is shown as typed.
export const ROOM_AMENITIES = [
  { key: "ac", en: "Air conditioning", ar: "تكييف" },
  { key: "whiteboard", en: "Whiteboard", ar: "سبورة" },
  { key: "smart_board", en: "Smart board", ar: "سبورة ذكية" },
  { key: "projector", en: "Projector", ar: "بروجيكتور" },
  { key: "speakers", en: "Sound system / speakers", ar: "نظام صوتي / سماعات" },
  { key: "wifi", en: "Wi-Fi", ar: "واي فاي" },
  { key: "seating", en: "Comfortable seating", ar: "مقاعد مريحة" },
  { key: "screen", en: "Display screen", ar: "شاشة عرض" },
  { key: "microphone", en: "Microphone", ar: "ميكروفون" },
  { key: "fans", en: "Fans", ar: "مراوح" },
  { key: "lighting", en: "Good lighting", ar: "إضاءة جيدة" },
  { key: "power_outlets", en: "Power outlets", ar: "مخارج كهرباء" },
  { key: "cctv", en: "Security cameras", ar: "كاميرات مراقبة" },
  { key: "accessible", en: "Wheelchair accessible", ar: "مناسبة لذوي الهمم" },
] as const;

export type AmenityKey = (typeof ROOM_AMENITIES)[number]["key"];

const BY_KEY = new Map<string, (typeof ROOM_AMENITIES)[number]>(
  ROOM_AMENITIES.map((a) => [a.key, a]),
);

export const AMENITY_KEYS: ReadonlySet<string> = new Set(ROOM_AMENITIES.map((a) => a.key));

export function isAmenityKey(value: string): value is AmenityKey {
  return BY_KEY.has(value);
}

export function amenityLabel(value: string, locale: string): string {
  const a = BY_KEY.get(value);
  if (!a) return value;
  return locale === "ar" ? a.ar : a.en;
}

// Catalogue keys first, in catalogue order, then free-text extras in the order
// given. Deduplicated. Used wherever several rooms' lists are merged or shown.
export function orderAmenities(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const extras: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    if (!BY_KEY.has(v)) extras.push(v);
  }
  return [...ROOM_AMENITIES.map((a) => a.key).filter((k) => seen.has(k)), ...extras];
}

// True when a hall offers every amenity in `wanted`. An empty `wanted` matches
// every hall, so "no filter" and "filter cleared" need no special case.
export function hasAllAmenities(
  facilities: readonly string[] | null | undefined,
  wanted: readonly string[],
): boolean {
  const have = new Set(facilities ?? []);
  return wanted.every((a) => have.has(a));
}
