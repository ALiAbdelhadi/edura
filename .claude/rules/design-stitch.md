---
paths:
  - "apps/*/src/**/*.tsx"
  - "packages/ui/**"
  - "**/*.css"
---

## Stitch MCP design workflow (binding)

The Stitch MCP server is DISABLED since 2026-09-27 (never used; token cost). To
use it again: `claude mcp add-json stitch "$(cat ~/.claude/mcp-disabled/stitch.json)" -s user`.
The rules below apply whenever a Stitch design is implemented.

1. Read the Stitch design, then implement it faithfully in the existing UI.
2. Additive only: never delete or break an existing feature, screen or route; if a design seems to replace something, STOP and ask.
3. Never weaken security fixes, the money engine, auth/sessions, RLS, or the assistant delegation boundary — UI stays on the presentation layer.
4. A schema change needs a presented plan (exact change + migration) and approval before touching the DB.
5. One design system: @repo/ui components, Tailwind v4 tokens, RTL/Arabic support.
