// Step 1: confirm the Open-Meteo Forecast API request/response shape for a single city.
//
// NOTE (unverified-live caveat): this request shape was written against Open-Meteo's
// documented API (https://open-meteo.com/en/docs) but could not be tested against the
// live endpoint from the build sandbox — outbound network access to open-meteo.com was
// blocked by the sandbox's egress policy. This is a client-side static page, so the
// actual fetch() below runs in the end user's browser, not the sandbox, and should work
// fine there. First thing to check when opening this page for real: does #output show
// real numbers, or an error? If the shape has changed, adjust CURRENT_PARAMS / the
// parsing below to match.

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const CURRENT_PARAMS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "wind_speed_10m",
  "cloud_cover",
  "precipitation",
].join(",");

const DAILY_PARAMS = ["temperature_2m_max", "temperature_2m_min"].join(",");

async function fetchCurrentConditions(lat, lon) {
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set("current", CURRENT_PARAMS);
  url.searchParams.set("daily", DAILY_PARAMS);
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Forecast API returned ${res.status}`);
  }
  return res.json();
}

async function main() {
  const output = document.getElementById("output");
  try {
    // Chicago, IL
    const data = await fetchCurrentConditions(41.85, -87.65);

    if (!data.current || !data.daily) {
      throw new Error(
        "Response is missing 'current' or 'daily' — API shape has changed, see app.js CURRENT_PARAMS/DAILY_PARAMS."
      );
    }

    output.textContent = JSON.stringify(data, null, 2);
    console.log("Open-Meteo forecast response:", data);
  } catch (err) {
    output.textContent = `Error: ${err.message}`;
    console.error(err);
  }
}

main();
