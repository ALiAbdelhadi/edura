// Canonical, selectable room amenities. The center picks from this set; the
// stable `key` is stored in Room.facilities[] (bilingual label resolved on
// display), and any free-text extra the center types is stored verbatim.
export const ROOM_AMENITIES = [
  { key: "ac", en: "Air conditioning", ar: "تكييف" },
  { key: "whiteboard", en: "Whiteboard", ar: "سبورة" },
  { key: "smart_board", en: "Smart board", ar: "سبورة ذكية" },
  { key: "projector", en: "Projector", ar: "بروجيكتور" },
  { key: "speakers", en: "Sound system / speakers", ar: "نظام صوتي / سماعات" },
  { key: "wifi", en: "Wi-Fi", ar: "واي فاي" },
  { key: "seating", en: "Comfortable seating", ar: "مقاعد مريحة" },
] as const;

export type AmenityKey = (typeof ROOM_AMENITIES)[number]["key"];

const BY_KEY = new Map(ROOM_AMENITIES.map((a) => [a.key, a]));
export const AMENITY_KEYS = new Set<string>(ROOM_AMENITIES.map((a) => a.key));

/** Localized label for a facility value: a known amenity key → its ar/en label;
 * anything else (free-text extra) → the raw string. */
export function amenityLabel(value: string, locale: string): string {
  const a = BY_KEY.get(value as AmenityKey);
  if (!a) return value;
  return locale === "ar" ? a.ar : a.en;
}
