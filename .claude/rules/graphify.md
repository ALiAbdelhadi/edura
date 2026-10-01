---
paths:
  - "graphify-out/**"
  - "apps/*/src/**"
  - "packages/*/src/**"
---

## graphify

- A knowledge graph lives in `graphify-out/`. Use `graphify query "<question>"`
  to orient on unfamiliar areas or broad questions; skip it when the exact file
  is already known. `graphify path "<A>" "<B>"` and `graphify explain "<concept>"`
  give focused subgraphs.
- No `graphify-out/wiki/` is generated here; read `graphify-out/GRAPH_REPORT.md`
  only for architecture review.
- After modifying code, run `graphify update .`; if the session digest says
  STALE, update before trusting a query.
