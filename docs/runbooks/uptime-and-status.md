# Runbook — Health checks, uptime monitoring & status page

## 1. The health endpoints

| App | URL | What it checks |
|---|---|---|
| www | `https://<www-domain>/api/health` | Database reachable within 8s |
| superadmin | `https://<superadmin-domain>/api/health` | Database reachable within 8s |

```json
{ "status": "ok", "db": "up", "rateLimiter": "shared", "time": "2026-08-02T00:00:00.000Z" }
```

**The status code is the signal**, not the body:

| Code | Meaning |
|---|---|
| `200` | Database answered. The app is serving. |
| `503` | Database unreachable or slow (>8s). `Retry-After: 30`. |

`HEAD` is supported and returns the same code with no body.

### Design decisions worth knowing before you change it

- **Only the database affects the status.** SMTP, Redis and the realtime server
  are *degradations*, not outages — including them would page someone at 3am
  because a mail relay hiccuped. If you add a dependency here, you are choosing
  to be woken up for it.
- **`rateLimiter` is reported but never affects the status code.** It is not a
  probe — nothing is dialled and it cannot hang or fail; it reports a flag the
  process already set while serving real traffic, so it does not breach the rule
  above. `"shared"` means limits are enforced in Redis, one budget across every
  instance. `"local"` means per-process memory: each instance holds its OWN
  budget and each starts it full, so N instances multiply an attacker's login
  allowance by N — the exact weakness the shared store exists to close.
  `"local"` means either REDIS_URL is unset (normal on a laptop, a
  **misconfiguration** in a deployment) or Redis is down and the limiter's
  circuit breaker has opened. **Alert on `"local"` in production; expect it in
  dev.** It deliberately does not return 503: pulling instances out of rotation
  because Redis is down turns a degradation into an outage, and during a Redis
  outage it would do so to every instance at once.
- **It is bounded at 8 seconds, and that number was measured.** An unreachable
  database usually *hangs* rather than refusing fast, so without a timeout the
  health check would hang exactly when it matters and the monitor would report a
  generic timeout instead of a clean 503.
  The bound started at 3s and produced a **false 503 on a Neon cold start**
  (scale-to-zero branches suspend when idle; observed 2026-08-02). Warm requests
  answer in 96–550ms. Since the database is idle at exactly the hours nobody is
  watching, a tight bound would have paged someone for a non-outage. Do not
  lower it without re-measuring a cold start.
- **It leaks nothing** — no version, no commit, no environment, no error text.
  It is unauthenticated and internet-facing. Driver errors go to the server log.
- **It is never cached** (`Cache-Control: no-store`, `dynamic = "force-dynamic"`).
- **The ERP service's `GET` is rate-limited per client IP** (60 requests a
  minute, `packages/server-core/src/http/health-route.ts`; answers 429 with
  `retry-after: 60`). One monitor polling each minute from a few regions is far
  below it; a monitor that hammers it, or many monitors behind one address, will
  see 429 and report an outage that is not happening. `HEAD` is not limited, and
  neither is the back-office service's health route.

> The older `/api/v1/_ping` in www returns **200 even when the database is
> unreachable** (it reports `db: "unreachable"` in the JSON body, which no
> uptime service reads). Do not point a monitor at it. It is left in place
> because other things may call it.

---

## 2. External uptime monitoring

**Why external:** a monitor running on the same infrastructure as the app cannot
report that the infrastructure is down.

Recommended: **Better Stack** (free tier covers this: 10 monitors, 3-minute
checks, a hosted status page, and phone/SMS escalation). UptimeRobot is a fine
alternative but its free tier has no hosted status page with custom domain.

### Monitors to create

| Name | URL | Interval | Alert after |
|---|---|---|---|
| Edura — app | `https://<www-domain>/api/health` | 1–3 min | 2 consecutive failures |
| Edura — back office | `https://<superadmin-domain>/api/health` | 5 min | 2 consecutive failures |
| Edura — realtime | `https://<realtime-domain>/healthz` | 5 min | 3 consecutive failures |
| Edura — landing | `https://<www-domain>/` | 5 min | 2 consecutive failures |

Configure each with:

- **Expect HTTP 200**, and additionally **expect the body to contain `"db":"up"`**
  (the realtime monitor expects `"ok":true` instead — `/healthz` reports no
  database state).
  The keyword check is what catches a proxy or CDN returning a cached/placeholder
  200 while the app behind it is dead.
- **Request timeout 15s.** It MUST exceed the endpoint's own 8s bound, or the
  monitor times out first and you lose the clean 503 the endpoint was about to
  give you.
- **Regions: at least two**, one of them in Europe — closest to both the Neon
  `eu-central-1` region and the Egyptian user base. A single-region monitor
  turns one flaky network path into a false page.
- **Alert after 2 consecutive failures**, not 1. A single missed check is nearly
  always the monitor's network, and an alert channel people learn to ignore is
  worse than none.

### The rate-limiter monitor — a SEPARATE monitor, on purpose

`/api/health` reports `"rateLimiter": "local"` when login limits have stopped
being shared across instances (Redis down, or `REDIS_URL` unset in a
deployment). Each instance then holds its own budget and each starts it full, so
N instances multiply an attacker's login allowance by N.

| Name | URL | Interval | Alert after |
|---|---|---|---|
| Edura — rate limiter | `https://edura-www.vercel.app/api/health` | 5 min | 3 consecutive failures |

- **Expect HTTP 200 AND the body to NOT contain `"rateLimiter":"local"`.**
  (Better Stack: *Should not contain*. UptimeRobot: an inverted keyword check.)
- **Email only. No SMS, no phone.** This is a security *degradation*, not an
  outage — the app is serving normally throughout.
- **Do NOT attach it to a status-page component.** No user-facing thing is down;
  saying otherwise on the public page is a lie in the expensive direction.
- **3 consecutive failures, not 2.** The limiter's circuit breaker retries every
  30s, so a brief Redis blip can show `local` for one check and clear itself. At
  a 5-minute interval, three in a row means ~15 minutes of genuinely unshared
  limits, which is worth a human.

**Why not just add the keyword to the existing "Edura — app" monitor?** Because
that monitor drives the *Platform* component on the public status page and is on
phone escalation. Folding this in would tell users the platform is down while it
is serving perfectly, and would wake someone for a condition the code
deliberately keeps out of the status code for exactly that reason (see
`packages/server-core/src/http/health.ts`, rule 2).

The back office runs the same limiter and can take an identical monitor against
`https://<superadmin-domain>/api/health` if you want the coverage; the www one
is the security-critical path, because that is where public login lives.

Creating it via the Better Stack API (`keyword_absence` alerts when the keyword
IS present, which is the inversion this needs — the monitor is UP while the
string is absent). Export your own token; never commit one:

```bash
curl -X POST https://uptime.betterstack.com/api/v2/monitors \
  -H "Authorization: Bearer $BETTERSTACK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "monitor_type": "keyword_absence",
    "url": "https://edura-www.vercel.app/api/health",
    "required_keyword": "\"rateLimiter\":\"local\"",
    "pronounceable_name": "Edura — rate limiter",
    "check_frequency": 300,
    "confirmation_period": 900,
    "request_timeout": 15,
    "email": true,
    "sms": false,
    "call": false
  }'
```

**Confirm the FIELD EXISTS before trusting the monitor.** This is the trap:
`keyword_absence` goes green whenever the string is missing, and it is missing
on any build that predates the field — so a deployment running older code makes
this monitor **vacuously green**, reporting "limits are shared" about a build
that cannot say either way. Checked on 2026-08-03, production was in exactly
that state: `https://edura-www.vercel.app/api/health` answered
`{"status":"ok","db":"up","time":...}` with no `rateLimiter` at all.

So the first-run check is not "is it UP" but:

```bash
curl -s https://edura-www.vercel.app/api/health | grep -q '"rateLimiter":"shared"' \
  && echo "field present — monitor is meaningful" \
  || echo "NOT DEPLOYED YET — this monitor would be green for the wrong reason"
```

Only create the monitor once that prints the first line. After that, a DOWN
reading means what it says. If it reads DOWN while the field says `shared`, the
keyword sense is inverted — swap `keyword_absence` for `keyword`.

The exact substring matters: the endpoint serialises with no spaces, so
`"rateLimiter":"local"` matches and `"rateLimiter": "local"` does not.

> **Domain.** `edura-www.vercel.app` is what is actually serving
> (`APP_BASE_URL`). `app.edura.eg` (`APP_ORIGIN`/`APP_INTERNAL_URL`) does not
> resolve yet — the custom domain is still outstanding for launch. Re-point every
> monitor in this runbook when it lands.

### Escalation

- Email → always.
- SMS/phone → **app** and **back office** monitors only, and only outside a
  maintenance window. Do not put the realtime monitor on phone escalation: chat
  being down is not worth waking someone.

### Deploy drift — a CI check, not an uptime monitor

`/api/health` cannot answer "is production serving main?" — rule 4 is that it
leaks nothing, and the deployed commit SHA is exactly the kind of thing that
rule exists to keep off an unauthenticated endpoint. So this one lives in CI:
`.github/workflows/deploy-drift.yml`, every 3 hours, comparing `origin/main`
against the latest READY production deployment on Vercel.

It exists because on 2026-08-03 main sat **8.5 hours** ahead of production and
nothing said so. CI was red on the DB suites and `deploy.yml` is gated on a
successful CI run, so it correctly refused to ship — and then the day went on.
The gate worked; the silence is what failed. A refusal nobody hears is
indistinguishable from a deploy that happened.

- **90-minute grace.** A deploy in flight, or CI still running, is not drift.
  Raise it if it ever cries wolf during a normal deploy; do NOT raise it to
  silence a real backlog.
- **The commit SHA is preferred but not required.** Vercel documents `meta` only
  as "metadata from the Git provider" and these deploys come from `vercel deploy`
  in CI rather than a git integration, so a SHA may not be attached. When it is,
  the comparison is exact; when it is not, deployment `createdAt` vs the commit
  date is the fallback. Both are covered by the self-test.
- **It proves its own logic before trusting its verdict** — the workflow runs
  `--self-test` (9 cases, including the exact 2026-08-03 state) as a separate
  step first. A decision function nobody has exercised is not a monitor.
- **When it goes red**, the cause is almost always upstream: CI red on main, or
  the deploy job failing. Check the Actions tab filtered to `branch:main`.

---

## 3. Public status page

Better Stack's hosted status page, on a subdomain (`status.<domain>`).

**Host it on a domain whose DNS/hosting is independent of the app.** A status
page served from the infrastructure that is down tells nobody anything. Better
Stack hosts it on their infrastructure by default — keep it that way and just
point a CNAME at it.

Components to expose (user-facing language, in Arabic and English):

| Component | Backed by |
|---|---|
| المنصة / Platform | www health monitor |
| المحادثات / Chat | realtime health monitor |
| المدفوعات / Payments | www health + a manual toggle for Paymob incidents |
| لوحة الإدارة / Back office | superadmin health monitor |

Keep **Payments** manually togglable: Paymob can be down while our own health
check is perfectly green, and that is precisely the incident a center owner
needs to see before they phone support.

> **Footer link.** Linking the status page from the site footer belongs to the
> post-merge glue list — the footer is owned by another workstream in this
> round. See the report's post-merge notes.

---

## 4. Verifying the endpoint

```bash
curl -i https://<www-domain>/api/health
```

Locally:

```bash
curl -i http://localhost:3002/api/health
```

Both paths were exercised on 2026-08-02:

- **healthy** → `200`, `{"status":"ok","db":"up","rateLimiter":"shared",...}`, `Cache-Control: no-store`,
  96–550 ms warm (both apps)
- **database refused** (bogus host) → `503`, `{"status":"degraded","db":"down",...}`,
  `Retry-After: 30`, in 55 ms, with no driver error in the body
- **database blackholed** (packets dropped) → `503` at the timeout bound rather
  than hanging
- **Neon cold start** → this is what a 3s bound got wrong. Re-check after any
  change to `DB_TIMEOUT_MS` by leaving the branch idle, then curling once.
