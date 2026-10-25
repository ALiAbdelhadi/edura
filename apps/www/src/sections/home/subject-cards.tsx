"use client";

import { useId, useState } from "react";

import { Arrow } from "@/components/arrow";
import { KindTabs, SearchField, type Category } from "@/components/filter-controls";
import { SubjectArt } from "@/components/subject-art";

import type { Messages } from "@/i18n/messages";
import { SUBJECT_CATEGORIES, type GroupGrade, type GroupSubject, type SubjectGroup } from "@/lib/catalog";
import { matchesAll, searchWords } from "@/lib/fold";

// How many cards a stage shows before "show all".
const FIRST = 8;

// The cover grounds cycle so a row of cards never repeats its neighbour.
const GROUNDS = ["pen", "marker", "field"] as const;

// A labelled native select: the year and track pickers.
function Picker({
  label,
  allLabel,
  value,
  options,
  onChange,
  controls,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: { code: string; name: string }[];
  onChange: (value: string) => void;
  controls: string;
}) {
  return (
    <label className="subject-picker">
      <span className="t-meta">{label}</span>
      <span className="subject-picker-box">
        <select className="form-field" value={value} aria-controls={controls} onChange={(e) => onChange(e.target.value)}>
          <option value="">{allLabel}</option>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="subject-picker-icon h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </span>
    </label>
  );
}

export function SubjectCards({
  t,
  locale,
  groups,
  grades,
  initial,
  registerHref,
}: {
  t: Messages["cards"];
  locale: string;
  groups: Record<SubjectGroup, GroupSubject[]>;
  grades: Record<SubjectGroup, GroupGrade[]>;
  initial: SubjectGroup;
  registerHref: string;
}) {
  const [group, setGroup] = useState<SubjectGroup>(initial);
  const [grade, setGrade] = useState("");
  const [track, setTrack] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const id = useId();
  const gridId = `${id}-grid`;

  const number = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US");
  const plural = (forms: { one: string; two: string; few: string; many: string }, n: number) => {
    const form = n === 1 ? forms.one : n === 2 ? forms.two : n <= 10 ? forms.few : forms.many;
    return form.replace("{n}", number.format(n));
  };

  const words = searchWords(query);
  const searching = words.length > 0;
  const year = grades[group].find((g) => g.code === grade);
  const tracks = year?.tracks ?? [];
  // A subject belongs to the picked year when a slot names it, and to the picked
  // track when that slot is shared by every track or names this one.
  const taught = (s: GroupSubject) =>
    !year || s.slots.some((slot) => slot.grade === year.code && (!track || !slot.track || slot.track === track));
  const inStage = groups[group].filter(taught);
  const found = searching ? inStage.filter((s) => matchesAll(s.terms, words)) : inStage;
  const subjects = category === "all" ? found : found.filter((s) => s.category === category);
  const filtered = searching || category !== "all" || year !== undefined;
  const shown = all || filtered ? subjects : subjects.slice(0, FIRST);

  // Only the kinds this stage teaches get a tab.
  const kinds = SUBJECT_CATEGORIES.filter((c) => inStage.some((s) => s.category === c));
  const countOf = (c: Category) => (c === "all" ? found.length : found.filter((s) => s.category === c).length);

  // When the stage has nothing for the query, the stages that do.
  const elsewhere = searching
    ? (Object.keys(groups) as SubjectGroup[])
        .filter((g) => g !== group)
        .map((g) => ({ g, n: groups[g].filter((s) => matchesAll(s.terms, words)).length }))
        .filter(({ n }) => n > 0)
    : [];

  // When the stage has it, but not in the picked year.
  const otherYears = searching && year !== undefined && groups[group].some((s) => matchesAll(s.terms, words));

  // Which tracks take a subject in the picked year, when not every track does.
  const onlyIn = (s: GroupSubject) => {
    if (!year || track) return "";
    const own = s.slots.filter((slot) => slot.grade === year.code);
    if (own.length === 0) return "";
    if (own.some((slot) => !slot.track)) return year.tracks.length > 0 ? t.everyTrack : "";
    const names = year.tracks.filter((tr) => own.some((slot) => slot.track === tr.code)).map((tr) => tr.name);
    return t.trackOnly.replace("{t}", names.join(locale === "ar" ? "، " : ", "));
  };

  const keepCategory = (next: GroupSubject[]) => {
    if (category !== "all" && !next.some((s) => s.category === category)) setCategory("all");
  };

  const pickGroup = (key: SubjectGroup) => {
    setGroup(key);
    setGrade("");
    setTrack("");
    setAll(false);
    keepCategory(groups[key]);
  };

  const pickGrade = (code: string) => {
    setGrade(code);
    setTrack("");
    setAll(false);
    keepCategory(code ? groups[group].filter((s) => s.slots.some((slot) => slot.grade === code)) : groups[group]);
  };

  const pickTrack = (code: string) => {
    setTrack(code);
    keepCategory(
      groups[group].filter((s) =>
        s.slots.some((slot) => slot.grade === grade && (!code || !slot.track || slot.track === code)),
      ),
    );
  };

  return (
    <div>
      <div className="subject-tools">
        <div role="group" aria-label={t.groupsLabel} className="subject-pills">
          {(Object.keys(groups) as SubjectGroup[]).map((key) => (
            <button
              key={key}
              type="button"
              className="chip min-h-11"
              aria-pressed={key === group}
              aria-controls={gridId}
              onClick={() => pickGroup(key)}
            >
              {t.groups[key]}
            </button>
          ))}
        </div>

        <SearchField
          id={`${id}-q`}
          label={t.searchLabel}
          placeholder={t.searchPlaceholder}
          clearLabel={t.clear}
          value={query}
          onChange={setQuery}
          controls={gridId}
        />
      </div>

      <div className="subject-pickers mt-4">
        <Picker
          label={t.yearLabel}
          allLabel={t.allYears}
          value={grade}
          options={grades[group]}
          onChange={pickGrade}
          controls={gridId}
        />
        {tracks.length > 0 ? (
          <Picker
            label={t.trackLabel}
            allLabel={t.allTracks}
            value={track}
            options={tracks}
            onChange={pickTrack}
            controls={gridId}
          />
        ) : null}
      </div>

      <KindTabs
        label={t.categoriesLabel}
        allLabel={t.all}
        labels={t.categories}
        kinds={kinds}
        active={category}
        count={countOf}
        format={number.format}
        onPick={setCategory}
        controls={gridId}
      />

      <p role="status" className="t-meta mt-5">
        {subjects.length > 0 ? plural(t.count, subjects.length) : ""}
      </p>

      {subjects.length > 0 ? (
        <ul id={gridId} role="list" className="subject-grid mt-3">
          {shown.map((subject, i) => (
            <li key={subject.code} className="subject-card">
              <span className="subject-cover" data-ground={GROUNDS[i % GROUNDS.length]}>
                <SubjectArt code={subject.code} className="subject-art" />
              </span>
              <span className="subject-name">{subject.name}</span>
              <span className="t-meta">{onlyIn(subject) || plural(t.years, subject.years)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div id={gridId} className="subject-empty mt-3">
          <p className="t-h3">{t.empty.replace("{q}", query.trim()).replace("{stage}", year?.name ?? t.groups[group])}</p>
          <p className="mt-2 text-[0.9375rem] text-ink-2">{t.emptyHint}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {category !== "all" && found.length > 0 ? (
              <button type="button" className="chip" onClick={() => setCategory("all")}>
                {t.allCategories}
              </button>
            ) : null}
            {otherYears ? (
              <button type="button" className="chip" onClick={() => pickGrade("")}>
                {t.allYearsAction}
              </button>
            ) : null}
            {elsewhere.length > 0 ? (
              <>
                <span className="t-meta">{t.elsewhere}</span>
                {elsewhere.map(({ g, n }) => (
                  <button key={g} type="button" className="chip" onClick={() => pickGroup(g)}>
                    {t.groups[g]}
                    <span className="subject-kind-count">{number.format(n)}</span>
                  </button>
                ))}
              </>
            ) : null}
            <button type="button" className="btn btn-quiet" onClick={() => setQuery("")}>
              {t.clear}
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {!filtered && subjects.length > FIRST ? (
          <button
            type="button"
            className="btn btn-quiet"
            aria-expanded={all}
            aria-controls={gridId}
            onClick={() => setAll((v) => !v)}
          >
            {all ? t.showLess : t.showAll.replace("{n}", number.format(subjects.length))}
          </button>
        ) : (
          <span />
        )}
        <a href={registerHref} className="btn btn-pen">
          {t.cta}
          <Arrow />
        </a>
      </div>
    </div>
  );
}
