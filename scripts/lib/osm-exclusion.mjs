// Pulls urban land-use polygons and major roads from OpenStreetMap (Overpass API) so
// generate-grid.mjs can drop/reclassify grid cells that land on asphalt or built-up
// areas instead of real terrain. One-off fetch, cached to data/osm-exclusion-raw.json
// so re-running generate-grid.mjs doesn't hammer the public Overpass instance.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pointInRing } from "./point-in-polygon.mjs";

const CACHE_PATH = new URL("../../data/osm-exclusion-raw.json", import.meta.url);

const QUERY = `[out:json][timeout:90];
(
  way["landuse"~"^(residential|industrial|commercial|retail|construction|garages|military)$"](39.2643,2.3447,39.9625,3.4788);
  way["aeroway"="aerodrome"](39.2643,2.3447,39.9625,3.4788);
  way["highway"~"^(motorway|trunk|primary)$"](39.2643,2.3447,39.9625,3.4788);
);
out geom;`;

async function fetchRaw() {
  if (existsSync(CACHE_PATH)) {
    return JSON.parse(readFileSync(CACHE_PATH));
  }
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "*/*",
      "User-Agent": "boletsmallorca-dev/0.1 (personal project)",
    },
    body: "data=" + encodeURIComponent(QUERY),
  });
  if (!res.ok) throw new Error(`Overpass request failed: ${res.status}`);
  const data = await res.json();
  writeFileSync(CACHE_PATH, JSON.stringify(data));
  return data;
}

function bboxOf(points) {
  let minLon = 999, maxLon = -999, minLat = 999, maxLat = -999;
  for (const [lon, lat] of points) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, maxLon, minLat, maxLat };
}

function inBbox(lat, lon, bbox, padDeg) {
  return (
    lon >= bbox.minLon - padDeg &&
    lon <= bbox.maxLon + padDeg &&
    lat >= bbox.minLat - padDeg &&
    lat <= bbox.maxLat + padDeg
  );
}

function distancePointToSegmentKm([plon, plat], [alon, alat], [blon, blat]) {
  const kmPerDegLat = 111.2;
  const kmPerDegLon = 111.2 * Math.cos((plat * Math.PI) / 180);
  const px = plon * kmPerDegLon, py = plat * kmPerDegLat;
  const ax = alon * kmPerDegLon, ay = alat * kmPerDegLat;
  const bx = blon * kmPerDegLon, by = blat * kmPerDegLat;
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export async function loadOsmExclusionData() {
  const raw = await fetchRaw();
  const polygons = [];
  const lines = [];

  for (const el of raw.elements) {
    if (!el.geometry || el.geometry.length < 2) continue;
    const points = el.geometry.map((g) => [g.lon, g.lat]);
    const bbox = bboxOf(points);
    if (el.tags?.highway) {
      lines.push({ bbox, points });
    } else {
      polygons.push({ bbox, ring: points });
    }
  }
  return { polygons, lines };
}

// Returns true if the cell falls inside an urban/industrial polygon or within
// `roadBufferKm` of a motorway/trunk/primary road.
export function isUrbanized(lat, lon, osmData, roadBufferKm = 0.15) {
  const padDeg = 0.01;
  for (const poly of osmData.polygons) {
    if (!inBbox(lat, lon, poly.bbox, padDeg)) continue;
    if (pointInRing([lon, lat], poly.ring)) return true;
  }

  const roadPadDeg = roadBufferKm / 100; // generous pre-filter, refined below
  for (const line of osmData.lines) {
    if (!inBbox(lat, lon, line.bbox, roadPadDeg)) continue;
    for (let i = 0; i < line.points.length - 1; i++) {
      if (distancePointToSegmentKm([lon, lat], line.points[i], line.points[i + 1]) <= roadBufferKm) {
        return true;
      }
    }
  }
  return false;
}
