"use client";

import { useId, useState } from "react";

import { KindTabs, SearchField, type Category } from "@/components/filter-controls";
import { SubjectArt } from "@/components/subject-art";
import { TeacherPortrait } from "@/components/teacher-portrait";

import type { Messages } from "@/i18n/messages";
import { SUBJECT_CATEGORIES, type SubjectCategory } from "@/lib/catalog";
import { matchesAll, searchWords } from "@/lib/fold";

const TONES = [0, 2, 1, 1, 0, 2, 2, 1, 0] as const;
const GROUNDS = ["pen", "marker", "field"] as const;

export type TeacherItem = Messages["teachers"]["items"][number] & {
  category: SubjectCategory;
  terms: string;
};

export function TeacherCards({
  t,
  cards,
  locale,
  items,
}: {
  t: Messages["teachers"];
  cards: Messages["cards"];
  locale: string;
  items: TeacherItem[];
}) {
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const id = useId();
  const gridId = `${id}-grid`;

  const number = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US");
  const plural = (n: number) => {
    const form = n === 1 ? t.count.one : n === 2 ? t.count.two : n <= 10 ? t.count.few : t.count.many;
    return form.replace("{n}", number.format(n));
  };

  const words = searchWords(query);
  // The card's place in the full list keeps its portrait and ground while filtering.
  const indexed = items.map((item, index) => ({ item, index }));
  const found = words.length > 0 ? indexed.filter(({ item }) => matchesAll(item.terms, words)) : indexed;
  const shown = category === "all" ? found : found.filter(({ item }) => item.category === category);
  const kinds = SUBJECT_CATEGORIES.filter((c) => items.some((item) => item.category === c));
  const countOf = (c: Category) => (c === "all" ? found.length : found.filter(({ item }) => item.category === c).length);

  return (
    <div>
      <div className="subject-tools mt-8">
        <SearchField
          id={`${id}-q`}
          label={t.searchLabel}
          placeholder={t.searchPlaceholder}
          clearLabel={cards.clear}
          value={query}
          onChange={setQuery}
          controls={gridId}
        />
      </div>

      <KindTabs
        label={cards.categoriesLabel}
        allLabel={cards.all}
        labels={cards.categories}
        kinds={kinds}
        active={category}
        count={countOf}
        format={number.format}
        onPick={setCategory}
        controls={gridId}
      />

      <p role="status" className="t-meta mt-5">
        {shown.length > 0 ? plural(shown.length) : ""}
      </p>

      {shown.length > 0 ? (
        <ul id={gridId} role="list" className="teacher-grid mt-3">
          {shown.map(({ item, index }) => (
            <li key={item.role} className="teacher-card">
              <span className="teacher-cover" data-ground={GROUNDS[index % GROUNDS.length]}>
                <TeacherPortrait look={item.look} tone={TONES[index % TONES.length]!} className="teacher-portrait" />
                <span className="teacher-badge">
                  <SubjectArt code={item.subject} className="h-6 w-6" />
                </span>
              </span>
              <span className="teacher-body">
                <span className="t-h3 block">{item.role}</span>
                <span className="t-meta mt-1 block">{item.grade}</span>
                <span className="teacher-foot">
                  <span className="inline-flex items-center gap-1.5 text-[0.875rem] text-ink-2">
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <circle cx="8" cy="8" r="6" />
                      <path d="M8 5v3l2 1.5" />
                    </svg>
                    {item.when}
                  </span>
                  <span className="teacher-mode" data-mode={item.mode}>
                    {t.modes[item.mode]}
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div id={gridId} className="subject-empty mt-3">
          <p className="t-h3">{t.empty.replace("{q}", query.trim())}</p>
          <p className="mt-2 text-[0.9375rem] text-ink-2">{t.emptyHint}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {category !== "all" && found.length > 0 ? (
              <button type="button" className="chip" onClick={() => setCategory("all")}>
                {cards.allCategories}
              </button>
            ) : null}
            {query ? (
              <button type="button" className="btn btn-quiet" onClick={() => setQuery("")}>
                {cards.clear}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
