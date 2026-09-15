// One-off (re-run manually when needed, not part of the 6h cron): builds data/grid.json,
// the fixed set of land cells covering Mallorca that the scoring script iterates over.
import { readFileSync, writeFileSync } from "node:fs";
import { pointInRing } from "./lib/point-in-polygon.mjs";
import { classifyRegion, classifyForestType } from "./lib/geography.mjs";

const LAT_STEP = 0.03; // ~3.3km
const LON_STEP = 0.04; // ~3.4km at this latitude

const boundary = JSON.parse(
  readFileSync(new URL("../data/mallorca-boundary-raw.json", import.meta.url))
);
const ring = boundary.coordinates[0]; // [lon, lat][]

function bbox(ring) {
  let minLon = 999, maxLon = -999, minLat = 999, maxLat = -999;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, maxLon, minLat, maxLat };
}

function distToCoastKm([lon, lat], ring) {
  let best = Infinity;
  const kmPerDegLat = 111.2;
  const kmPerDegLon = 111.2 * Math.cos((lat * Math.PI) / 180);
  for (const [rlon, rlat] of ring) {
    const dx = (rlon - lon) * kmPerDegLon;
    const dy = (rlat - lat) * kmPerDegLat;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best) best = d;
  }
  return best;
}

const { minLon, maxLon, minLat, maxLat } = bbox(ring);

const candidates = [];
for (let lat = minLat; lat <= maxLat; lat += LAT_STEP) {
  for (let lon = minLon; lon <= maxLon; lon += LON_STEP) {
    if (pointInRing([lon, lat], ring)) {
      candidates.push({ lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) });
    }
  }
}
console.log(`Land points inside boundary: ${candidates.length}`);

// Fetch elevation in batches (Open-Meteo elevation API accepts comma-separated lists).
const BATCH = 100;
const elevations = [];
for (let i = 0; i < candidates.length; i += BATCH) {
  const batch = candidates.slice(i, i + BATCH);
  const lats = batch.map((c) => c.lat).join(",");
  const lons = batch.map((c) => c.lon).join(",");
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;
  const res = await fetch(url);
  const json = await res.json();
  elevations.push(...json.elevation);
  process.stdout.write(`\relevation ${Math.min(i + BATCH, candidates.length)}/${candidates.length}`);
}
console.log();

const cells = candidates.map((c, i) => {
  const elevation = elevations[i];
  const region = classifyRegion(c.lat, c.lon);
  const dCoast = Math.round(distToCoastKm([c.lon, c.lat], ring) * 10) / 10;
  const forestType = classifyForestType(region, elevation, dCoast);
  return {
    id: `c${i}`,
    lat: c.lat,
    lon: c.lon,
    elevation,
    region,
    distToCoastKm: dCoast,
    forestType,
  };
});

writeFileSync(
  new URL("../data/grid.json", import.meta.url),
  JSON.stringify({ generatedAt: new Date().toISOString(), cellCount: cells.length, cells }, null, 2)
);
console.log(`Wrote data/grid.json with ${cells.length} cells`);
