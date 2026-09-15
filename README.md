# Bolets Mallorca

Mapa de probabilitat de trobar bolets a Mallorca (esclatasang/picornell,
fredolic, blava, peus de rata, orella de llebre, cama-sec, gírgola de card),
basat en pluja, temperatura i humitat del sòl recents. Pensat per a ús
personal/amics, sense login.

## Com funciona

1. [`scripts/generate-grid.mjs`](scripts/generate-grid.mjs) — es corre **un
   sol cop** (o quan es vulgui canviar la resolució): genera
   [`data/grid.json`](data/grid.json), ~320 punts sobre l'illa (rejilla de
   ~3km) amb elevació real (Open-Meteo) i una classificació aproximada de
   regió/tipus de bosc (vegeu limitacions més avall).
2. [`scripts/fetch-and-score.mjs`](scripts/fetch-and-score.mjs) — es corre
   **cada 6 hores via GitHub Actions**: demana a Open-Meteo la pluja,
   temperatura i humitat del sòl dels darrers 30 dies per a cada punt de la
   rejilla, aplica les regles de [`scripts/lib/species.mjs`](scripts/lib/species.mjs)
   per espècie, i escriu `web/data/scores.geojson`.
3. [`web/`](web/) — PWA estàtica (MapLibre GL JS + OpenFreeMap, sense API
   key) que pinta la rejilla acolorida segons la puntuació de l'espècie
   triada. Instal·lable al mòbil ("Afegeix a la pantalla d'inici").

GitHub Actions fa el fetch + commit del geojson actualitzat i desplega
`web/` a GitHub Pages automàticament.

## Desenvolupament local

```bash
node scripts/fetch-and-score.mjs   # regenera web/data/scores.geojson
npx serve web -l 5500              # serveix la carpeta web/
```

## Limitacions conegudes (v1)

- **Tipus de bosc aproximat**: no s'utilitza cap capa GIS real (IDEIB/Mapa
  Forestal). La classificació ve de regles simples per zona geogràfica +
  elevació + distància a la costa (`scripts/lib/geography.mjs`). És
  raonable però no exacta — per exemple, alguns punts classificats com
  "agrícola" poden tenir bosc real, i viceversa. Millora pendent: importar
  el Mapa Forestal / capa de vegetació de l'IDEIB.
- **Regles d'espècie sense calibrar**: els llindars de pluja/temperatura
  (`scripts/lib/species.mjs`) són punts de partida raonables basats en
  coneixement micològic general, no ajustats amb dades reals de Mallorca.
  Caldria un registre de sortides (trobat molt / poc / res) per anar-los
  corregint durant la temporada.
- **Identificació de "peus de rata" (Ramaria spp.) i "orella de llebre"
  (Otidea onotica)**: són les dues espècies amb menys confiança de la
  llista — si l'equivalència amb el nom popular mallorquí no és correcta,
  cal ajustar-ho a `scripts/lib/species.mjs`.
- **Sense capa de finques públiques/privades**: la majoria de bosc a
  Mallorca és privat. L'app no distingeix terreny públic (Sa Comuna,
  Galatzó, Son Moragues...) de finques privades — de moment cal
  comprovar-ho pel compte de cadascú.
- **Sense registre de sortides**: encara no hi ha manera de guardar "vaig
  anar aquí i vaig trobar X" per retroalimentar el model. És l'única peça
  que caldria una mica de backend (Supabase gratuït, o més senzill, un
  Google Form) si es vol fer de manera compartida amb els amics.

## Estructura

```
data/
  mallorca-boundary-raw.json   polígon de costa (OpenStreetMap/Nominatim)
  grid.json                    rejilla de cel·les generada
scripts/
  generate-grid.mjs            genera data/grid.json (manual, un cop)
  fetch-and-score.mjs          genera web/data/scores.geojson (cron 6h)
  lib/
    geography.mjs              classificació regió/bosc aproximada
    species.mjs                regles de puntuació per espècie
    point-in-polygon.mjs       utilitat geomètrica
web/
  index.html, app.js, sw.js    la PWA
  data/scores.geojson          sortida generada (es commiteja des del CI)
.github/workflows/update-data.yml   cron + deploy a GitHub Pages
```
