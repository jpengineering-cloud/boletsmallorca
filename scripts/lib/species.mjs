// Initial scoring rules per species. These are hand-set starting points based on general
// mycological knowledge (rain-to-fruiting lag, temperature range, preferred habitat), NOT
// calibrated against real outings yet. See data/README.md — the plan is to correct these
// once outing logs (data/outings.json) build up across a season.
//
// lagMinDays/lagMaxDays: fruiting typically follows a rain event after this many days.
// rainThresholdMm: cumulative rain in that lag window considered "good" (score saturates here).
// tempRange: [min, max] ideal mean daily temperature (°C) across the same window.
// soilMoistureMin: soil_moisture_0_to_7cm_mean (m3/m3) below which we penalize heavily.
// season: months (1-12) considered full season; shoulder: months scored at reduced weight.

export const SPECIES = [
  {
    id: "esclatasang",
    name: "Esclatasang / Picornell",
    latin: "Lactarius deliciosus / sanguifluus",
    forestTypes: ["pinar_costaner", "pinar_muntanya_calcari"],
    season: [10, 11, 12],
    shoulder: [9, 1],
    lagMinDays: 8,
    lagMaxDays: 20,
    rainThresholdMm: 25,
    tempRange: [8, 20],
    soilMoistureMin: 0.15,
  },
  {
    id: "fredolic",
    name: "Fredolic",
    latin: "Tricholoma terreum",
    forestTypes: ["pinar_costaner", "pinar_muntanya_calcari"],
    season: [10, 11, 12],
    shoulder: [9, 1],
    lagMinDays: 6,
    lagMaxDays: 15,
    rainThresholdMm: 18,
    tempRange: [7, 19],
    soilMoistureMin: 0.12,
  },
  {
    id: "blava",
    name: "Blava",
    latin: "Lepista nuda",
    // Leaf litter under pine and holm oak, tolerates more cold than the Lactarius
    // group above so it fruits a bit later into the season.
    forestTypes: ["pinar_costaner", "pinar_muntanya_calcari", "alzinar_baix", "alzinar_muntanya"],
    season: [11, 12, 1],
    shoulder: [10, 2],
    lagMinDays: 15,
    lagMaxDays: 25,
    rainThresholdMm: 30,
    tempRange: [5, 16],
    soilMoistureMin: 0.16,
  },
  {
    id: "peus-de-rata",
    name: "Peus de rata",
    latin: "Ramaria spp.",
    forestTypes: ["pinar_muntanya_calcari", "alzinar_baix", "alzinar_muntanya"],
    season: [10, 11, 12],
    shoulder: [9, 1],
    lagMinDays: 8,
    lagMaxDays: 18,
    rainThresholdMm: 28,
    tempRange: [7, 19],
    soilMoistureMin: 0.16,
  },
  {
    id: "orella-de-llebre",
    name: "Orella de llebre",
    latin: "Otidea onotica",
    forestTypes: ["alzinar_baix", "alzinar_muntanya", "pinar_muntanya_calcari"],
    season: [10, 11, 12],
    shoulder: [9, 1],
    lagMinDays: 10,
    lagMaxDays: 22,
    rainThresholdMm: 30,
    tempRange: [8, 18],
    soilMoistureMin: 0.17,
  },
  {
    id: "cama-sec",
    name: "Cama-sec",
    latin: "Marasmius oreades",
    forestTypes: ["agricola_seca"],
    season: [4, 5, 10, 11],
    shoulder: [3, 6, 9, 12],
    lagMinDays: 4,
    lagMaxDays: 12,
    rainThresholdMm: 15,
    tempRange: [12, 24],
    soilMoistureMin: 0.1,
  },
  {
    id: "girgola",
    name: "Gírgola de card",
    latin: "Pleurotus eryngii",
    forestTypes: ["garriga_marina", "agricola_seca"],
    season: [11, 12, 1, 2, 3],
    shoulder: [10, 4],
    lagMinDays: 10,
    lagMaxDays: 30,
    rainThresholdMm: 20,
    tempRange: [8, 20],
    soilMoistureMin: 0.1,
  },
];

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

// Triangular falloff: 1.0 inside [min,max], decaying to 0 over `margin` degrees outside it.
function rangeScore(value, [min, max], margin = 5) {
  if (value >= min && value <= max) return 1;
  if (value < min) return clamp(1 - (min - value) / margin, 0, 1);
  return clamp(1 - (value - max) / margin, 0, 1);
}

export function scoreSpeciesForCell(species, cell, daily, monthNow) {
  if (!species.forestTypes.includes(cell.forestType)) {
    return { score: 0, reason: "habitat" };
  }

  let seasonFactor = 0;
  if (species.season.includes(monthNow)) seasonFactor = 1;
  else if (species.shoulder.includes(monthNow)) seasonFactor = 0.4;
  if (seasonFactor === 0) return { score: 0, reason: "fora-de-temporada" };

  const n = daily.time.length;
  const todayIdx = n - 1;
  const startIdx = clamp(todayIdx - species.lagMaxDays, 0, todayIdx);
  const endIdx = clamp(todayIdx - species.lagMinDays, 0, todayIdx);

  let rainSum = 0;
  let tempSum = 0;
  let soilSum = 0;
  let count = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    rainSum += daily.precipitation_sum[i] ?? 0;
    tempSum += daily.temperature_2m_mean[i] ?? 0;
    soilSum += daily.soil_moisture_0_to_7cm_mean[i] ?? 0;
    count++;
  }
  const avgTemp = count ? tempSum / count : 0;
  const avgSoil = count ? soilSum / count : 0;

  const rainScore = clamp(rainSum / species.rainThresholdMm, 0, 1.2);
  const tempScore = rangeScore(avgTemp, species.tempRange);
  const soilScore = clamp(avgSoil / species.soilMoistureMin, 0, 1.2);

  const combined = 0.5 * Math.min(rainScore, 1) + 0.3 * tempScore + 0.2 * Math.min(soilScore, 1);
  const score = Math.round(clamp(combined * seasonFactor, 0, 1) * 100);

  return {
    score,
    reason: null,
    debug: { rainSum: Math.round(rainSum * 10) / 10, avgTemp: Math.round(avgTemp * 10) / 10, avgSoil: Math.round(avgSoil * 1000) / 1000, seasonFactor },
  };
}
