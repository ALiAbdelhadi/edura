// Folds the spellings people mix up (hamza forms, taa marbuta, alef maqsura,
// diacritics) so "احياء" finds "الأحياء" and "رياضه" finds "رياضة".
export function fold(text: string) {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchWords(query: string) {
  return fold(query).split(" ").filter(Boolean);
}

// Every word typed must appear somewhere in the terms.
export function matchesAll(terms: string, words: string[]) {
  const folded = fold(terms);
  return words.every((word) => folded.includes(word));
}
