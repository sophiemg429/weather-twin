// Two-stage city matching: coarse temperature filter, then weighted similarity ranking.
// Pure functions, no DOM/fetch dependencies, so they can be exercised from plain Node
// (see test/matching.smoke.js) as well as from app.js in the browser.
//
// Exposed as a plain global (WeatherTwin) rather than an ES module or CommonJS export,
// since this project has no build step and needs to run as-is via <script> tags in the
// browser while still being require()-able from a Node test script.

(function (root) {
  const FEATURE_KEYS = [
    "tempHigh",
    "tempLow",
    "feelsLike",
    "humidity",
    "windSpeed",
    "cloudCover",
  ];

  // Suggested starting weights from the spec: temp high/low 40% (split evenly between
  // the two), feels-like 20%, humidity 20%, wind speed 10%, cloud cover 10%.
  const WEIGHTS = {
    tempHigh: 0.2,
    tempLow: 0.2,
    feelsLike: 0.2,
    humidity: 0.2,
    windSpeed: 0.1,
    cloudCover: 0.1,
  };

  // Progressive widening thresholds (°F) for the coarse filter, applied to both the
  // daily high and daily low. Stop widening once at least MIN_SHORTLIST candidates
  // survive, or once the thresholds run out.
  const TEMP_THRESHOLDS = [8, 15, 25, 40, Infinity];
  const MIN_SHORTLIST = 10;

  function extractFeatures(weather) {
    const { current, daily } = weather;
    return {
      tempHigh: daily.temperature_2m_max[0],
      tempLow: daily.temperature_2m_min[0],
      feelsLike: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
      cloudCover: current.cloud_cover,
    };
  }

  // candidates: [{ ...city, weather }], targetFeatures: extracted features for the
  // chosen city (not a candidate itself).
  function filterByTemperature(targetFeatures, candidates) {
    for (const threshold of TEMP_THRESHOLDS) {
      const shortlist = candidates.filter((c) => {
        const f = extractFeatures(c.weather);
        return (
          Math.abs(f.tempHigh - targetFeatures.tempHigh) <= threshold &&
          Math.abs(f.tempLow - targetFeatures.tempLow) <= threshold
        );
      });
      if (shortlist.length >= MIN_SHORTLIST || threshold === TEMP_THRESHOLDS[TEMP_THRESHOLDS.length - 1]) {
        return { shortlist, thresholdUsed: threshold };
      }
    }
    return { shortlist: candidates, thresholdUsed: Infinity };
  }

  // min-max normalize a value against the range of [target, ...shortlist] for that
  // feature, so no single feature's raw scale (e.g. humidity 0-100 vs wind 0-30)
  // dominates the weighted distance.
  function makeNormalizer(values) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1; // every candidate identical on this feature -> no-op
    return (v) => (v - min) / range;
  }

  function rankShortlist(targetFeatures, shortlist) {
    const candidateFeatures = shortlist.map((c) => extractFeatures(c.weather));

    const normalizers = {};
    for (const key of FEATURE_KEYS) {
      const values = [targetFeatures[key], ...candidateFeatures.map((f) => f[key])];
      normalizers[key] = makeNormalizer(values);
    }

    const scored = shortlist.map((city, i) => {
      const f = candidateFeatures[i];
      let distance = 0;
      const breakdown = {};
      for (const key of FEATURE_KEYS) {
        const norm = normalizers[key];
        const d = Math.abs(norm(targetFeatures[key]) - norm(f[key]));
        distance += WEIGHTS[key] * d;
        breakdown[key] = { target: targetFeatures[key], candidate: f[key] };
      }
      const matchPct = Math.round((1 - distance) * 100);
      return { ...city, matchPct, breakdown };
    });

    scored.sort((a, b) => b.matchPct - a.matchPct);
    return scored;
  }

  // Excludes the chosen city itself from candidates (by name+country — a simple stand-in
  // for "own metro area"; TODO: refine if the full GeoNames list has multiple entries
  // that are effectively the same metro, e.g. suburbs).
  function findBestMatch(targetCity, targetWeather, candidates) {
    const targetFeatures = extractFeatures(targetWeather);
    const eligible = candidates.filter(
      (c) => !(c.name === targetCity.name && c.country === targetCity.country)
    );
    const { shortlist, thresholdUsed } = filterByTemperature(targetFeatures, eligible);
    const ranked = rankShortlist(targetFeatures, shortlist);
    return { best: ranked[0] || null, ranked, thresholdUsed, targetFeatures };
  }

  const WeatherTwin = {
    extractFeatures,
    filterByTemperature,
    rankShortlist,
    findBestMatch,
    FEATURE_KEYS,
    WEIGHTS,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = WeatherTwin;
  } else {
    root.WeatherTwin = WeatherTwin;
  }
})(typeof window !== "undefined" ? window : globalThis);
