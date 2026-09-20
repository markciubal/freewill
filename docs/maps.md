# Hosting your own map

By default the map shows picture tiles from OpenStreetMap's public servers. That
needs the internet, it shows everyone the same look, and OpenStreetMap's usage
policy does not allow a busy app to lean on those servers.

The better way is for the community to host **one map file** for its area. The
app then draws the map on each person's device, as outlines, in that person's
own theme colors. It works with no internet beyond this server, it costs a few
megabytes of disk, and every member can restyle it under **Theme** (Map land,
Map water, Map roads; labels, buildings and parks reuse the text, border and
accent colors).

## 1. Make the file (five minutes)

The file format is [PMTiles](https://docs.protomaps.com/pmtiles/): one file that
holds vector map data for every zoom level, readable over plain HTTP range
requests. No tile server, no database.

Install the `pmtiles` command from
<https://github.com/protomaps/go-pmtiles/releases>, then cut your area out of
the daily worldwide build. Find the bounding box of your area (west, south,
east, north, in degrees) with any map site, and run:

```sh
# Example: a town about 20 km across. The planet file is read remotely; only
# your area is downloaded. Use a recent date from https://build.protomaps.com/
pmtiles extract https://build.protomaps.com/20250901.pmtiles public/map/local.pmtiles \
  --bbox=-122.75,45.40,-122.45,45.65
```

A town comes out at 5–30 MB; a county at 50–200 MB. Pick the smallest area that
covers where members live: the map still shows the whole world's coastlines and
borders at low zoom, just without street detail outside your area.

## 2. Point the app at it

```sh
# .env
NEXT_PUBLIC_PMTILES_URL="/map/local.pmtiles"
```

Files under `public/map/` are served by the app itself (they are ignored by
git, so each deployment keeps its own). Any host that supports HTTP range
requests works too, for example a plain object-storage bucket:

```sh
NEXT_PUBLIC_PMTILES_URL="https://files.example.org/maps/local.pmtiles"
```

Restart the app. The map page's note changes to say the map is drawn from data
hosted here.

## 3. Your own data (shapefiles, GeoJSON, a county GIS export)

If your county or council publishes road centerlines, parcels or trails as a
shapefile, you can build the map from that instead of, or on top of,
OpenStreetMap. Two tools do it: `ogr2ogr` (from GDAL) converts the shapefile,
and `tippecanoe` cuts it into tiles.

```sh
ogr2ogr -f GeoJSON -t_srs EPSG:4326 roads.geojson roads.shp
tippecanoe -o public/map/roads.pmtiles -l roads -zg --drop-densest-as-needed roads.geojson
```

The app's drawing rules (`src/components/basemap.ts`) expect the layer names
and `kind` values of the Protomaps basemap schema (`earth`, `water`, `roads`
with kinds `highway` / `major_road` / `minor_road` / `path`, `buildings`,
`places`, `boundaries`). A file made from your own shapefile needs its layers
named to match, or a small addition to the rules for a new layer. That is a
deliberate design: the rules are a short readable list, not a style language.

## What this does not do

- It does not geocode or search addresses. There is no search box on purpose.
- It does not track anyone. People are never drawn on the map; only things
  people chose to publish are.
- It does not download map data to members' devices ahead of time. Tiles are
  fetched from this server as the map is viewed. Offline-first caching of a
  locality is a planned step.
