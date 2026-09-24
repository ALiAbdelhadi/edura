import { describe, expect, it } from "vitest";
import {
  AMENITY_KEYS,
  ROOM_AMENITIES,
  amenityLabel,
  hasAllAmenities,
  orderAmenities,
} from "@repo/database/room-amenities";
import { amenityIcon } from "@/lib/rooms/amenities";

describe("room amenity catalogue", () => {
  it("keeps every key rooms were saved with before the catalogue was shared", () => {
    // rooms.facilities stores these strings. Renaming or dropping one would
    // leave already-saved halls showing a raw key and missing from filters.
    for (const key of ["ac", "whiteboard", "smart_board", "projector", "speakers", "wifi", "seating"]) {
      expect(AMENITY_KEYS.has(key)).toBe(true);
    }
  });

  it("has unique keys and both languages for each", () => {
    expect(new Set(ROOM_AMENITIES.map((a) => a.key)).size).toBe(ROOM_AMENITIES.length);
    for (const a of ROOM_AMENITIES) {
      expect(a.ar.trim()).not.toBe("");
      expect(a.en.trim()).not.toBe("");
    }
  });

  it("gives every catalogue key its own icon, and free text a neutral one", () => {
    const neutral = amenityIcon("شباك على الشارع");
    for (const a of ROOM_AMENITIES) expect(amenityIcon(a.key)).not.toBe(neutral);
  });
});

describe("amenityLabel", () => {
  it("localises a catalogue key", () => {
    expect(amenityLabel("ac", "ar")).toBe("تكييف");
    expect(amenityLabel("ac", "en")).toBe("Air conditioning");
  });

  it("shows a centre's own free text exactly as typed, in either language", () => {
    expect(amenityLabel("شباك على الشارع", "en")).toBe("شباك على الشارع");
  });
});

describe("orderAmenities", () => {
  it("puts catalogue keys in catalogue order, then free text, without duplicates", () => {
    expect(orderAmenities(["wifi", "مكتبة", "ac", "wifi", " ac ", "", "projector"])).toEqual([
      "ac",
      "projector",
      "wifi",
      "مكتبة",
    ]);
  });
});

describe("hasAllAmenities", () => {
  const hall = ["ac", "projector", "wifi"];

  it("matches only a hall that has every wanted amenity", () => {
    expect(hasAllAmenities(hall, ["ac", "wifi"])).toBe(true);
    expect(hasAllAmenities(hall, ["ac", "smart_board"])).toBe(false);
  });

  it("treats no filter as matching every hall, including one with no amenities", () => {
    expect(hasAllAmenities(hall, [])).toBe(true);
    expect(hasAllAmenities(null, [])).toBe(true);
    expect(hasAllAmenities(undefined, ["ac"])).toBe(false);
  });
});
