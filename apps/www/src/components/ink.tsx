import { Fragment, type ElementType } from "react";

import { splitWords } from "@/lib/motion";

export function Ink({
  as: Tag = "span",
  text,
  className = "",
}: {
  as?: ElementType;
  text: string;
  className?: string;
}) {
  const parts = splitWords(text);

  return (
    <Tag className={className} data-ink="">
      {parts.map((part, i) =>
        /^\s+$/.test(part) ? (
          <Fragment key={i}>{part}</Fragment>
        ) : (
          <span key={i} className="inline-block" data-ink-word="">
            {part}
          </span>
        ),
      )}
    </Tag>
  );
}
