import type { ReactNode } from "react";

export function BrowserFrame({
  children,
  label,
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div
      className="overflow-hidden"
      style={{
        backgroundColor: "var(--sheet)",
        border: "1px solid var(--rule)",
        borderRadius: "var(--radius-step-lg)",
        boxShadow: "var(--lift-2)",
      }}
    >
      <div
        dir="ltr"
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: "1px solid var(--rule)", backgroundColor: "var(--field)" }}
      >
        <span className="flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block h-2.25 w-2.25 rounded-full"
              style={{ border: "1px solid var(--rule)" }}
            />
          ))}
        </span>
        {label ? (
          <span
            className="ms-2 truncate rounded-[5px] px-2 py-0.5 font-mono text-[10px]"
            style={{
              backgroundColor: "var(--sheet)",
              border: "1px solid var(--rule)",
              color: "var(--ink-3)",
            }}
          >
            {label}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        backgroundColor: "var(--sheet)",
        border: "1px solid var(--rule)",
        borderRadius: "28px",
        padding: "8px",
        boxShadow: "var(--lift-2)",
      }}
    >
      <div className="overflow-hidden" style={{ borderRadius: "21px" }}>
        {children}
      </div>
      {/* The speaker slot — one hairline pill, not a notch cut-out. */}
      <span
        aria-hidden
        className="absolute inset-s-1/2 top-3.5 h-0.75 w-11.5 -translate-x-1/2 rounded-full"
        style={{ backgroundColor: "var(--rule)" }}
      />
    </div>
  );
}
