
/*
 * Geoportal Cultural - Dirección General de Industrias
 * Culturales y Artes (DGIA)
 *
 * Los puntos de infraestructura cultural son demostrativos.
 * Las capas territoriales se leen desde archivos GeoJSON.
 */

"use strict";

// --------------------------------------------------
// 1. MAPA BASE
// --------------------------------------------------

const map = L.map("map", {
  center: [-9.19, -75.015],
  zoom: 5,
  minZoom: 4,
  worldCopyJump: true
});

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// --------------------------------------------------
// 2. FUNCIONES GENERALES
// --------------------------------------------------

function setStatus(message) {
  document.getElementById("statusMessage").textContent = message;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

// --------------------------------------------------
// 3. ESTILOS DE LAS CAPAS TERRITORIALES
// --------------------------------------------------

const territoryStyles = {
  departments: {
    color: "#174b70",
    weight: 2,
    fillColor: "#6ba6c8",
    fillOpacity: 0.10
  },
  provinces: {
    color: "#287c91",
    weight: 1,
    fillColor: "#78c6c1",
    fillOpacity: 0.06
  },
  districts: {
    color: "#697b8c",
    weight: 0.5,
    fillColor: "#c5d3df",
    fillOpacity: 0.025
  }
};

// Se guardan las capas una vez cargadas para no descargarlas
// nuevamente cada vez que se activa una casilla.
const territorialLayers = {
  departments: {
    file: "departamentos.geojson",
    name: "Departamentos",
    style: territoryStyles.departments,
    layer: null,
    loading: null
  },
  provinces: {
    file: "provincias_sim.geojson",
    name: "Provincias",
    style: territoryStyles.provinces,
    layer: null,
    loading: null
  },
  districts: {
    file: "distritos_sim.geojson",
    name: "Distritos",
    style: territoryStyles.districts,
    layer: null,
    loading: null
  }
};

// --------------------------------------------------
// 4. POPUPS DE LAS UNIDADES TERRITORIALES
// --------------------------------------------------

function bindTerritoryPopup(feature, layer) {
  const properties = feature.properties || {};
  const entries = Object.entries(properties);

  if (!entries.length) {
    layer.bindPopup("Unidad territorial");
    return;
  }

  const content = entries.slice(0, 12).map(([key, value]) => {
    return `<div><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</div>`;
  }).join("");

  layer.bindPopup(`<div class="territory-popup">${content}</div>`);
}

// --------------------------------------------------
// 5. CARGA DE ARCHIVOS GEOJSON
// --------------------------------------------------

async function loadTerritorialLayer(key) {
  const config = territorialLayers[key];

  if (config.layer) {
    return config.layer;
  }

  if (config.loading) {
    return config.loading;
  }

  config.loading = (async () => {
    const url = `datos/${config.file}`;

    const response = await fetch(url, { cache: "default" });

    if (!response.ok) {
      throw new Error(
        `No se pudo leer ${config.file}. Código HTTP: ${response.status}`
      );
    }

    const data = await response.json();

    if (
      !data ||
      data.type !== "FeatureCollection" ||
      !Array.isArray(data.features)
    ) {
      throw new Error(
        `El archivo ${config.file} no tiene una estructura GeoJSON válida.`
      );
    }

    const layer = L.geoJSON(data, {
      style: () => config.style,
      onEachFeature: bindTerritoryPopup
    });

    config.layer = layer;
    return layer;
  })();

  try {
    return await config.loading;
  } finally {
    config.loading = null;
  }
}

async function toggleTerritorialLayer(key, enabled) {
  const config = territorialLayers[key];

  if (!enabled) {
    if (config.layer && map.hasLayer(config.layer)) {
      map.removeLayer(config.layer);
    }

    setStatus(`Capa de ${config.name.toLowerCase()} desactivada.`);
    return;
  }

  setStatus(`Cargando capa de ${config.name.toLowerCase()}...`);

  try {
    const layer = await loadTerritorialLayer(key);

    // Comprobar nuevamente la casilla por si el usuario la desactivó
    // mientras se descargaba el archivo.
    const checkbox = document.getElementById(
      key === "departments"
        ? "layerDepartments"
        : key === "provinces"
          ? "layerProvinces"
          : "layerDistricts"
    );

    if (!checkbox.checked) {
      return;
    }

    layer.addTo(map);
    setStatus(
      `Capa de ${config.name.toLowerCase()} cargada correctamente. ` +
      `Elementos: ${layer.getLayers().length.toLocaleString("es-PE")}.`
    );
  } catch (error) {
    console.error(`Error en capa ${config.name}:`, error);
    setStatus(
      `Error al cargar ${config.name}. Verifica el archivo ` +
      `datos/${config.file} y consulta la consola del navegador.`
    );

    // No dejar activada una casilla cuya capa no pudo cargarse.
    const checkbox = document.getElementById(
      key === "departments"
        ? "layerDepartments"
        : key === "provinces"
          ? "layerProvinces"
          : "layerDistricts"
    );

    checkbox.checked = false;
  }
}

// Departamentos se cargan al iniciar; provincias y distritos,
// únicamente cuando se solicitan.
document.getElementById("layerDepartments").addEventListener(
  "change",
  event => toggleTerritorialLayer("departments", event.target.checked)
);

document.getElementById("layerProvinces").addEventListener(
  "change",
  event => toggleTerritorialLayer("provinces", event.target.checked)
);

document.getElementById("layerDistricts").addEventListener(
  "change",
  event => toggleTerritorialLayer("districts", event.target.checked)
);

// --------------------------------------------------
// 6. CIUDADES DE REFERENCIA
// --------------------------------------------------

const cities = [
  { name: "Lima", type: "Capital de referencia", coords: [-12.0464, -77.0428] },
  { name: "Cusco", type: "Ciudad de referencia", coords: [-13.5319, -71.9675] },
  { name: "Arequipa", type: "Ciudad de referencia", coords: [-16.4090, -71.5375] },
  { name: "Trujillo", type: "Ciudad de referencia", coords: [-8.1116, -79.0287] },
  { name: "Iquitos", type: "Ciudad de referencia", coords: [-3.7491, -73.2538] },
  { name: "Pucallpa", type: "Ciudad de referencia", coords: [-8.3791, -74.5539] },
  { name: "Huancayo", type: "Ciudad de referencia", coords: [-12.0651, -75.2049] },
  { name: "Puno", type: "Ciudad de referencia", coords: [-15.8402, -70.0219] }
];

const cityLayer = L.layerGroup();

cities.forEach(place => {
  const marker = L.circleMarker(place.coords, {
    radius: 5,
    color: "#ffffff",
    weight: 1.5,
    fillColor: "#7a78bb",
    fillOpacity: 0.95
  });

  marker.bindPopup(
    `<div class="popup-title">${escapeHtml(place.name)}</div>` +
    `<div class="popup-type">${escapeHtml(place.type)}</div>`
  );

  marker.bindTooltip(place.name);
  cityLayer.addLayer(marker);
});

cityLayer.addTo(map);

document.getElementById("layerCities").addEventListener(
  "change",
  event => {
    if (event.target.checked) {
      cityLayer.addTo(map);
    } else {
      map.removeLayer(cityLayer);
    }
  }
);

// --------------------------------------------------
// 7. PUNTOS CULTURALES DEMOSTRATIVOS
// --------------------------------------------------

// Estos puntos son ejemplos de funcionamiento, no datos oficiales.
const culturalDemo = [
  {
    name: "Punto cultural demostrativo 01",
    type: "Ejemplo de infraestructura",
    city: "Lima",
    coords: [-12.055, -77.035]
  },
  {
    name: "Punto cultural demostrativo 02",
    type: "Ejemplo de infraestructura",
    city: "Cusco",
    coords: [-13.525, -71.970]
  },
  {
    name: "Punto cultural demostrativo 03",
    type: "Ejemplo de infraestructura",
    city: "Arequipa",
    coords: [-16.398, -71.536]
  },
  {
    name: "Punto cultural demostrativo 04",
    type: "Ejemplo de infraestructura",
    city: "Trujillo",
    coords: [-8.115, -79.030]
  }
];

const cultureLayer = L.layerGroup();

culturalDemo.forEach(place => {
  const marker = L.circleMarker(place.coords, {
    radius: 7,
    color: "#ffffff",
    weight: 1.5,
    fillColor: "#d49a42",
    fillOpacity: 0.95
  });

  marker.bindPopup(
    `<div class="popup-title">${escapeHtml(place.name)}</div>` +
    `<div class="popup-type">${escapeHtml(place.type)}</div>` +
    `<div class="popup-type">Ubicación de ejemplo: ${escapeHtml(place.city)}</div>`
  );

  cultureLayer.addLayer(marker);
});

cultureLayer.addTo(map);

document.getElementById("layerCulture").addEventListener(
  "change",
  event => {
    if (event.target.checked) {
      cultureLayer.addTo(map);
    } else {
      map.removeLayer(cultureLayer);
    }
  }
);

// --------------------------------------------------
// 8. BÚSQUEDA DE CIUDADES Y TERRITORIOS
// --------------------------------------------------

function searchPlaces() {
  const query = document.getElementById("searchInput")
    .value.trim().toLocaleLowerCase("es");

  if (!query) {
    setStatus("Escribe el nombre de una ciudad o territorio.");
    return;
  }

  const cityMatches = cities.filter(place =>
    `${place.name} ${place.type}`.toLocaleLowerCase("es").includes(query)
  );

  if (cityMatches.length) {
    const bounds = L.latLngBounds(
      cityMatches.map(place => place.coords)
    );

    if (cityMatches.length === 1) {
      map.setView(cityMatches[0].coords, 10);
      cityLayer.eachLayer(marker => {
        const place = cities.find(item =>
          marker.getLatLng().equals(item.coords)
        );

        if (place && place.name === cityMatches[0].name) {
          marker.openPopup();
        }
      });
    } else {
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 10 });
    }

    setStatus(`Ciudades encontradas: ${cityMatches.length}.`);
    return;
  }

  // Buscar en las propiedades de las capas que ya estén cargadas.
  const loadedLayers = Object.values(territorialLayers)
    .filter(config => config.layer);

  const matchingFeatures = [];

  loadedLayers.forEach(config => {
    config.layer.eachLayer(layer => {
      const properties = layer.feature?.properties || {};
      const text = Object.values(properties).join(" ")
        .toLocaleLowerCase("es");

      if (text.includes(query)) {
        matchingFeatures.push(layer);
      }
    });
  });

  if (!matchingFeatures.length) {
    setStatus(
      "No se encontraron coincidencias. Activa la capa territorial " +
      "correspondiente o prueba con otro nombre."
    );
    return;
  }

  const bounds = L.featureGroup(matchingFeatures).getBounds();

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    matchingFeatures[0].openPopup();
  }

  setStatus(`Unidades territoriales encontradas: ${matchingFeatures.length}.`);
}

document.getElementById("searchButton").addEventListener(
  "click",
  searchPlaces
);

document.getElementById("searchInput").addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") {
      searchPlaces();
    }
  }
);

// --------------------------------------------------
// 9. VISTA INICIAL
// --------------------------------------------------

document.getElementById("homeButton").addEventListener("click", () => {
  const departments = territorialLayers.departments.layer;

  if (departments && map.hasLayer(departments)) {
    map.fitBounds(departments.getBounds(), { padding: [15, 15] });
  } else {
    map.setView([-9.19, -75.015], 5);
  }

  setStatus("Se restableció la vista general del Perú.");
});

// --------------------------------------------------
// 10. UBICACIÓN DEL USUARIO
// --------------------------------------------------

document.getElementById("locateButton").addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Este navegador no permite consultar la ubicación.");
    return;
  }

  setStatus("Solicitando permiso de ubicación al navegador...");

  navigator.geolocation.getCurrentPosition(
    position => {
      const coords = [
        position.coords.latitude,
        position.coords.longitude
      ];

      map.setView(coords, 12);

      L.circleMarker(coords, {
        radius: 8,
        color: "#ffffff",
        weight: 2,
        fillColor: "#2b837d",
        fillOpacity: 1
      })
        .addTo(map)
        .bindPopup("Ubicación indicada por tu navegador")
        .openPopup();

      setStatus("Se mostró la ubicación autorizada en este dispositivo.");
    },
    () => {
      setStatus(
        "No se obtuvo la ubicación. Verifica los permisos del navegador."
      );
    },
    { enableHighAccuracy: false, timeout: 8000 }
  );
});

// --------------------------------------------------
// 11. COORDENADAS DEL CURSOR
// --------------------------------------------------

map.on("mousemove", event => {
  document.getElementById("coordinateReadout").textContent =
    `Lat ${event.latlng.lat.toFixed(4)} · Lon ${event.latlng.lng.toFixed(4)}`;
});

// --------------------------------------------------
// 12. INICIO
// --------------------------------------------------

(async function initializeGeoportal() {
  try {
    await toggleTerritorialLayer("departments", true);
  } catch (error) {
    console.error(error);
  }

  setStatus(
    "Geoportal Cultural DGIA listo. Los puntos culturales son demostrativos."
  );
})();

