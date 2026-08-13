# weather-twin

Static web app (plain HTML/JS, no backend, no API key, no build step) that finds
the city whose current weather most closely matches a chosen city's. Read
`PROJECT_SPEC.md` before writing any code — it's the source of truth for data
sources, the matching algorithm, and the build order. Follow the build order in
sequence rather than jumping to the UI before the data pipeline is confirmed working.

## Non-negotiables from the spec

- No API key, no backend, no build tooling. It's a plain static page deployable
  as-is to GitHub Pages.
- v1 shows a single best-match city only, not a ranked list.
- The Open-Meteo Forecast/Geocoding API request shapes in the spec were written
  without live network access and are explicitly unverified — confirm the real
  request/response shape against https://open-meteo.com/en/docs first, and fix
  the spec's assumptions in code (and leave a note) if anything's changed.
- Matching is two-stage: a coarse temperature-based filter to shortlist candidates,
  then a weighted score across temp/feels-like/humidity/wind/cloud cover to rank
  the shortlist. If the temperature filter returns too few candidates (extreme
  weather day), widen the threshold progressively rather than showing no result.

## Working conventions for this session

- Commit incrementally after each build-order step, with clear messages.
- If something can't be verified (e.g. no real candidate city dataset sourced
  yet), stub it clearly — e.g. build and test against a small hand-written list
  of ~20 cities first, per the spec's step 3 — and leave a TODO rather than
  stalling on it.
- Leave a status note in `README.md` at the end of the session: what's done,
  what's stubbed/unverified, what to check first next session.
