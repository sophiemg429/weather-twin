# weather-twin

Given a city, find the other city on Earth whose current weather is the closest match —
"weather twin" with a % match score. Static HTML/JS, no backend, no API key, no build
step (see `PROJECT_SPEC.md` for the full design, `CLAUDE.md` for session conventions).

## Status (end of session — 2026-08-13)

### Done — build order steps 1-6 complete
- Single-city Forecast API fetch, Geocoding API lookup, batch Forecast API fetch for a
  candidate list, two-stage filter + weighted ranking algorithm, and the full search UI.
- `matching.js` (the ranking algorithm) is pure/dependency-free and covered by
  `test/matching.smoke.js`, run with hand-picked plausible weather values since live API
  data wasn't reachable this session (see below). Results are sane: Chicago → Toronto,
  Miami → Mumbai, Reykjavik → Sydney (Southern Hemisphere winter).
- The full app flow (search → geocode → fetch → rank → render) was verified end-to-end
  in a real headless-Chromium run with mocked Open-Meteo responses — confirmed the DOM
  wiring, loading state, and result rendering all work correctly.

### Stubbed / unverified — check these first next session

1. **Live Open-Meteo API calls are unverified.** This build sandbox's network egress
   policy blocks `api.open-meteo.com`, `geocoding-api.open-meteo.com`, and
   `open-meteo.com` outright (confirmed via both `curl` and `WebFetch` — 403 from the
   sandbox's proxy). Since this is a client-side static page, the actual `fetch()` calls
   in `app.js` run in the *end user's* browser, not this sandbox, so the app should work
   once it's actually opened — but that has **not** been confirmed against the real API.
   **Do this first:** open `index.html` (or the deployed URL, see below) in a real
   browser and do a search. If the response shape doesn't match what `app.js` assumes
   (`CURRENT_PARAMS` / `DAILY_PARAMS` / the geocoding `results` shape), fix the parsing
   there — it's flagged inline with comments at each fetch call.
2. **`cities.json` is still the ~20-city hand-written stub**, not the full
   GeoNames-derived dataset called for in spec step 5. `download.geonames.org` is
   blocked by the same sandbox policy as above. TODO: from a network-unrestricted
   environment, pull `cities15000.txt` (or similar) from
   https://download.geonames.org/export/dump/, filter to population > 100,000, convert
   to `[{ name, country, lat, lon, population }, ...]`, and swap it in for `cities.json`.
   Remember the CC BY 4.0 attribution requirement in the footer once real GeoNames data
   is in use.
3. **Ranking weights are the spec's suggested starting point**, not yet tuned against
   real-world results (temp high/low 40% split, feels-like 20%, humidity 20%, wind 10%,
   cloud cover 10% — see `matching.js` `WEIGHTS`). The spec calls out tuning these
   empirically as an open question once live data is flowing.
4. **Own-city exclusion is a simple name+country string match** (`findBestMatch` in
   `matching.js`) — doesn't handle a future full candidate list containing a separate
   entry for a suburb of the same metro area.
5. **Not yet deployed to GitHub Pages** (spec step 7). Left undone since flipping a repo
   setting felt outside the scope of "build v1 locally and commit" for this session —
   deploy instructions below.

### Next session checklist
1. Open the app in a real browser and do a live search; fix any API shape mismatches.
2. Source and swap in the real GeoNames candidate list (see TODO #2 above).
3. Tune ranking weights empirically against a few well-known city pairs.
4. Deploy: repo Settings → Pages → deploy from the default branch, `/` root — no build
   step needed, it's already a static site.

## Architecture
- `index.html` / `style.css` — search UI and result card.
- `app.js` — Open-Meteo geocoding + forecast fetch calls, orchestration, DOM rendering.
- `matching.js` — pure two-stage filter/ranking algorithm; no DOM or fetch dependency,
  so it runs both in the browser (`<script>` global `WeatherTwin`) and under Node.
- `cities.json` — candidate city list (currently the 20-city stub, see TODO #2).
- `test/matching.smoke.js` — Node smoke test for the ranking algorithm:
  `node test/matching.smoke.js`.

## Data attribution

Candidate city data (`cities.json`) is derived from the GeoNames geographical database (https://www.geonames.org), licensed under CC BY 4.0, filtered to cities with population > 100,000. Generated via `scripts/build_cities.py`.
