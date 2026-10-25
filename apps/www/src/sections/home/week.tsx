import type { Messages } from "@/i18n/messages";

const DAYS = 6;
const SLOTS = 4;

// The signature: a school week, Saturday to Thursday. The grid flows column by
// column so a screen reader meets the classes day by day; empty cells are
// hidden from it, and each class carries its own day.
export function Week({ week }: { week: Messages["hero"]["week"] }) {
  const byCell = new Map(week.classes.map((c) => [c.day * SLOTS + c.slot, c]));

  return (
    <figure className="week home-week">
      <figcaption className="sr-only">{week.caption}</figcaption>

      <div aria-hidden="true" className="week-head">
        {week.days.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <ul role="list" className="week-grid home-week-grid">
        {Array.from({ length: DAYS * SLOTS }, (_, i) => {
          const c = byCell.get(i);
          if (!c) return <li key={i} aria-hidden="true" className="week-cell" />;
          return (
            <li key={i} className="week-cell home-week-class" data-state={c.next ? "next" : "mine"}>
              <span className="sr-only">
                {c.next ? `${week.next}: ` : ""}
                {week.days[c.day]} ·{" "}
              </span>
              <span className="home-week-subject">{c.subject}</span>
              <span className="home-week-time">{c.time}</span>
            </li>
          );
        })}
      </ul>

      <div aria-hidden="true" className="week-legend">
        <span>
          <i />
          {week.mine}
        </span>
        <span>
          <i data-state="next" />
          {week.next}
        </span>
      </div>
    </figure>
  );
}
