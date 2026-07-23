# Edura API — Bruno collection

A git-friendly API collection **generated from the actual route handlers** — one
request per exported HTTP method across `app/api/**`. Plain-text `.bru` files, so
it diffs and reviews in PRs (unlike a giant Postman JSON blob).

## Regenerate (don't hand-edit the request files)

```bash
pnpm gen:bruno
```

Re-run whenever routes change — `scripts/gen-bruno.mjs` re-derives every request
(method, URL, `:id` params, and a JSON body stub pulled from each route's inline
`z.object({…})`). Hand edits to the generated `.bru` files are overwritten.

## Use it

1. Install [Bruno](https://www.usebruno.com/) and open this `bruno/` folder as a collection.
2. Start the app: `pnpm dev` (serves on `:3002` — matches the `Local` env `baseUrl`).
3. Select the **Local** environment (top-right).
4. Run **`_auth/Login`** first. It authenticates as the seeded super-admin
   (`superadmin@edura.eg` / dev seed password — see `docs/guides/test-credentials.md` (repo root))
   and seeds the session cookie (Bruno's cookie jar) + a `token` env var. Every
   other request then rides that session.
5. For requests with `{{id}}`-style body/URL vars, set the value in the env or
   inline before sending.

## Layout

```
bruno/
├── bruno.json            # collection config
├── environments/Local.bru  # baseUrl + seed creds + captured token
├── _auth/Login.bru       # run first — seeds the session
└── v1/<domain>/…/<METHOD>.bru   # 200 requests mirroring /api/v1/**
```

Auth model: next-auth **session cookie**. Login sets it; Bruno's cookie jar
replays it. The returned bearer `token` is also captured to the `token` env var
for clients that prefer `Authorization: Bearer {{token}}`.
