import type { ReactNode } from "react";

/* Calm 48x48 line illustrations for the marketing cards, drawn in currentColor. */

export type LineArtName =
  | "register"
  | "subscribe"
  | "pay"
  | "attend"
  | "student"
  | "parent"
  | "teacher"
  | "center"
  | "card"
  | "wallet"
  | "cash"
  | "parent-wallet"
  | "guardian"
  | "code"
  | "isolation"
  | "assistant"
  | "staff"
  | "question"
  | "mail"
  | "check";

const ART: Record<LineArtName, ReactNode> = {
  register: (
    <>
      <rect x="9" y="8" width="23" height="32" rx="3" />
      <circle cx="20.5" cy="17" r="3" />
      <path d="M14.5 28h12M14.5 33h7" />
      <path d="M39 21l3 3-9 11-4 1 1-4z" />
    </>
  ),
  subscribe: (
    <>
      <rect x="8" y="10" width="32" height="30" rx="3" />
      <path d="M8 18h32M16 7v6M32 7v6" />
      <rect x="14" y="24" width="14" height="8" rx="2" />
      <path d="M31 28l2.5 2.5 4-5" />
    </>
  ),
  pay: (
    <>
      <path d="M13 7h22v33l-4-3-3.5 3-3.5-3-3.5 3-3.5-3-4 3z" />
      <path d="M18 17l3 3 6-6M18 28h12" />
    </>
  ),
  attend: (
    <>
      <rect x="7" y="12" width="34" height="24" rx="3" />
      <circle cx="16" cy="20" r="3" />
      <path d="M11 30c0-3 2-5 5-5s5 2 5 5" />
      <rect x="27" y="18" width="9" height="9" rx="1" />
      <rect x="30" y="21" width="3" height="3" />
      <path d="M27 31h9" />
    </>
  ),
  student: (
    <>
      <path d="M12 21c0-5 5-9 12-9s12 4 12 9v17a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z" />
      <path d="M19 12v-1c0-2 2-4 5-4s5 2 5 4v1" />
      <rect x="18" y="29" width="12" height="8" rx="2" />
      <path d="M18 24h12" />
    </>
  ),
  parent: (
    <>
      <circle cx="17" cy="13" r="4" />
      <path d="M9 40v-8c0-5 3.5-8 8-8s8 3 8 8v8" />
      <circle cx="34" cy="23" r="3" />
      <path d="M29 40v-5c0-3 2-5 5-5s5 2 5 5v5" />
    </>
  ),
  teacher: (
    <>
      <rect x="9" y="8" width="30" height="20" rx="2" />
      <path d="M15 15h14M15 21h9" />
      <path d="M24 28v12M17 28l-4 12M31 28l4 12" />
    </>
  ),
  center: (
    <>
      <path d="M6 41h36M7 20l17-11 17 11" />
      <path d="M11 22v19M37 22v19" />
      <path d="M20 41v-9a4 4 0 0 1 8 0v9" />
      <rect x="14" y="26" width="4" height="5" />
      <rect x="30" y="26" width="4" height="5" />
      <circle cx="24" cy="18" r="2" />
    </>
  ),
  card: (
    <>
      <rect x="7" y="12" width="34" height="24" rx="3" />
      <path d="M7 20h34M24 30h10" />
      <rect x="12" y="26" width="7" height="5" rx="1" />
    </>
  ),
  wallet: (
    <>
      <rect x="13" y="6" width="22" height="36" rx="4" />
      <path d="M21 10h6M21 38h6" />
      <circle cx="24" cy="16" r="2.5" />
      <rect x="17" y="22" width="14" height="10" rx="2" />
      <path d="M17 26h14" />
      <circle cx="27" cy="29" r="0.8" />
    </>
  ),
  cash: (
    <>
      <path d="M15 20v-2a2 2 0 0 1 2-2h20a2 2 0 0 1 2 2v2" />
      <path d="M11 24v-2a2 2 0 0 1 2-2h26a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-2" />
      <rect x="7" y="24" width="30" height="15" rx="2" />
      <circle cx="22" cy="31.5" r="3.5" />
    </>
  ),
  "parent-wallet": (
    <>
      <rect x="7" y="15" width="34" height="23" rx="3" />
      <path d="M12 15l17-6 4 6" />
      <rect x="31" y="23" width="10" height="9" rx="2" />
      <circle cx="35.5" cy="27.5" r="1" />
      <path d="M19 33l-6-5.5a3.8 3.8 0 0 1 6-4.6 3.8 3.8 0 0 1 6 4.6z" />
    </>
  ),
  guardian: (
    <>
      <path d="M24 6l14 5v11c0 9-6 15-14 19-8-4-14-10-14-19V11z" />
      <path d="M18 24l4 4 8-9" />
    </>
  ),
  code: (
    <>
      <path d="M7 15h34v6a3 3 0 0 0 0 6v6H7v-6a3 3 0 0 0 0-6z" />
      <circle cx="15" cy="24" r="1" />
      <circle cx="19" cy="24" r="1" />
      <circle cx="23" cy="24" r="1" />
      <circle cx="27" cy="24" r="1" />
      <rect x="30" y="21" width="6" height="6" rx="1.5" />
      <path d="M31.8 24l1.4 1.4 1.9-2.8" />
    </>
  ),
  isolation: (
    <>
      <rect x="7" y="7" width="15" height="14" rx="2" />
      <rect x="26" y="7" width="15" height="14" rx="2" />
      <rect x="16.5" y="27" width="15" height="14" rx="2" />
      <rect x="20" y="32" width="8" height="7" rx="1.5" />
      <path d="M22 32v-2.5a2 2 0 0 1 4 0V32" />
    </>
  ),
  assistant: (
    <>
      <circle cx="18" cy="14" r="5" />
      <path d="M8 40v-7c0-5.5 4.5-9 10-9s10 3.5 10 9v7" />
      <rect x="29" y="22" width="12" height="16" rx="2" />
      <path d="M32 22v-2h6v2M32 28h6M32 32h4" />
    </>
  ),
  staff: (
    <>
      <path d="M6 40h36" />
      <rect x="9" y="26" width="30" height="14" rx="1" />
      <path d="M9 31h30" />
      <circle cx="24" cy="13" r="4.5" />
      <path d="M16 26c0-4.5 3.5-7.5 8-7.5s8 3 8 7.5" />
      <rect x="29" y="33" width="6" height="4" rx="1" />
    </>
  ),
  question: (
    <>
      <path d="M8 12a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H21l-8 7v-7h-1a4 4 0 0 1-4-4z" />
      <path d="M20 16a4 4 0 1 1 5.5 3.7c-1 .4-1.5 1.2-1.5 2.3v.5" />
      <circle cx="24" cy="27" r="0.8" />
    </>
  ),
  mail: (
    <>
      <rect x="6" y="11" width="36" height="26" rx="3" />
      <path d="M7 13l17 13 17-13" />
      <path d="M7 35l12-11M41 35L29 24" />
    </>
  ),
  check: (
    <>
      <circle cx="24" cy="24" r="16" />
      <path d="M17 24.5l5 5 9-11" />
    </>
  ),
};

export function LineArt({
  name,
  className,
}: {
  name: LineArtName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ART[name]}
    </svg>
  );
}
