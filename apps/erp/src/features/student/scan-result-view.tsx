"use client";

import {
  BadgeCheck,
  CircleAlert,
  CircleSlash,
  Clock,
  DoorOpen,
  ScanLine,
} from "lucide-react";
import type { ReactNode } from "react";

import { AuthCenteredShell } from "@/components/kit/auth-centered-shell";
import { Eyebrow, Num } from "@/components/ledger";
import { Link } from "@/i18n/navigation";
import { formatStudentCode } from "@repo/database/student-code";
import { Button } from "@repo/ui/components/button";
import type {
  ScanIdentity,
  StudentScanResult,
} from "@repo/server-core/services/students/student-scan";

/* نتيجة مسح البطاقة / What the camera lands on.
   ══════════════════════════════════════════════════════════════════════════════

   THIS COMPONENT HIDES NOTHING. Every field it can render has already been
   reduced to the viewer's tier by `resolveStudentScan`; a `null` here means the
   server decided this reader may not have it. Re-deriving that on the client
   would put the policy in two places, and the client copy is the one an
   attacker reads.

   THE VERDICT IS THE HEADLINE, not a badge in a corner. The single question
   anyone scanning this square has — receptionist, parent, or a stranger who
   found a card on the pavement — is "is this real?", and a page that answers it
   in small grey text beside a name has answered a different question. */

export type ScanLabels = {
  eyebrow: string;
  validTitle: string;
  validBody: string;
  revokedTitle: string;
  revokedBody: string;
  revokedReason: string;
  supersededTitle: string;
  supersededBody: string;
  invalidTitle: string;
  invalidBody: string;
  unreadableTitle: string;
  unreadableBody: string;
  codeLabel: string;
  systemLabel: string;
  gradeLabel: string;
  trackLabel: string;
  publicNotice: string;
  signInCta: string;
  counterCta: string;
  doorCta: string;
  doorHint: string;
  notOnRoster: string;
  foundCard: string;
};

/** The four semantic colours, used for exactly what they mean. */
const TONE = {
  valid: { ink: "var(--teal)", soft: "var(--teal-soft)" },
  warn: { ink: "var(--amber)", soft: "var(--amber-soft)" },
  bad: { ink: "var(--red)", soft: "var(--red-soft)" },
} as const;

function Verdict({
  tone,
  icon,
  title,
  body,
}: {
  tone: keyof typeof TONE;
  icon: ReactNode;
  title: string;
  body: string;
}) {
  const { ink, soft } = TONE[tone];
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span
        className="flex size-12 items-center justify-center rounded-full"
        style={{ background: soft, color: ink }}
      >
        {icon}
      </span>
      <div className="space-y-1">
        <h1 className="text-lg font-bold" style={{ color: ink }}>
          {title}
        </h1>
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          {body}
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <Eyebrow>{label}</Eyebrow>
      <div className="min-w-0 truncate text-end text-sm font-medium" style={{ color: "var(--ink)" }}>
        {children}
      </div>
    </div>
  );
}

function IdentityBlock({
  identity,
  locale,
  labels,
}: {
  identity: ScanIdentity;
  locale: string;
  labels: ScanLabels;
}) {
  const ar = locale === "ar";
  const pick = (v: { nameAr: string; nameEn: string | null } | null) =>
    v ? ((ar ? v.nameAr : v.nameEn) ?? v.nameAr) : null;

  const system = pick(identity.educationSystem);
  const grade = pick(identity.gradeLevel);
  const track = pick(identity.track);

  return (
    <div className="mt-5">
      {identity.name ? (
        <p
          className="truncate text-center text-xl font-bold"
          style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}
        >
          {identity.name}
        </p>
      ) : null}

      <div className="mt-3 divide-y" style={{ borderColor: "var(--rule)" }}>
        <Field label={labels.codeLabel}>
          {/* The one figure on this page, so it takes the figure treatment —
              mono, Latin digits, bidi-isolated inside Arabic prose. */}
          <Num style={{ letterSpacing: "0.06em" }}>
            {formatStudentCode(identity.studentCode)}
          </Num>
        </Field>
        {system ? <Field label={labels.systemLabel}>{system}</Field> : null}
        {grade ? <Field label={labels.gradeLabel}>{grade}</Field> : null}
        {track ? <Field label={labels.trackLabel}>{track}</Field> : null}
      </div>
    </div>
  );
}

export function ScanResultView({
  result,
  locale,
  counterHref,
  doorHref,
  labels,
}: {
  result: StudentScanResult;
  locale: string;
  /**
   * Which counter screen this viewer's role actually owns — `/dashboard/admin`
   * for a center owner, `/dashboard/staff` for a receptionist. Resolved on the
   * server, where the role is, rather than guessed from the tier: the two are
   * not the same question and hardcoding one sends half the centers to a 404.
   */
  counterHref: string | null;
  /** The same, for the hall door a teacher or their assistant owns. */
  doorHref: string | null;
  labels: ScanLabels;
}) {
  // ---- The two dead ends. Neither carries an identity, deliberately: a bad
  // signature and a code that matches nobody give the SAME answer, so this
  // page can never be used to ask whether a code exists.
  if (result.outcome === "unreadable" || result.outcome === "invalid") {
    const unreadable = result.outcome === "unreadable";
    return (
      <AuthCenteredShell>
        <Eyebrow>{labels.eyebrow}</Eyebrow>
        <div className="pt-4">
          <Verdict
            tone="bad"
            icon={<CircleSlash aria-hidden className="size-6" />}
            title={unreadable ? labels.unreadableTitle : labels.invalidTitle}
            body={unreadable ? labels.unreadableBody : labels.invalidBody}
          />
        </div>
      </AuthCenteredShell>
    );
  }

  const { identity } = result;
  const isPublic = identity.tier === "public";
  const isCounter = identity.tier === "counter";

  return (
    <AuthCenteredShell>
      <Eyebrow>{labels.eyebrow}</Eyebrow>

      <div className="pt-4">
        {result.outcome === "valid" ? (
          <Verdict
            tone="valid"
            icon={<BadgeCheck aria-hidden className="size-6" />}
            title={labels.validTitle}
            body={labels.validBody}
          />
        ) : result.outcome === "revoked" ? (
          <Verdict
            tone="bad"
            icon={<CircleAlert aria-hidden className="size-6" />}
            title={labels.revokedTitle}
            body={labels.revokedBody}
          />
        ) : (
          <Verdict
            tone="warn"
            icon={<Clock aria-hidden className="size-6" />}
            title={labels.supersededTitle}
            body={labels.supersededBody}
          />
        )}
      </div>

      <IdentityBlock identity={identity} locale={locale} labels={labels} />

      {/* The reason a card was stopped belongs to whoever is holding it. A
          refusal with no explanation is one nobody can act on — least of all
          the student standing at the counter with it. */}
      {result.outcome === "revoked" && result.reason ? (
        <p
          className="mt-4 rounded-[10px] p-3 text-sm"
          style={{ background: "var(--red-soft)", color: "var(--ink)" }}
        >
          <span style={{ color: "var(--ink-3)" }}>{labels.revokedReason} </span>
          {result.reason}
        </p>
      ) : null}

      {/* ---- Where each reader goes next. */}
      {isCounter && counterHref && result.outcome === "valid" ? (
        <div className="mt-5 space-y-2">
          {/* Into the EXISTING counter, with the student already resolved. The
              check-in flow — sessions, coverage, cash, the ledger — has one
              screen, and this page does not become a second one. */}
          <Button asChild className="w-full" size="lg">
            <Link href={`${counterHref}?code=${identity.studentCode}`}>
              <ScanLine aria-hidden className="size-4" />
              {labels.counterCta}
            </Link>
          </Button>
          {!result.counter?.onOurRoster ? (
            <p className="text-center text-xs" style={{ color: "var(--ink-3)" }}>
              {labels.notOnRoster}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* The teacher's equivalent. It carries a HINT the counter's does not,
          because the door refuses a student who never passed the counter — a
          refusal is much easier to read when you were told the rule before
          pressing the button rather than after. */}
      {result.outcome === "valid" && result.door && doorHref ? (
        <div className="mt-5 space-y-2">
          <Button asChild className="w-full" size="lg">
            <Link href={`${doorHref}?code=${identity.studentCode}`}>
              <DoorOpen aria-hidden className="size-4" />
              {labels.doorCta}
            </Link>
          </Button>
          <p className="text-center text-xs" style={{ color: "var(--ink-3)" }}>
            {labels.doorHint}
          </p>
        </div>
      ) : null}

      {isPublic ? (
        <div className="mt-5 space-y-3">
          <p
            className="rounded-[10px] p-3 text-center text-xs leading-relaxed"
            style={{ background: "var(--paper)", color: "var(--ink-2)" }}
          >
            {labels.publicNotice}
          </p>
          {/* Signing in is what turns this page into the counter. It is an
              invitation, not a wall: everything above is already answered. */}
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">{labels.signInCta}</Link>
          </Button>
          <p className="text-center text-xs" style={{ color: "var(--ink-3)" }}>
            {labels.foundCard}
          </p>
        </div>
      ) : null}
    </AuthCenteredShell>
  );
}
