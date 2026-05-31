import esriConfig from "./vendor/@arcgis/core/config.js";
import Map from "./vendor/@arcgis/core/Map.js";
import SceneView from "./vendor/@arcgis/core/views/SceneView.js";
import FeatureLayer from "./vendor/@arcgis/core/layers/FeatureLayer.js";
import Graphic from "./vendor/@arcgis/core/Graphic.js";
import Point from "./vendor/@arcgis/core/geometry/Point.js";
import Polyline from "./vendor/@arcgis/core/geometry/Polyline.js";
import Extent from "./vendor/@arcgis/core/geometry/Extent.js";
import Home from "./vendor/@arcgis/core/widgets/Home.js";

esriConfig.assetsPath = "./vendor/@arcgis/core/assets";

const VERTICAL_EXAGGERATION = 1;
const HILLTOP_Z_EXAGGERATION = 3;

const WKID = {
  output: 4326,
  worldMercator: 3395,
  britishNationalGrid: 27700
};

const DATA_PATHS = {
  contours: "Data/Shropshire Hills Contours.geojson",
  peaks: "Data/ShropshireHillTops_points.geojson",
  boundary: "Data/Shropshire Hills Boundary.geojson"
};

const FIELD_NAMES = {
  contourElevation: "ELEVATION",
  peakName: "Name",
  peakElevation: "Elevation"
};

const CLIENT_FIELD_NAMES = {
  objectId: "ObjectID",
  name: "name",
  elevation: "elevation",
  sourceZ: "sourceZ",
  mapZ: "mapZ"
};

const CLIENT_FIELD_ALIASES = {
  objectId: "ObjectID",
  name: "Name",
  elevation: "Elevation",
  sourceZ: "GeoJSON Z",
  mapZ: "Map Z"
};

const LAYER_TITLES = {
  contours: "Shropshire Hills Contours",
  peaks: "Shropshire Hill Tops",
  boundary: "Shropshire Hills Boundary"
};

const MAP_STYLE = {
  backgroundColor: [0, 0, 0, 0],
  cream: "#f4efe3",
  brown: [86, 72, 31],
  boundaryRed: [200, 0, 0, 0.95],
  labelHalo: [244, 239, 227, 0.6]
};

const VIEW_SETTINGS = {
  minAltitude: 1000,
  maxAltitude: 150000,
  initialExtentExpand: 1.08,
  initialTilt: 50,
  hillZoomTilt: 25,
  hillZoomScale: 25000,
  goToDuration: 1800
};

const SYMBOL_SETTINGS = {
  contourLineSize: "1px",
  contourMaxColorStop: 800,
  boundaryLineSize: "2px",
  peakIconSize: "4px",
  labelSize: 10,
  labelScreenOffset: 50,
  labelMaxWorldOffset: 1000,
  labelMinWorldOffset: 20,
  calloutSize: 1
};

const WORLD_MERCATOR = {
  semiMajorAxis: 6378137,
  eccentricity: 0.08181919084262149,
  inverseIterations: 8
};

const ELLIPSOIDS = {
  airy1830: {
    a: 6377563.396,
    b: 6356256.909
  },
  wgs84: {
    a: 6378137,
    b: 6356752.3141
  }
};

const BRITISH_NATIONAL_GRID = {
  f0: 0.9996012717,
  lat0Degrees: 49,
  lon0Degrees: -2,
  n0: -100000,
  e0: 400000,
  meridionalArcTolerance: 0.00001
};

const OSGB36_TO_WGS84 = {
  tx: 446.448,
  ty: -125.157,
  tz: 542.060,
  scalePpm: 20.4894,
  rxArcSeconds: 0.1502,
  ryArcSeconds: 0.2470,
  rzArcSeconds: 0.8421
};

function startApp() {
  const map = new Map({
    basemap: null,
    ground: {
      opacity: 0
    }
  });

  const view = new SceneView({
    container: "viewDiv",
    map,
    viewingMode: "global",
    qualityProfile: "high",
    alphaCompositingEnabled: true,
    environment: {
      background: {
        type: "color",
        color: MAP_STYLE.backgroundColor
      },
      starsEnabled: false,
      atmosphereEnabled: false
    },
    constraints: {
      altitude: {
        min: VIEW_SETTINGS.minAltitude,
        max: VIEW_SETTINGS.maxAltitude
      }
    }
  });

  initialise();

  async function initialise() {
    const [contoursGeojson, peaksGeojson, boundaryGeojson] = await Promise.all([
      loadGeojson(DATA_PATHS.contours),
      loadGeojson(DATA_PATHS.peaks),
      loadGeojson(DATA_PATHS.boundary)
    ]);

    const contourLayer = createLineLayer({
      title: LAYER_TITLES.contours,
      geojson: contoursGeojson,
      spatialReferenceWkid: WKID.worldMercator,
      elevationField: FIELD_NAMES.contourElevation,
      color: null,
      renderer: {
        type: "simple",
        symbol: {
          type: "line-3d",
          symbolLayers: [{
            type: "line",
            size: SYMBOL_SETTINGS.contourLineSize
          }]
        },
        visualVariables: [{
          type: "color",
          field: CLIENT_FIELD_NAMES.elevation,
          stops: [{
            value: 0,
            color: MAP_STYLE.cream
          }, {
            value: SYMBOL_SETTINGS.contourMaxColorStop,
            color: MAP_STYLE.brown
          }]
        }]
      }
    });

    const peaks = createPeakGraphics(peaksGeojson);
    const peaksLayer = createPeaksLayer(peaks.graphics);

    const boundaryLayer = createLineLayer({
      title: LAYER_TITLES.boundary,
      geojson: boundaryGeojson,
      spatialReferenceWkid: WKID.worldMercator,
      elevationField: null,
      renderer: {
        type: "simple",
        symbol: {
          type: "line-3d",
          symbolLayers: [{
            type: "line",
            material: {
              color: MAP_STYLE.boundaryRed
            },
            size: SYMBOL_SETTINGS.boundaryLineSize
          }]
        }
      }
    });

    map.addMany([contourLayer, boundaryLayer, peaksLayer]);
    renderHillTable(peaks.hills);

    await view.when();
    updateViewPadding();
    await view.goTo({
      target: peaks.extent.expand(VIEW_SETTINGS.initialExtentExpand),
      tilt: VIEW_SETTINGS.initialTilt
    }, {
      duration: 0
    });
    addResetButton();

    window.addEventListener("resize", updateViewPadding);
  }

  async function loadGeojson(path) {
    const response = await fetch(encodeURI(path));
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  function createLineLayer({ title, geojson, spatialReferenceWkid, elevationField, renderer }) {
    const graphics = [];
    const fields = [
      { name: CLIENT_FIELD_NAMES.objectId, alias: CLIENT_FIELD_ALIASES.objectId, type: "oid" },
      { name: CLIENT_FIELD_NAMES.elevation, alias: CLIENT_FIELD_ALIASES.elevation, type: "double" }
    ];

    geojson.features.forEach((feature, index) => {
      const paths = getLinePaths(feature.geometry, spatialReferenceWkid);
      const elevation = getNumericProperty(feature.properties, elevationField);

      graphics.push(new Graphic({
        geometry: new Polyline({
          paths,
          spatialReference: { wkid: WKID.output }
        }),
        attributes: {
          [CLIENT_FIELD_NAMES.objectId]: index + 1,
          [CLIENT_FIELD_NAMES.elevation]: elevation ?? 0
        }
      }));
    });

    const layerProperties = {
      title,
      source: graphics,
      fields,
      geometryType: "polyline",
      spatialReference: { wkid: WKID.output },
      objectIdField: CLIENT_FIELD_NAMES.objectId,
      renderer
    };

    if (elevationField) {
      layerProperties.elevationInfo = {
        mode: "absolute-height",
        featureExpressionInfo: {
          expression: `Number($feature.${CLIENT_FIELD_NAMES.elevation}) * ${VERTICAL_EXAGGERATION}`
        }
      };
    }

    return new FeatureLayer(layerProperties);
  }

  function createPeaksLayer(graphics) {
    return new FeatureLayer({
      title: LAYER_TITLES.peaks,
      source: graphics,
      fields: [
        { name: CLIENT_FIELD_NAMES.objectId, alias: CLIENT_FIELD_ALIASES.objectId, type: "oid" },
        { name: CLIENT_FIELD_NAMES.name, alias: CLIENT_FIELD_ALIASES.name, type: "string" },
        { name: CLIENT_FIELD_NAMES.elevation, alias: CLIENT_FIELD_ALIASES.elevation, type: "double" },
        { name: CLIENT_FIELD_NAMES.sourceZ, alias: CLIENT_FIELD_ALIASES.sourceZ, type: "double" },
        { name: CLIENT_FIELD_NAMES.mapZ, alias: CLIENT_FIELD_ALIASES.mapZ, type: "double" }
      ],
      geometryType: "point",
      spatialReference: { wkid: WKID.output },
      hasZ: true,
      objectIdField: CLIENT_FIELD_NAMES.objectId,
      outFields: ["*"],
      elevationInfo: {
        mode: "absolute-height",
        featureExpressionInfo: {
          expression: `Number($feature.${CLIENT_FIELD_NAMES.mapZ})`
        }
      },
      renderer: {
        type: "simple",
        symbol: {
          type: "point-3d",
          symbolLayers: [{
            type: "icon",
            resource: {
              primitive: "circle"
            },
            material: {
              color: MAP_STYLE.brown
            },
            size: SYMBOL_SETTINGS.peakIconSize
          }]
        }
      },
      screenSizePerspectiveEnabled: false,
      labelingInfo: [{
        labelPlacement: "above-center",
        labelExpressionInfo: {
          expression: `$feature.${CLIENT_FIELD_NAMES.name}`
        },
        symbol: {
          type: "label-3d",
          symbolLayers: [{
            type: "text",
            material: {
              color: MAP_STYLE.brown
            },
            halo: {
              color: MAP_STYLE.labelHalo,
              size: 2
            },
            font: {
              weight: "bold"
            },
            size: SYMBOL_SETTINGS.labelSize
          }],
          verticalOffset: {
            screenLength: SYMBOL_SETTINGS.labelScreenOffset,
            maxWorldLength: SYMBOL_SETTINGS.labelMaxWorldOffset,
            minWorldLength: SYMBOL_SETTINGS.labelMinWorldOffset
          },
          callout: {
            type: "line",
            size: SYMBOL_SETTINGS.calloutSize,
            color: MAP_STYLE.brown
          }
        }
      }]
    });
  }

  function createPeakGraphics(geojson) {
    const hills = geojson.features
      .map((feature, index) => {
        const coords = feature.geometry.coordinates;
        const location = britishNationalGridToWgs84(coords[0], coords[1]);
        const elevation = Number.parseFloat(feature.properties[FIELD_NAMES.peakElevation]);
        const sourceZ = Number.parseFloat(coords[2]);
        const displayZ = Number.isFinite(sourceZ) ? sourceZ : elevation;

        return {
          id: index + 1,
          name: feature.properties[FIELD_NAMES.peakName],
          elevation,
          sourceZ: displayZ,
          mapZ: displayZ * HILLTOP_Z_EXAGGERATION,
          longitude: location.longitude,
          latitude: location.latitude
        };
      })
      .sort((a, b) => b.elevation - a.elevation);

    const graphics = hills.map((hill) => new Graphic({
      geometry: new Point({
        longitude: hill.longitude,
        latitude: hill.latitude,
        z: hill.mapZ,
        spatialReference: { wkid: WKID.output }
      }),
      attributes: {
        [CLIENT_FIELD_NAMES.objectId]: hill.id,
        [CLIENT_FIELD_NAMES.name]: hill.name,
        [CLIENT_FIELD_NAMES.elevation]: hill.elevation,
        [CLIENT_FIELD_NAMES.sourceZ]: hill.sourceZ,
        [CLIENT_FIELD_NAMES.mapZ]: hill.mapZ
      }
    }));

    return {
      hills,
      graphics,
      extent: extentFromHills(hills)
    };
  }

  function renderHillTable(hills) {
    const contentDiv = document.getElementById("contentDiv");

    contentDiv.innerHTML = `
      <h1>Shropshire Hill Tops</h1>
      <div class="hill-table-wrap">
        <table class="hill-table">
          <thead>
            <tr>
              <th scope="col">Hill</th>
              <th scope="col">Elevation</th>
            </tr>
          </thead>
          <tbody>
            ${hills.map((hill) => `
              <tr>
                <td><a href="#" data-hill-id="${hill.id}">${escapeHtml(hill.name)}</a></td>
                <td>${formatElevation(hill.elevation)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    contentDiv.querySelectorAll("[data-hill-id]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const hill = hills.find((candidate) => candidate.id === Number(link.dataset.hillId));
        if (hill) {
          zoomToHill(hill);
        }
      });
    });
  }

  function updateViewPadding() {
    const contentDiv = document.getElementById("contentDiv");
    const header = document.querySelector(".page-header");
    const footer = document.querySelector(".page-footer");
    const panelWidth = contentDiv ? Math.ceil(contentDiv.getBoundingClientRect().width) : 0;
    const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
    const footerHeight = footer ? Math.ceil(footer.getBoundingClientRect().height) : 0;

    view.padding = {
      top: headerHeight,
      right: panelWidth,
      bottom: footerHeight,
      left: 0
    };
  }

  function addResetButton() {
    const homeWidget = new Home({
      view,
      viewpoint: view.viewpoint.clone()
    });

    view.ui.add(homeWidget, "top-left");
  }

  function zoomToHill(hill) {
    view.goTo({
      target: new Point({
        longitude: hill.longitude,
        latitude: hill.latitude,
        z: hill.mapZ,
        spatialReference: { wkid: WKID.output }
      }),
      tilt: VIEW_SETTINGS.hillZoomTilt,
      scale: VIEW_SETTINGS.hillZoomScale
    }, {
      duration: VIEW_SETTINGS.goToDuration
    });
  }

  function getLinePaths(geometry, spatialReferenceWkid) {
    if (geometry.type === "LineString") {
      return [geometry.coordinates.map((coordinate) => convertCoordinate(coordinate, spatialReferenceWkid))];
    }

    if (geometry.type === "MultiLineString") {
      return geometry.coordinates.map((path) => path.map((coordinate) => convertCoordinate(coordinate, spatialReferenceWkid)));
    }

    throw new Error(`Unsupported line geometry type: ${geometry.type}`);
  }

  function convertCoordinate(coordinate, spatialReferenceWkid) {
    if (spatialReferenceWkid === WKID.worldMercator) {
      const location = worldMercatorToWgs84(coordinate[0], coordinate[1]);
      return [location.longitude, location.latitude, coordinate[2] ?? 0];
    }

    if (spatialReferenceWkid === WKID.output) {
      return coordinate;
    }

    throw new Error(`Unsupported spatial reference: EPSG:${spatialReferenceWkid}`);
  }

  function worldMercatorToWgs84(x, y) {
    const semiMajorAxis = WORLD_MERCATOR.semiMajorAxis;
    const eccentricity = WORLD_MERCATOR.eccentricity;
    const ts = Math.exp(-y / semiMajorAxis);
    let latitude = Math.PI / 2 - 2 * Math.atan(ts);

    for (let i = 0; i < WORLD_MERCATOR.inverseIterations; i++) {
      const con = eccentricity * Math.sin(latitude);
      latitude = Math.PI / 2 - 2 * Math.atan(ts * Math.pow((1 - con) / (1 + con), eccentricity / 2));
    }

    return {
      longitude: x / semiMajorAxis * 180 / Math.PI,
      latitude: latitude * 180 / Math.PI
    };
  }

  function britishNationalGridToWgs84(easting, northing) {
    const airy1830 = ELLIPSOIDS.airy1830;
    const nationalGrid = {
      f0: BRITISH_NATIONAL_GRID.f0,
      lat0: degreesToRadians(BRITISH_NATIONAL_GRID.lat0Degrees),
      lon0: degreesToRadians(BRITISH_NATIONAL_GRID.lon0Degrees),
      n0: BRITISH_NATIONAL_GRID.n0,
      e0: BRITISH_NATIONAL_GRID.e0
    };
    const e2 = 1 - Math.pow(airy1830.b, 2) / Math.pow(airy1830.a, 2);
    const n = (airy1830.a - airy1830.b) / (airy1830.a + airy1830.b);
    let lat = nationalGrid.lat0;
    let meridionalArc = 0;

    do {
      lat = (northing - nationalGrid.n0 - meridionalArc) / (airy1830.a * nationalGrid.f0) + lat;
      meridionalArc = calculateMeridionalArc(lat, nationalGrid.lat0, airy1830.b, nationalGrid.f0, n);
    } while (Math.abs(northing - nationalGrid.n0 - meridionalArc) >= BRITISH_NATIONAL_GRID.meridionalArcTolerance);

    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const tanLat = Math.tan(lat);
    const nu = airy1830.a * nationalGrid.f0 / Math.sqrt(1 - e2 * sinLat * sinLat);
    const rho = airy1830.a * nationalGrid.f0 * (1 - e2) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
    const eta2 = nu / rho - 1;
    const deltaEasting = easting - nationalGrid.e0;

    const vii = tanLat / (2 * rho * nu);
    const viii = tanLat / (24 * rho * Math.pow(nu, 3)) * (5 + 3 * tanLat * tanLat + eta2 - 9 * tanLat * tanLat * eta2);
    const ix = tanLat / (720 * rho * Math.pow(nu, 5)) * (61 + 90 * tanLat * tanLat + 45 * Math.pow(tanLat, 4));
    const x = 1 / (cosLat * nu);
    const xi = 1 / (6 * cosLat * Math.pow(nu, 3)) * (nu / rho + 2 * tanLat * tanLat);
    const xii = 1 / (120 * cosLat * Math.pow(nu, 5)) * (5 + 28 * tanLat * tanLat + 24 * Math.pow(tanLat, 4));
    const xiia = 1 / (5040 * cosLat * Math.pow(nu, 7)) * (61 + 662 * tanLat * tanLat + 1320 * Math.pow(tanLat, 4) + 720 * Math.pow(tanLat, 6));

    const osgbLat = lat - vii * Math.pow(deltaEasting, 2) + viii * Math.pow(deltaEasting, 4) - ix * Math.pow(deltaEasting, 6);
    const osgbLon = nationalGrid.lon0 + x * deltaEasting - xi * Math.pow(deltaEasting, 3) + xii * Math.pow(deltaEasting, 5) - xiia * Math.pow(deltaEasting, 7);

    return osgb36ToWgs84(osgbLat, osgbLon, 0);
  }

  function calculateMeridionalArc(lat, lat0, b, f0, n) {
    return b * f0 * (
      (1 + n + 5 / 4 * n * n + 5 / 4 * n * n * n) * (lat - lat0) -
      (3 * n + 3 * n * n + 21 / 8 * n * n * n) * Math.sin(lat - lat0) * Math.cos(lat + lat0) +
      (15 / 8 * n * n + 15 / 8 * n * n * n) * Math.sin(2 * (lat - lat0)) * Math.cos(2 * (lat + lat0)) -
      35 / 24 * n * n * n * Math.sin(3 * (lat - lat0)) * Math.cos(3 * (lat + lat0))
    );
  }

  function osgb36ToWgs84(lat, lon, height) {
    const airy1830 = ELLIPSOIDS.airy1830;
    const wgs84 = ELLIPSOIDS.wgs84;
    const transform = {
      tx: OSGB36_TO_WGS84.tx,
      ty: OSGB36_TO_WGS84.ty,
      tz: OSGB36_TO_WGS84.tz,
      s: OSGB36_TO_WGS84.scalePpm * 1e-6,
      rx: degreesToRadians(OSGB36_TO_WGS84.rxArcSeconds / 3600),
      ry: degreesToRadians(OSGB36_TO_WGS84.ryArcSeconds / 3600),
      rz: degreesToRadians(OSGB36_TO_WGS84.rzArcSeconds / 3600)
    };

    const cartesian = latLonToCartesian(lat, lon, height, airy1830);
    const transformed = {
      x: transform.tx + (1 + transform.s) * cartesian.x - transform.rz * cartesian.y + transform.ry * cartesian.z,
      y: transform.ty + transform.rz * cartesian.x + (1 + transform.s) * cartesian.y - transform.rx * cartesian.z,
      z: transform.tz - transform.ry * cartesian.x + transform.rx * cartesian.y + (1 + transform.s) * cartesian.z
    };

    return cartesianToLatLon(transformed, wgs84);
  }

  function latLonToCartesian(lat, lon, height, ellipsoid) {
    const e2 = 1 - Math.pow(ellipsoid.b, 2) / Math.pow(ellipsoid.a, 2);
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const nu = ellipsoid.a / Math.sqrt(1 - e2 * sinLat * sinLat);

    return {
      x: (nu + height) * cosLat * Math.cos(lon),
      y: (nu + height) * cosLat * Math.sin(lon),
      z: ((1 - e2) * nu + height) * sinLat
    };
  }

  function cartesianToLatLon(cartesian, ellipsoid) {
    const e2 = 1 - Math.pow(ellipsoid.b, 2) / Math.pow(ellipsoid.a, 2);
    const p = Math.sqrt(cartesian.x * cartesian.x + cartesian.y * cartesian.y);
    let lat = Math.atan2(cartesian.z, p * (1 - e2));
    let previousLat;

    do {
      previousLat = lat;
      const nu = ellipsoid.a / Math.sqrt(1 - e2 * Math.sin(lat) * Math.sin(lat));
      lat = Math.atan2(cartesian.z + e2 * nu * Math.sin(lat), p);
    } while (Math.abs(lat - previousLat) > 1e-12);

    return {
      longitude: radiansToDegrees(Math.atan2(cartesian.y, cartesian.x)),
      latitude: radiansToDegrees(lat)
    };
  }

  function extentFromHills(hills) {
    return new Extent({
      xmin: Math.min(...hills.map((hill) => hill.longitude)),
      ymin: Math.min(...hills.map((hill) => hill.latitude)),
      xmax: Math.max(...hills.map((hill) => hill.longitude)),
      ymax: Math.max(...hills.map((hill) => hill.latitude)),
      spatialReference: { wkid: WKID.output }
    });
  }

  function getNumericProperty(properties, fieldName) {
    if (!fieldName) {
      return null;
    }

    const value = properties[fieldName] ?? properties[fieldName.toLowerCase()];
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatElevation(elevation) {
    return `${Number.parseFloat(elevation).toLocaleString(undefined, {
      maximumFractionDigits: 1
    })} m`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
  }

  function radiansToDegrees(radians) {
    return radians * 180 / Math.PI;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp, { once: true });
} else {
  startApp();
}
