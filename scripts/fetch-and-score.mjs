// Runs every 6h via GitHub Actions. Fetches recent+forecast weather for the whole grid in
// one batched Open-Meteo call, scores every species per cell, writes web/data/scores.geojson.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { SPECIES, scoreSpeciesForCell } from "./lib/species.mjs";

const grid = JSON.parse(readFileSync(new URL("../data/grid.json", import.meta.url)));
const cells = grid.cells;
const halfLat = grid.latStep / 2;
const halfLon = grid.lonStep / 2;

function cellRectangle(lat, lon) {
  return [
    [
      [lon - halfLon, lat - halfLat],
      [lon + halfLon, lat - halfLat],
      [lon + halfLon, lat + halfLat],
      [lon - halfLon, lat + halfLat],
      [lon - halfLon, lat - halfLat],
    ],
  ];
}

const PAST_DAYS = 30;
const lats = cells.map((c) => c.lat).join(",");
const lons = cells.map((c) => c.lon).join(",");
const url =
  `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
  `&daily=precipitation_sum,temperature_2m_mean,soil_moisture_0_to_7cm_mean` +
  `&past_days=${PAST_DAYS}&forecast_days=1&timezone=Europe%2FMadrid`;

console.log(`Fetching weather for ${cells.length} cells...`);
const res = await fetch(url);
if (!res.ok) throw new Error(`Open-Meteo request failed: ${res.status}`);
const weather = await res.json();
if (!Array.isArray(weather) || weather.length !== cells.length) {
  throw new Error(`Expected ${cells.length} weather results, got ${Array.isArray(weather) ? weather.length : typeof weather}`);
}

const now = new Date();
const monthNow = now.getMonth() + 1;

const features = cells.map((cell, i) => {
  const daily = weather[i].daily;
  const scores = {};
  for (const species of SPECIES) {
    const result = scoreSpeciesForCell(species, cell, daily, monthNow);
    scores[species.id] = result.score;
  }
  const bestId = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: cellRectangle(cell.lat, cell.lon) },
    properties: {
      id: cell.id,
      elevation: cell.elevation,
      region: cell.region,
      forestType: cell.forestType,
      distToCoastKm: cell.distToCoastKm,
      scores,
      bestSpecies: bestId,
      bestScore: scores[bestId],
    },
  };
});

const geojson = {
  type: "FeatureCollection",
  generatedAt: now.toISOString(),
  species: SPECIES.map(({ id, name, latin }) => ({ id, name, latin })),
  features,
};

mkdirSync(new URL("../web/data/", import.meta.url), { recursive: true });
writeFileSync(new URL("../web/data/scores.geojson", import.meta.url), JSON.stringify(geojson));
console.log(`Wrote web/data/scores.geojson with ${features.length} cells at ${now.toISOString()}`);
