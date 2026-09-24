import {
  Accessibility,
  AirVent,
  Armchair,
  Cctv,
  Fan,
  Lightbulb,
  Mic,
  MonitorPlay,
  PlugZap,
  Presentation,
  Projector,
  Speaker,
  Sparkles,
  Tv,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import type { AmenityKey } from "@repo/database/room-amenities";

export {
  AMENITY_KEYS,
  ROOM_AMENITIES,
  amenityLabel,
  hasAllAmenities,
  isAmenityKey,
  orderAmenities,
  type AmenityKey,
} from "@repo/database/room-amenities";

const ICONS: Record<AmenityKey, LucideIcon> = {
  ac: AirVent,
  whiteboard: Presentation,
  smart_board: MonitorPlay,
  projector: Projector,
  speakers: Speaker,
  wifi: Wifi,
  seating: Armchair,
  screen: Tv,
  microphone: Mic,
  fans: Fan,
  lighting: Lightbulb,
  power_outlets: PlugZap,
  cctv: Cctv,
  accessible: Accessibility,
};

// A centre's own free-text extra has no catalogue icon; it gets a neutral one.
export function amenityIcon(value: string): LucideIcon {
  return ICONS[value as AmenityKey] ?? Sparkles;
}
