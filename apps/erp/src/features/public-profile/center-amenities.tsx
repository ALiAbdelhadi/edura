import { amenityIcon, amenityLabel } from "@/lib/rooms/amenities";

// Read-only list of what a centre's halls offer, for students and parents.
// No hooks and no "use client": the /p/[handle] screen renders it on the
// server and /centers/[id] from a client page. Each caller supplies its own
// heading, in that page's style.
export function CenterAmenities({
  amenities,
  locale,
}: {
  amenities: string[];
  locale: string;
}) {
  if (!amenities.length) return null;
  return (
    <ul role="list" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {amenities.map((a) => {
        const Icon = amenityIcon(a);
        return (
          <li
            key={a}
            className="flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
          >
            <Icon aria-hidden className="size-4 shrink-0" style={{ color: "var(--ink-3)" }} />
            <span className="min-w-0 break-words">{amenityLabel(a, locale)}</span>
          </li>
        );
      })}
    </ul>
  );
}
