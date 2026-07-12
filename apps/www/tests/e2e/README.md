# E2E API tests — Newman

This directory hosts the Newman-based end-to-end harness that drives the
Postman collection at [`EduPlatform_Postman_Collection.json`](../../EduPlatform_Postman_Collection.json)
against a real Next.js + MongoDB stack.

## What the runner does

`scripts/e2e-runner.mjs`:

1. Boots an in-memory MongoDB replica set via `mongodb-memory-server` (a
   replica set is required because the center-registration service uses
   transactions).
2. Starts `next dev` on port 3000 with `MONGODB_URI`, `NEXTAUTH_SECRET`,
   `MAIL_PROVIDER=console`, and `E2E=1` wired into its environment.
3. Waits for `GET /api/v1/_ping` to return 200.
4. Runs Newman on the full Postman collection (or a single folder if
   `NEWMAN_FOLDER` is set).
5. Tears down the dev server and mongo replica set.

## Running

```bash
pnpm test:e2e                      # full suite
pnpm test:e2e:preflight            # just the preflight health-check folder
pnpm test:e2e:bail                 # stop at first failed assertion

# run one specific folder:
NEWMAN_FOLDER='1 — Center onboarding → Teacher → Course → Enrollment' \
  node scripts/e2e-runner.mjs

# point at a server you already started yourself:
NEWMAN_SKIP_SERVER=1 \
  node scripts/e2e-runner.mjs
```

A JSON report is written to `tests/e2e/reports/newman-report.json` after each
run.

## Environment variables

| Variable             | Default       | Meaning                                            |
|----------------------|---------------|----------------------------------------------------|
| `NEWMAN_PORT`        | `3000`        | Port the dev server listens on                     |
| `NEWMAN_FOLDER`      | *(unset)*     | Run only a single collection folder                |
| `NEWMAN_BAIL`        | *(unset)*     | If set (any value), abort on first failure        |
| `NEWMAN_REPORTERS`   | `cli,json`    | Comma list. `htmlextra` requires a separate install|
| `NEWMAN_SKIP_SERVER` | *(unset)*     | Use a pre-started server, don't manage mongo/next  |
| `NEWMAN_DEV_SERVER`  | *(unset)*     | `prod` switches to `next build && next start`     |
| `E2E`                | `1` (set by runner) | Enables `meta.inviteToken` leak in invite endpoints and an expired Set-Cookie on login so Newman's cookie jar doesn't merge tokens across roles |

## Dev-only response extras (gated by `E2E=1`)

Two endpoints leak data in non-production mode so the collection can chain
flows without reading an email inbox:

- `POST /api/v1/roster/teachers/invite` and
  `POST /api/v1/roster/students/invite` — include `meta.inviteToken` in the
  response, containing the plain invite token.
- `POST /api/v1/auth/login` — when `E2E=1`, the `Set-Cookie` header is set
  with `Max-Age=0` so Newman's cookie jar doesn't persist the session token.
  The token is still in the response body (`data.token`) and in the raw
  `Set-Cookie` header for the test script to capture. This prevents later
  admin requests from being silently downgraded to the most recently logged-in
  role (teacher/student) when both send the same cookie name to the same host.

## Known external prerequisites

- Node ≥ 20, `pnpm install` completed.
- Network access to the mongodb-memory-server binary cache (the binary is
  downloaded on first install; after that it's cached under
  `node_modules/.cache/mongodb-memory-server/`).
- Port 3000 free (override with `NEWMAN_PORT`).
