# Weather Twin — a static web app that finds your city's weather match elsewhere in the world

## The problem / the fun

Given a city, find the other city on Earth whose weather right now is most similar,
same temperature range, similar humidity, similar wind, etc., and show it as a
"weather twin" with a % match. No practical necessity here, just a fun, self-contained
project to keep practicing vibe coding without any billing risk, since every API
involved is free with no key.

## Data sources

### 1. Open-Meteo Forecast API — current conditions

Free, no API key, no rate-limit risk for a hobby project (documented free-tier ceiling
is far beyond anything this app would ever hit). Endpoint:

```
https://api.open-meteo.com/v1/forecast
  ?latitude={lat1,lat2,...}&longitude={lon1,lon2,...}
  &current=temperature_2m,relative_humidity_2m,apparent_temperature,
           wind_speed_10m,cloud_cover,precipitation
  &daily=temperature_2m_max,temperature_2m_min
  &temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto
```

Supports comma-separated lists of coordinates in one request (batch mode) — returns
an array of results instead of a single object. This matters a lot for feasibility:
fetching weather for a candidate list of a few thousand cities can likely be done in
a small number of batched requests rather than one request per city. **Not verified
live** (this spec was written without live network access to api.open-meteo.com) —
first build step should confirm the batch request shape and response format work as
described against the real endpoint, and adjust if the docs at
https://open-meteo.com/en/docs have changed.

### 2. Open-Meteo Geocoding API — turning a typed city name into coordinates

```
https://geocoding-api.open-meteo.com/v1/search?name={query}&count=10&language=en
```

Used only for the "type your city" input (so the user doesn't have to know their own
lat/long) — free, no key, same caveat about verifying live before relying on it.

### 3. Candidate city list — a static, bundled dataset (not an API call)

Open-Meteo doesn't provide "give me N world cities" — we need our own list of
candidates to compare against. Use a free, public-domain dataset like GeoNames
(https://download.geonames.org/export/dump/, CC BY 4.0 — needs attribution in the
app's About/footer), filtered down to cities with population > 100,000 as a
starting point (roughly a few thousand cities — enough for interesting variety,
small enough to keep requests/response sizes reasonable). Store as a static JSON
file bundled with the app: `[{ name, country, lat, lon, population }, ...]`.

## Matching algorithm

Two stages, per the plan discussed:

1. **Filter.** Given the user's city's current high/low temperature, drop every
   candidate city outside a threshold (start with ±8°F on both high and low). If
   fewer than ~10 candidates survive (extreme weather day), progressively widen the
   threshold (±15°F, then ±25°F, etc.) until there's a reasonable shortlist to rank.
2. **Rank.** For the surviving shortlist, compute a weighted similarity score across:
   temperature high/low, "feels like" temperature, humidity, wind speed, and cloud
   cover. Suggested starting weights (tune later): temp high/low 40%, feels-like 20%,
   humidity 20%, wind speed 10%, cloud cover 10%. Normalize each feature (e.g.
   min-max or z-score across the shortlist) before applying weights so no single
   feature's raw scale dominates. Convert the final weighted distance into a 0–100%
   match score (closest = 100%). Return the single highest-scoring city (per v1
   scope) — exclude the user's own city/metro area from candidates.

## Architecture

Single static HTML/JS page, no backend, no build step, no API key anywhere:

- **index.html** — search input (city name) + result display area.
- **app.js** — on submit: call the Geocoding API for the typed city → get lat/lon →
  call the Forecast API for that city's current conditions → batch-call the Forecast
  API for the candidate shortlist (after the coarse filter) → run the weighted
  ranking → render the winning city, its country, and the % match.
- **cities.json** — the static candidate dataset described above, fetched once on
  page load.
- No `chrome.storage`, no options page, no service worker — this is a plain web page,
  not a browser extension. Deployable for free on GitHub Pages once it works locally.

## Build order

1. Get one real request working against the live Forecast API for a single city
   (e.g. Chicago) and confirm the actual response shape matches what's assumed above.
   Fix the request/parsing if the docs have changed.
2. Get the Geocoding API working: type a city name, get back a lat/lon.
3. Load `cities.json` (start with a small hand-written sample of ~20 diverse cities
   to build against before sourcing/trimming the full GeoNames dataset) and confirm
   the batch forecast request works for multiple coordinates at once.
4. Implement the two-stage filter + weighted ranking algorithm against the sample
   list; confirm it produces sane results for a few test cities (Chicago, Miami,
   Reykjavik).
5. Swap in the full trimmed GeoNames-derived candidate list.
6. Build the actual UI: input box, loading state, result card with city/country/%
   match, and a short "why this match" breakdown (e.g. "Temp: 34°F vs 36°F,
   Humidity: 61% vs 58%").
7. Deploy to GitHub Pages.

## Out of scope for v1

- No accounts, no saved history of past matches.
- No forecasted/future-day comparison — "now" only.
- No mobile app — web page only (works fine on mobile browsers as-is).
- No showing multiple ranked matches (single best match only, per v1 scope) —
  showing a ranked top 3–5 is a reasonable v2 idea if v1 feels too thin.

## Open questions to resolve during build

- Confirm the Forecast API's actual current/daily parameter names and batch-request
  response shape live (see note above — unverified at spec time).
- Decide the exact starting weights for the ranking formula empirically, by testing
  a handful of well-known city pairs and eyeballing whether the results feel right.
- Decide how large the final candidate list should be (a few thousand offers good
  variety but makes the API batch calls larger — may need to batch across multiple
  requests if there's a URL-length or coordinate-count limit on Open-Meteo's side).
