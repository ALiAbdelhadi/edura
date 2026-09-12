function Mark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 5.4C13.4 3.5 10.1 2.6 6.2 2.9c-.7.1-1.2.6-1.2 1.3v13.6c0 .8.6 1.4 1.4 1.3 3.6-.3 6.8.5 9.6 2.4" />
      <path d="M16 5.4c2.6-1.9 5.9-2.8 9.8-2.5.7.1 1.2.6 1.2 1.3v13.6c0 .8-.6 1.4-1.4 1.3-3.6-.3-6.8.5-9.6 2.4" />
      <path d="M16 5.4v16.1" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark className="h-5 w-auto text-gold" />
      <span
        lang="en"
        dir="ltr"
        className="hidden font-lat-display text-[1.125rem] font-bold tracking-[0.01em] text-ink sm:inline"
      >
        Edura
      </span>
    </span>
  );
}
