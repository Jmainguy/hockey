# Barnwide

Domain: `barnwide.com`. Brand name: **Barnwide**.

A compact hockey scorebook for fans checking tonight's games, finding a team,
and reading player statistics. Independent fan project; not an NHL affiliate.

## Visual concept

Fresh rink ice: white surfaces, pale blue lines, slate typography, and a metallic
arena monogram. Information comes first. Logos identify teams; decoration
never competes with scores.

- Ice white `#f7fafc`, paper `#ffffff`, slate ink `#304b5c`, muted `#586f7e`.
- Rink blue `#316e8c` for selected states, pale blue `#eaf4f9` for panels; red reserved for live status.
- System sans-serif for familiar, quick reading; tabular numerals for stats.
- Compact masthead, left-aligned page titles, fine borders, modest 6px corners.
- No gradient banners, emoji headings, glass effects, floating cards, or glows.
- Strong visible focus, 44px touch controls, readable mobile tables.
- Honest season/date labels. Missing statistics use an em dash glyph, never a
  fabricated zero. Cached data stays usable; freshness diagnostics stay in console logs.

Core navigation: Teams, Scores, Standings. Team pages add Schedule, Coach, Trivia.
Use real NHL team logos. The masthead uses the approved metallic BW arena logo with plain Barnwide text. Favicons use the arena symbol alone. Masters: `design/logo/barnwide-mark-hd-v5.png` and `design/logo/barnwide-wordmark-hd-v1.png`. The generated wordmark is retained as a design asset, not used in the navigation. Web derivatives: `static/barnwide-mark.png` and `static/barnwide-wordmark.png`.

Keep page copy minimal: no slogans, decorative counts, repeated navigation, or routine success banners. Preserve useful empty states, season context, and meaningful unavailable states. Do not show fetch timestamps or retry buttons.
