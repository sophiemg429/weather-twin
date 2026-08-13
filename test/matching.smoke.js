// Manual smoke test for matching.js, run with: node test/matching.smoke.js
//
// Uses hand-picked, plausible-for-August weather values (NOT live API data — the build
// sandbox can't reach open-meteo.com, see README.md) to sanity-check that the ranking
// algorithm produces sensible results, per the spec's step 4: "confirm it produces sane
// results for a few test cities (Chicago, Miami, Reykjavik)."

const WeatherTwin = require("../matching.js");

function weather({ high, low, feelsLike, humidity, wind, cloud }) {
  return {
    current: {
      apparent_temperature: feelsLike,
      relative_humidity_2m: humidity,
      wind_speed_10m: wind,
      cloud_cover: cloud,
    },
    daily: {
      temperature_2m_max: [high],
      temperature_2m_min: [low],
    },
  };
}

const pool = {
  Chicago: { country: "United States", weather: weather({ high: 84, low: 68, feelsLike: 86, humidity: 55, wind: 8, cloud: 30 }) },
  Miami: { country: "United States", weather: weather({ high: 90, low: 79, feelsLike: 96, humidity: 70, wind: 10, cloud: 50 }) },
  Reykjavik: { country: "Iceland", weather: weather({ high: 56, low: 47, feelsLike: 52, humidity: 75, wind: 15, cloud: 80 }) },
  Toronto: { country: "Canada", weather: weather({ high: 81, low: 65, feelsLike: 82, humidity: 58, wind: 9, cloud: 35 }) },
  Rome: { country: "Italy", weather: weather({ high: 88, low: 68, feelsLike: 90, humidity: 45, wind: 7, cloud: 15 }) },
  London: { country: "United Kingdom", weather: weather({ high: 72, low: 58, feelsLike: 70, humidity: 65, wind: 12, cloud: 60 }) },
  Dubai: { country: "United Arab Emirates", weather: weather({ high: 104, low: 88, feelsLike: 110, humidity: 55, wind: 12, cloud: 10 }) },
  Cairo: { country: "Egypt", weather: weather({ high: 97, low: 75, feelsLike: 95, humidity: 30, wind: 10, cloud: 5 }) },
  Sydney: { country: "Australia", weather: weather({ high: 63, low: 48, feelsLike: 60, humidity: 60, wind: 12, cloud: 50 }) },
  Mumbai: { country: "India", weather: weather({ high: 89, low: 79, feelsLike: 98, humidity: 85, wind: 10, cloud: 90 }) },
  Oslo: { country: "Norway", weather: weather({ high: 68, low: 54, feelsLike: 65, humidity: 60, wind: 10, cloud: 45 }) },
  Anchorage: { country: "United States", weather: weather({ high: 65, low: 52, feelsLike: 62, humidity: 55, wind: 8, cloud: 40 }) },
  Nairobi: { country: "Kenya", weather: weather({ high: 75, low: 55, feelsLike: 73, humidity: 55, wind: 8, cloud: 50 }) },
  Singapore: { country: "Singapore", weather: weather({ high: 88, low: 77, feelsLike: 95, humidity: 80, wind: 6, cloud: 70 }) },
};

const candidates = Object.entries(pool).map(([name, c]) => ({ name, ...c }));

function runScenario(targetName, expectedBest) {
  const target = { name: targetName, country: pool[targetName].country };
  const { best, ranked, thresholdUsed } = WeatherTwin.findBestMatch(target, pool[targetName].weather, candidates);

  console.log(`\n=== Target: ${targetName} (threshold ±${thresholdUsed}°F) ===`);
  for (const c of ranked) {
    console.log(`  ${c.matchPct}%  ${c.name}, ${c.country}`);
  }
  console.log(`Best match: ${best.name} (${best.matchPct}%)`);

  console.assert(
    ranked.every((c) => c.name !== targetName),
    `FAIL: ${targetName} should be excluded from its own candidate pool`
  );
  if (expectedBest) {
    console.assert(
      best.name === expectedBest,
      `FAIL: expected ${expectedBest} as ${targetName}'s best match, got ${best.name}`
    );
  }
  return { best, ranked };
}

// Note: the progressive-widening filter stops as soon as MIN_SHORTLIST candidates
// survive, so a query's shortlist won't necessarily include every far-off city (e.g.
// Reykjavik may not appear in Miami's ranking at all if enough closer cities exist) —
// that's the filter working as intended, not a bug.
runScenario("Chicago", "Toronto");
runScenario("Miami", "Mumbai");
runScenario("Reykjavik", "Sydney");

console.log("\nDone (see any FAIL lines above; none printed above this line means all checks passed).");
