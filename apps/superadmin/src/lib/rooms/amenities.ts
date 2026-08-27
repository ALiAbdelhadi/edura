const AMENITY_EN: Record<string, string> = {
  ac: "Air conditioning",
  whiteboard: "Whiteboard",
  smart_board: "Smart board",
  projector: "Projector",
  speakers: "Sound system / speakers",
  wifi: "Wi-Fi",
  seating: "Comfortable seating",
};

export function amenityLabel(value: string): string {
  return AMENITY_EN[value] ?? value;
}
