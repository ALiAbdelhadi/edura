// ===========================================================================
// العلامة المحفورة — the Edura mark, engraved.
//
// NOT A SECOND LOGO. This is the SAME mark as `apps/www/public/edura-mark.svg`
// — the open book, the spine, the arc and the cap — re-drawn in one ink at
// hairline weight. A second, differently-shaped logo would be a second answer
// to "what does this product look like", free to drift from the first.
//
// ── WHY THE APP'S MARK CANNOT BE DROPPED ON THE CARD AS-IS ─────────────────
//
// That file is from the retired EduConnect system: it is a violet→indigo
// GRADIENT on a filled tile, plus #00b473 and #ffc6c6. Three of those are hues
// the Ledger palette does not contain, and the gradient is the exact device
// CONSTITUTION §4 forbids on a student surface. On a card whose whole identity
// is an engraving, a filled gradient tile also simply fights the engraving.
//
// So the card gets the DOCUMENT treatment of the same mark, which is what
// engraved documents have always done: a passport does not print the tourist
// board's gradient, it prints a line-engraved crest.
//
// ── THE MARK IS CONSTANT; THE ENGRAVING IS THE STUDENT'S ───────────────────
//
// It is drawn in `--indigo` — brand, in the four-colour system — for EVERY
// student, deliberately not in the per-student accent. A logo that changed
// colour per holder would stop being a logo. Colour carries meaning here: the
// brand is always indigo, the identity is always the rosette.
//
// ── ONE SOURCE OF GEOMETRY, TWO RENDERERS ──────────────────────────────────
//
// Path data, not markup. The card's SVG feeds it straight into `<path d>`, and
// the PNG exporter feeds the same strings into `new Path2D(d)` — so the mark
// on screen, on paper and in the shared image cannot drift apart.
// ===========================================================================

/** The coordinate space these paths are authored in. Square. */
export const EDURA_MARK_VIEWBOX = 200;

export type MarkPath = {
  d: string;
  /** Filled rather than stroked. Nothing is, at the moment. */
  filled?: boolean;
  /** Hairlines that carry less weight than the primary outline. */
  light?: boolean;
};

/** Stroke weights in viewBox units — heavy for the outline, light for the spine. */
export const EDURA_MARK_STROKE = { heavy: 11, light: 8 } as const;

// ── WHY IT IS ONLY THE BOOK ────────────────────────────────────────────────
//
// The app's mark also carries a graduation cap, a tassel and a stud. On the
// card the mark renders at roughly 30px beside the document's title, and at
// that size those three details stop being shapes and become a smudge — the
// first draft of this file kept them and read as a scribble on screen.
//
// So the card's mark is the RECOGNISABLE CORE of the same logo: the open book
// and its spine, at a weight that survives being printed at 86mm and being
// looked at on a phone. Simplifying a mark for small sizes is what a mark is
// FOR; inventing a different shape would have been the mistake.
export const EDURA_MARK_PATHS: MarkPath[] = [
  // The two open pages — outlines, where the original had two translucent
  // white fills. An engraving states an edge; it does not wash an area.
  { d: "M100 52 L54 84 L54 150 L100 122 Z" },
  { d: "M100 52 L146 84 L146 150 L100 122 Z" },
  // The spine, holding the two halves together.
  { d: "M100 52 L100 122", light: true },
];
