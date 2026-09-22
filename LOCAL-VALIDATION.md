# Local validation — 2026-09-22

## Implemented

- Stable 32-team directory and team identity work without upstream standings.
- Standings use the NHL latest-available endpoint, with explicit season and as-of date; no historical-date scan.
- One bounded cache-first transport coalesces requests, retains last-good snapshots, applies Retry-After cooldowns, and supports Redis snapshots, shared budgets, and ownership-safe leases.
- Finite roster caching and one bulk statistics request replace player-by-player enrichment. Missing statistics remain dashes, real zeroes remain zeroes.
- Schedule/game requests reuse cached raw payloads. Score polling is visibility/state aware and cannot overwrite a newer selected date with an older response.
- Shared typography, restrained ink/white/red palette, compact directory and scoreboard, local Tailwind build, content-hashed assets, semantic links, keyboard focus, retry and freshness states.
- Standings use official ranks. Critical live games at zero seconds remain live until the NHL declares them final.

## Verification

`make ci`: production Go build, Go race tests, go vet, frontend script/behavior tests, and git diff whitespace checks.

Go fixtures cover concurrent cold misses, stale refresh/recovery, throttling/cooldown, invalid responses, canceled callers, live TTLs, empty standings, single-fetch handlers, bulk roster statistics, Redis cross-client reuse and lock ownership. Public-page tests cover all ten page templates, metadata, sitemap, static assets and invalid-route 404s.

Browser checks against the local Go server included the home directory, scores, standings, team roster, player and game pages. Real NHL data rendered: 32 teams, September 22 preseason fixtures, 2025–2026 standings through April 17, and Sebastian Aho's 79 games / 80 points. Checked 360×616 mobile and 1920×1080 desktop layouts, team/player search, empty results, division filter, mobile details dialog and Escape dismissal. Team and score cards expose real links.

## Scope and limits

No deployment or Kubernetes changes. The audit's release reconciliation, probes and resource configuration remain deployment work. No live game was in progress; live-state and polling edge cases use fixtures. External NHL throttling can still prevent a first-ever uncached resource from loading; it now returns a bounded recoverable unavailable state, while navigation and available snapshots remain usable. Redis is optional locally and required for cache persistence/shared limits across processes.
