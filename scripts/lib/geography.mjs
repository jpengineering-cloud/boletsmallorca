// Rough geographic classification for Mallorca, used until a real IDEIB forest-cover
// layer replaces it. Boundaries are hand-picked from known geography, not a GIS layer.
// See data/README.md for what's approximate here and how to upgrade it.

export function classifyRegion(lat, lon) {
  if (lon < 2.95 && lat > 39.55) return "tramuntana"; // NW mountain spine
  if (lon > 3.15 && lat > 39.55) return "llevant_nord"; // Artà massif
  if (lon > 3.0 && lat <= 39.55 && lat > 39.3) return "llevant_sud"; // Manacor/Felanitx hills
  if (lat <= 39.48) return "migjorn"; // southern coastal strip (Llucmajor-Campos-Santanyí)
  return "pla"; // central plain
}

// Approximate forest/habitat type from region + elevation + distance to coast.
// This drives which mushroom species rules even consider a cell.
export function classifyForestType(region, elevationM, distToCoastKm) {
  if (region === "tramuntana") {
    if (elevationM > 500) return "alzinar_muntanya";
    if (elevationM > 150) return "pinar_muntanya_calcari";
    return distToCoastKm < 2 ? "pinar_costaner" : "alzinar_baix";
  }
  if (region === "llevant_nord" || region === "llevant_sud") {
    if (elevationM > 300) return "alzinar_muntanya";
    return "pinar_muntanya_calcari";
  }
  if (region === "migjorn") {
    return distToCoastKm < 3 ? "pinar_costaner" : "garriga_marina";
  }
  // pla
  return distToCoastKm < 3 ? "pinar_costaner" : "agricola_seca";
}
