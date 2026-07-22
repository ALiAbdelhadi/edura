// Room amenity keys mirror apps/www/src/lib/rooms/amenities.ts (kept in sync).
// Superadmin is English-only staff UI, so only the English label is needed.
const AMENITY_EN: Record<string, string> = {
  ac: "Air conditioning",
  whiteboard: "Whiteboard",
  smart_board: "Smart board",
  projector: "Projector",
  speakers: "Sound system / speakers",
  wifi: "Wi-Fi",
  seating: "Comfortable seating",
};

/** A known amenity key → its English label; any free-text extra → the raw string. */
export function amenityLabel(value: string): string {
  return AMENITY_EN[value] ?? value;
}
