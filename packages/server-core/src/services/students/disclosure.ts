// ===========================================================================
// How much of a child may a center see?
//
// Two lookups answer "do we already know this student?" — the counter search
// (`lookupStudents`) and the manual-entry dedup check
// (`lookupStudentForManualEntry`). Both can reach a student this center does
// not hold, because both have to: a walk-in carrying another center's card
// must resolve, and creating a duplicate account for a child who already
// exists is worse than seeing that they exist.
//
// REACHING a student and READING them are different permissions. These two
// functions are the second half — enough for a human at a desk to say "yes,
// that's him", not enough to accumulate a list of other centers' children and
// their phone numbers.
//
// They live here rather than beside either caller because there were two
// callers and, until this file existed, only one of them masked anything.
// ===========================================================================

/**
 * "أحمد محمد علي" → "أحمد م." — enough to recognise, not enough to harvest.
 *
 * A SINGLE-TOKEN NAME IS MASKED TOO ("أحمد" → "أ."), which the version this
 * replaced did not do: it returned `parts[0]` whole whenever there was only one
 * part, so every mononym — and every `full_name` a receptionist typed as one
 * word, which is common — came back in the clear from a path whose entire job
 * is to not do that. A proof in `student-id-card.test.ts` now holds this,
 * because a fixture with a one-word name is exactly what caught it.
 *
 * The recognition burden for such a row sits on the code or phone the caller
 * already supplied, not on the name we hand back.
 */
export function maskName(name: string | null): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return null;
  if (parts.length === 1) return `${[...first][0]}.`;
  return `${first} ${[...(parts[1] as string)][0]}.`;
}

/**
 * "01001234567" → "•••••••4567". The last four are what someone reads back to
 * confirm a number they already have; the rest is what makes it a contact.
 */
export function maskPhone(phone: string | null): string | null {
  if (!phone || phone.length < 4) return null;
  return `${"•".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}
