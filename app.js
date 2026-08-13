// Weather Twin — app logic.
//
// NOTE (unverified-live caveat, still open as of this session): the Open-Meteo request
// shapes below were built against the documented API (https://open-meteo.com/en/docs)
// but could not be tested against the live endpoints from the build sandbox — outbound
// network access to open-meteo.com was blocked by the sandbox's egress policy. This is a
// client-side static page, so the fetch() calls below run in the end user's browser, not
// the sandbox, and should work there. First thing to check when opening this page for
// real: does a search actually return a result, or an error? See README.md.

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

const CURRENT_PARAMS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "wind_speed_10m",
  "cloud_cover",
  "precipitation",
].join(",");

const DAILY_PARAMS = ["temperature_2m_max", "temperature_2m_min"].join(",");

async function geocodeCity(name) {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set("name", name);
  url.searchParams.set("count", "10");
  url.searchParams.set("language", "en");

  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`Geocoding API returned ${res.status}`);
  }
  const data = await res.json();

  // Documented shape: { results: [ { name, latitude, longitude, country, admin1, ... } ] }
  // When there are zero matches, Open-Meteo omits the "results" key entirely rather than
  // returning an empty array.
  if (!data.results || data.results.length === 0) {
    return [];
  }
  return data.results;
}

async function fetchCurrentConditions(lat, lon) {
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set("current", CURRENT_PARAMS);
  url.searchParams.set("daily", DAILY_PARAMS);
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("timezone", "auto");

  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`Forecast API returned ${res.status}`);
  }
  const data = await res.json();
  if (!data.current || !data.daily) {
    throw new Error("Forecast response is missing 'current' or 'daily' — API shape may have changed.");
  }
  return data;
}

// Batch mode: Open-Meteo returns a JSON array (one entry per input coordinate, in the
// same order) when latitude/longitude are given as comma-separated lists.
//
// A single request built from the full ~6,000-city candidate list produces a URL over
// 100,000 characters long, which fails with a generic network-level error (not a clean
// HTTP status) rather than a useful one — most servers cap GET request URLs well under
// that. Split into chunks instead of one giant request.
//
// Open-Meteo's free/no-key tier also rate-limits (HTTP 429) if too many chunk requests
// fire at once — a first attempt at 6 concurrent 100-city requests tripped it partway
// through. Fixed by: lower concurrency, larger-but-still-safe chunks (fewer requests
// overall), and retrying 429s with backoff instead of failing immediately.
const BATCH_CHUNK_SIZE = 200;
const BATCH_CONCURRENCY = 2;
const MAX_RETRIES = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Shared retry-on-429 wrapper. Open-Meteo's free/no-key tier rate-limits under
// sustained testing/usage — every request path (geocoding, single-city, batch) needs
// this, not just the batch one, since a plain single request can get 429'd too once
// the window's exhausted.
async function fetchWithRetry(url, attempt = 1) {
  const res = await fetch(url);
  if (res.status === 429 && attempt <= MAX_RETRIES) {
    const retryAfterHeader = res.headers.get("Retry-After");
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
    const backoffMs = retryAfterMs || Math.min(1000 * 2 ** (attempt - 1), 8000);
    await sleep(backoffMs);
    return fetchWithRetry(url, attempt + 1);
  }
  return res;
}

async function fetchWeatherChunk(chunk) {
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", chunk.map((c) => c.lat).join(","));
  url.searchParams.set("longitude", chunk.map((c) => c.lon).join(","));
  url.searchParams.set("current", CURRENT_PARAMS);
  url.searchParams.set("daily", DAILY_PARAMS);
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("timezone", "auto");

  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`Forecast API (batch) returned ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("Expected an array for a multi-coordinate batch request — API shape may have changed.");
  }
  if (data.length !== chunk.length) {
    throw new Error(`Batch response length (${data.length}) doesn't match request (${chunk.length}).`);
  }
  return data.map((result, i) => ({ ...chunk[i], weather: result }));
}

// Workers pull chunks off a shared queue. On a permanent (non-retryable-exhausted)
// failure, we record the error and stop handing out new work, but let already-in-flight
// workers finish their current chunk cleanly rather than racing a thrown error against
// other workers' progress callbacks (which previously could overwrite the error message
// with stale progress text, making a real failure look like it was just "stuck").
async function fetchBatchConditions(cities, onProgress) {
  const chunks = [];
  for (let i = 0; i < cities.length; i += BATCH_CHUNK_SIZE) {
    chunks.push(cities.slice(i, i + BATCH_CHUNK_SIZE));
  }

  const results = new Array(cities.length);
  let nextChunkIndex = 0;
  let done = 0;
  let firstError = null;

  async function worker() {
    while (nextChunkIndex < chunks.length && !firstError) {
      const myIndex = nextChunkIndex++;
      const chunk = chunks[myIndex];
      try {
        const chunkResults = await fetchWeatherChunk(chunk);
        const offset = myIndex * BATCH_CHUNK_SIZE;
        for (let i = 0; i < chunkResults.length; i++) {
          results[offset + i] = chunkResults[i];
        }
        done += chunk.length;
        if (onProgress) onProgress(done, cities.length);
      } catch (err) {
        if (!firstError) firstError = err;
      }
    }
  }

  const workerCount = Math.min(BATCH_CONCURRENCY, chunks.length) || 1;
  await Promise.all(Array.from({ length: workerCount }, worker));

  if (firstError) throw firstError;
  return results;
}

async function loadCandidateCities() {
  const res = await fetch("cities.json");
  if (!res.ok) {
    throw new Error(`Failed to load cities.json: ${res.status}`);
  }
  return res.json();
}

const BREAKDOWN_LABELS = {
  tempHigh: { label: "High", unit: "°F" },
  tempLow: { label: "Low", unit: "°F" },
  feelsLike: { label: "Feels like", unit: "°F" },
  humidity: { label: "Humidity", unit: "%" },
  windSpeed: { label: "Wind", unit: " mph" },
  cloudCover: { label: "Cloud cover", unit: "%" },
};

function renderBreakdown(breakdown) {
  const list = document.getElementById("result-breakdown");
  list.innerHTML = "";
  for (const key of WeatherTwin.FEATURE_KEYS) {
    const { label, unit } = BREAKDOWN_LABELS[key];
    const { target, candidate } = breakdown[key];
    const li = document.createElement("li");
    li.textContent = `${label}: ${Math.round(target)}${unit} vs ${Math.round(candidate)}${unit}`;
    list.appendChild(li);
  }
}

function setStatus(message, isError = false) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.hidden = !message;
  status.classList.toggle("error", isError);
}

function setLoading(isLoading) {
  document.getElementById("city-input").disabled = isLoading;
  document.querySelector("#search-form button").disabled = isLoading;
}

async function handleSearch(cityName) {
  const resultEl = document.getElementById("result");
  resultEl.hidden = true;
  setLoading(true);

  try {
    setStatus("Looking up city...");
    const matches = await geocodeCity(cityName);
    if (matches.length === 0) {
      setStatus(`No matches found for "${cityName}".`, true);
      return;
    }
    const target = matches[0];

    setStatus(`Fetching current weather for ${target.name}, ${target.country}...`);
    const targetWeather = await fetchCurrentConditions(target.latitude, target.longitude);

    setStatus("Loading candidate cities...");
    const candidates = await loadCandidateCities();

    setStatus(`Checking weather in ${candidates.length} candidate cities...`);
    const candidatesWithWeather = await fetchBatchConditions(candidates, (done, total) => {
      setStatus(`Checking weather in ${total} candidate cities... (${done}/${total})`);
    });

    const { best, thresholdUsed } = WeatherTwin.findBestMatch(
      { name: target.name, country: target.country },
      targetWeather,
      candidatesWithWeather
    );

    if (!best) {
      setStatus("No candidates survived the temperature filter — try a different city.", true);
      return;
    }

    document.getElementById("result-source-city").textContent = `${target.name}, ${target.country}`;
    document.getElementById("result-city").textContent = `${best.name}, ${best.country}`;
    document.getElementById("result-match").textContent = `${best.matchPct}% match`;
    renderBreakdown(best.breakdown);
    resultEl.hidden = false;

    setStatus("");
    console.log("Match debug info:", { thresholdUsed, best });
  } catch (err) {
    setStatus(`Error: ${err.message}`, true);
    console.error(err);
  } finally {
    setLoading(false);
  }
}

function main() {
  const form = document.getElementById("search-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const cityName = document.getElementById("city-input").value.trim();
    if (cityName) {
      handleSearch(cityName);
    }
  });
}

main();
