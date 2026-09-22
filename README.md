# Barnwide

An independent NHL fan site for team rosters, scores, schedules, standings, and
player statistics. Go serves the pages and API; vanilla JavaScript and locally
compiled Tailwind CSS provide the interface. Templates and assets are embedded
in the production binary.

## Run locally

Requires Go 1.25+ and Node.js 22+ with npm.

```sh
npm ci
make dev
```

Open http://localhost:8080. Development serves templates and assets from disk;
refresh after edits, and run `npm run build` after changing utility classes.
Go changes require rebuilding/restarting the server.

```sh
make build       # compile CSS and build the embedded binary
./hockey         # production-style local run
make ci          # build, Go race tests, vet, JS tests, whitespace validation
```

Generated `static/utilities.css` is checked in so Go-only release/container
builds contain the stylesheet. Regenerate it with `npm run build` when editing
frontend classes. `package-lock.json` pins build dependencies.

## Data reliability

- `/api/teams` is a stable 32-team catalog. Basic navigation and team identity
  do not depend on NHL availability.
- `/api/standings` uses the NHL's latest available standings and returns the
  season and effective date. Offseason standings are never presented as a new
  season's results.
- All upstream HTTP requests pass through one cache and limiter. Concurrent
  misses share a request. Game details are fetched once, then enriched locally.
- Cached data is served immediately. Expired fresh data triggers one bounded
  background refresh; the previous snapshot remains usable for up to seven days.
- HTTP 429/503 activates a cooldown honoring `Retry-After`. Failures are briefly
  suppressed; visitor requests do not sleep through exponential retries.
- Freshness: live schedules/game details 20 seconds, upcoming schedules two
  minutes, final games 24 hours, standings/player/team stats 15 minutes,
  rosters/prospects one hour. No roster is cached permanently.
- Rosters fetch one bulk club-statistics payload instead of one request per
  player. The statistics season is labeled. Missing statistics are dashes,
  while known zero values remain zero.
- Memory caching works without Redis. With `REDIS_ADDR`, versioned snapshots,
  request leases, an aggregate two-requests-per-second budget, and cooldowns
  are shared between replicas. Ownership-checked lease release prevents a
  previous fetch from deleting another worker's lock.
- Redis failures preserve local snapshots. Cold misses fail promptly when the
  configured shared cache is unavailable, avoiding a new upstream stampede.
- Successful responses expose `X-Data-Updated` and, when applicable,
  `X-Data-Stale`. The UI provides freshness notices and retry controls.
- Fetches have a six-second HTTP timeout and eight-second total fetch budget.
  Shared cache fills can finish after an individual visitor disconnects, but
  are bounded and reused by other readers. Direct request waits honor context
  cancellation. Browser requests time out after 12 seconds.

The retired `warm:queue`, `warm:scheduled`, and unversioned cache entries are
ignored. No startup sweep fetches every team's roster or prospects.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `REDIS_ADDR` | unset | Optional shared Redis server, `host:port` |
| `FRONTEND_DIST_DIR` | embedded | Development static directory (`static`) |
| `TEMPLATES_DIR` | embedded | Development HTML directory (`templates`) |
| `NHL_API_BASE_URL` | official NHL v1 URL | Local integration-test upstream override |

`API_RATE_LIMIT` and `WARMER_CONCURRENCY` from the old warmer are no longer used.
The conservative shared request budget is defined in `upstream.go`.

## Pages and API

Public pages: `/`, `/scores`, `/standings`, `/team/{abbrev}`,
`/team-schedule/{abbrev}`, `/player/{id}`, `/game/{id}`,
`/playoff-series/{season}/{letter}`, `/coach?team={abbrev}`, and
`/trivia?team={abbrev}`.

API endpoints: `/api/teams`, `/api/standings`, `/api/team/{abbrev}`,
`/api/roster/{abbrev}`, `/api/prospects/{abbrev}`, `/api/player/{id}`,
`/api/player-bio/{id}`, `/api/schedule/{date}`,
`/api/team-schedule/{abbrev}`, `/api/gamecenter/{id}/landing`,
`/api/playoff-bracket`, `/api/schedule/playoff-series/{season}/{letter}`,
`/api/team-news/{abbrev}`, `/api/team-transactions/{abbrev}`, `/api/videos/{id}`.

`/healthz` is a local application health endpoint, independent of NHL availability.
`/robots.txt`, `/sitemap.xml`, and `/llms.txt` describe the public site. Page
metadata and structured data are server-rendered. CSS and script URLs have
content-derived versions so browser caches cannot mix old and new assets.

## Tests

Go tests use local HTTP fixtures and an in-process Redis implementation; they
never require the NHL or production cluster. Coverage includes concurrent
requests, multiple replicas, cooldowns, stale recovery, canceled waits, empty
standings, bulk roster stats, metadata, routes, and invalid identifiers.

Node tests check JavaScript syntax, missing-vs-zero statistics, and score date
navigation races. Browser checks are recorded in `LOCAL-VALIDATION.md`.

## Design

`BRAND.md` describes the scorebook visual language. Main navigation is consistent
across pages; scores and player cards are real keyboard-accessible links.
Responsive layouts support narrow phones, and motion respects user preferences.

## Release

This work does not deploy or change cluster configuration. Existing GoReleaser
and ko workflows remain in place. Use Conventional Commits; pushes to `main`
can trigger the repository's release automation. Deployment health probes and
resource budgets remain a separate cluster-manifest task.

Data and team imagery are provided by the NHL. This project is not affiliated
with or endorsed by the NHL. See `LICENSE` for the project license.
