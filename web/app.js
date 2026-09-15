const pmtilesProtocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [2.9, 39.6],
  zoom: 9,
  minZoom: 7,
  maxZoom: 14,
});
map.addControl(new maplibregl.NavigationControl(), "top-right");
map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), "top-right");

const FOREST_LABELS = {
  pinar_costaner: "Pinar costaner",
  pinar_muntanya_calcari: "Pinar de muntanya",
  alzinar_muntanya: "Alzinar de muntanya",
  alzinar_baix: "Alzinar baix",
  agricola_seca: "Camp/erm",
  garriga_marina: "Garriga",
};

let geojson = null;
let currentSpecies = null;
let styleReady = false;

function whenStyleReady(cb) {
  if (map.isStyleLoaded()) {
    cb();
    return;
  }
  const t = setInterval(() => {
    if (map.isStyleLoaded()) {
      clearInterval(t);
      cb();
    }
  }, 200);
}
whenStyleReady(() => {
  styleReady = true;
  render();
});

async function loadData() {
  const res = await fetch("data/scores.geojson?_=" + Date.now());
  geojson = await res.json();

  const select = document.getElementById("species-select");
  select.innerHTML = geojson.species
    .map((s) => `<option value="${s.id}">${s.name}</option>`)
    .join("");
  currentSpecies = geojson.species[0].id;
  select.value = currentSpecies;
  select.addEventListener("change", () => {
    currentSpecies = select.value;
    render();
  });

  const genDate = new Date(geojson.generatedAt);
  document.getElementById("meta").textContent =
    `${geojson.features.length} zones · actualitzat ${genDate.toLocaleString("ca-ES", { dateStyle: "short", timeStyle: "short" })}`;

  render();
}
loadData();

function render() {
  if (!geojson || !styleReady) return;
  const fc = {
    type: "FeatureCollection",
    features: geojson.features.map((f) => ({
      ...f,
      properties: { ...f.properties, score: f.properties.scores[currentSpecies] },
    })),
  };

  const src = map.getSource("bolets");
  if (src && map.getLayer("bolets-fill")) {
    src.setData(fc);
    return;
  }
  if (src) {
    src.setData(fc);
  } else {
    map.addSource("bolets", { type: "geojson", data: fc });
  }
  map.addLayer({
    id: "bolets-fill",
    type: "fill",
    source: "bolets",
    paint: {
      "fill-color": [
        "step",
        ["get", "score"],
        "#9aa5ab",
        10, "#4a7c59",
        35, "#dd9c2f",
        60, "#c53030",
      ],
      "fill-opacity": 0.55,
    },
  });
  map.addLayer({
    id: "bolets-outline",
    type: "line",
    source: "bolets",
    paint: {
      "line-color": "#ffffff",
      "line-opacity": 0.25,
      "line-width": 1,
    },
  });

  map.on("click", "bolets-fill", (e) => {
    const p = e.features[0].properties;
    const scores = JSON.parse(typeof p.scores === "string" ? p.scores : JSON.stringify(p.scores));
    const rows = geojson.species
      .map((s) => `<tr><td>${s.name}</td><td><b>${scores[s.id] ?? "-"}</b></td></tr>`)
      .join("");
    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(
        `<h3>${FOREST_LABELS[p.forestType] || p.forestType}</h3>` +
        `<div>${p.elevation} m · ${p.distToCoastKm} km de la costa</div>` +
        `<table>${rows}</table>`
      )
      .addTo(map);
  });
  map.on("mouseenter", "bolets-fill", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "bolets-fill", () => (map.getCanvas().style.cursor = ""));
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
