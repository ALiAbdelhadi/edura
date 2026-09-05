#!/usr/bin/env bash
# Vercel buildCommand for apps/erp and apps/superadmin (SECURITY_AUDIT.md M-09).
#
# The previous command was `bun run build || ([ -f .next/BUILD_ID ] && …)`:
# ANY failure was forgiven as long as a BUILD_ID existed — a real compile or
# type error after a partial write deployed. The only failure this repo has
# ever needed to forgive is Bun's post-build teardown segfault
# (bun.report/1.3.14), which kills the process with a SIGNAL after `next build`
# has printed its completion line. So that, and only that, is forgiven here.
set -u
bun run --filter @repo/database generate || exit $?

log="$(mktemp)"
bun run build 2>&1 | tee "$log"
rc=${PIPESTATUS[0]}
if [ "$rc" -eq 0 ]; then exit 0; fi

# A signal death is exit >= 128. Bun's segfault is 139 (SIGSEGV) or 134 (SIGABRT).
if [ "$rc" -ge 128 ] \
   && grep -qE 'Compiled successfully|Generating static pages \([0-9]+/[0-9]+\)|Finalizing page optimization' "$log" \
   && [ -f .next/BUILD_ID ] && [ -f .next/prerender-manifest.json ]; then
  echo "next build completed; ignoring bun post-build teardown signal (exit $rc, bun.report/1.3.14)"
  exit 0
fi

echo "build failed with exit $rc — not the known teardown signal, refusing to deploy" >&2
exit "$rc"
