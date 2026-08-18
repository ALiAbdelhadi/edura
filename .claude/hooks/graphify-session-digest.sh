#!/usr/bin/env bash
# SessionStart hook: inject a COMPACT graphify orientation digest.
#
# Why a digest and not the file: graphify-out/GRAPH_REPORT.md is ~2.8k lines
# (~35k tokens). Injecting it every session would cost more than it saves.
# This emits the summary, the god nodes, the community hubs and a staleness
# check — everything needed to decide what to query — and points at the full
# report for the rare case that a digest is not enough.
#
# Exits silently (status 0, no output) whenever there is no graph, so a
# checkout without graphify-out/ starts a normal session.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)" || exit 0
cd "$ROOT" || exit 0

REPORT="graphify-out/GRAPH_REPORT.md"
[ -f "$REPORT" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

# --- summary line: "- 12092 nodes · 29025 edges · 689 communities (...)"
summary=$(grep -m1 -E '^- [0-9]+ nodes' "$REPORT" | sed 's/^- //')

# --- freshness: the report records the commit it was built from
built=$(grep -m1 'Built from commit' "$REPORT" | grep -oE '[0-9a-f]{7,40}' | head -1)
head_sha=$(git rev-parse --short=8 HEAD 2>/dev/null)
if [ -n "$built" ] && [ -n "$head_sha" ] && [ "${built:0:8}" != "${head_sha:0:8}" ]; then
  freshness="STALE — graph built at ${built:0:8}, HEAD is ${head_sha}. Run \`graphify update .\` (AST-only, no API cost)."
else
  freshness="Current as of ${built:-unknown}."
fi

# --- architectural hubs (capped: the report lists hundreds)
# God Nodes are numbered ("1. `platformDb()` - 451 edges"); Community Hubs are
# bulleted ("- Superadmin Portal Pages"). Handle both prefixes.
section_items() { # $1 = heading prefix, $2 = max items
  awk -v want="$1" -v max="$2" '
    index($0, "## " want) == 1 { f = 1; next }
    f && /^## / { exit }
    f && /^([0-9]+\.|-) / {
      sub(/^([0-9]+\.|-) /, ""); gsub(/`/, "")
      if ($0 ~ / - [0-9]+ edges$/) { sub(/ - /, " "); sub(/ edges$/, "") }   # "x() - 451 edges" -> "x() 451"
      n++; if (n <= max) printf "%s%s", sep, $0; sep = " · "
    }
  ' "$REPORT"
}
gods=$(section_items "God Nodes" 10)
hubs=$(section_items "Community Hubs" 18)

digest=$(cat <<EOF
[graphify] This repo has a knowledge graph. Use it BEFORE grep/read/glob.

  Graph:     ${summary:-unknown}
  Freshness: ${freshness}

  Core abstractions (god nodes): ${gods:-none}

  Community hubs (first 18): ${hubs:-none}

  How to use it — these return a scoped subgraph, far smaller than grep output:
    graphify query "<question>"      orient on any task (run this FIRST)
    graphify path "<A>" "<B>"        how two things connect
    graphify explain "<concept>"     one node and its neighbours
    graphify affected "<X>"          what breaks if X changes
  Full report (~2.8k lines, read sections not the whole file): graphify-out/GRAPH_REPORT.md
EOF
)

jq -n --arg ctx "$digest" \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
