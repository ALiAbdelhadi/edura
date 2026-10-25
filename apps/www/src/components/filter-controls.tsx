import type { SubjectCategory } from "@/lib/catalog";

export type Category = SubjectCategory | "all";

// The search box the subjects and teachers sections share.
export function SearchField({
  id,
  label,
  placeholder,
  clearLabel,
  value,
  onChange,
  controls,
}: {
  id: string;
  label: string;
  placeholder: string;
  clearLabel: string;
  value: string;
  onChange: (value: string) => void;
  controls: string;
}) {
  return (
    <div role="search" className="subject-search">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="subject-search-icon h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <circle cx="9" cy="9" r="5.5" />
        <path d="M13 13l4 4" />
      </svg>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onChange("");
        }}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        aria-controls={controls}
        className="form-field"
      />
      {value ? (
        <button type="button" className="subject-search-clear" aria-label={clearLabel} onClick={() => onChange("")}>
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

// The subject-type tabs, each with how many cards it would show.
export function KindTabs({
  label,
  allLabel,
  labels,
  kinds,
  active,
  count,
  format,
  onPick,
  controls,
}: {
  label: string;
  allLabel: string;
  labels: Record<SubjectCategory, string>;
  kinds: SubjectCategory[];
  active: Category;
  count: (category: Category) => number;
  format: (n: number) => string;
  onPick: (category: Category) => void;
  controls: string;
}) {
  return (
    <div role="group" aria-label={label} className="subject-kinds mt-5">
      {(["all", ...kinds] as Category[]).map((key) => {
        const n = count(key);
        return (
          <button
            key={key}
            type="button"
            className="subject-kind"
            aria-pressed={key === active}
            aria-controls={controls}
            disabled={n === 0 && key !== active}
            onClick={() => onPick(key)}
          >
            {key === "all" ? allLabel : labels[key]}
            <span className="subject-kind-count">{format(n)}</span>
          </button>
        );
      })}
    </div>
  );
}
