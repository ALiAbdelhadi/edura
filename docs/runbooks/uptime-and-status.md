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
- **It is not rate-limited.** A monitor polls every minute from rotating IPs; a
  throttled health check reports outages that are not happening.

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
| Edura — realtime | `https://<realtime-domain>/health` | 5 min | 3 consecutive failures |
| Edura — landing | `https://<www-domain>/` | 5 min | 2 consecutive failures |

Configure each with:

- **Expect HTTP 200**, and additionally **expect the body to contain `"db":"up"`**.
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

### Escalation

- Email → always.
- SMS/phone → **app** and **back office** monitors only, and only outside a
  maintenance window. Do not put the realtime monitor on phone escalation: chat
  being down is not worth waking someone.

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
