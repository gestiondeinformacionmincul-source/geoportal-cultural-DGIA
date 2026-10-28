/* Geoportal Cultural del Perú
   Prototipo público. Los puntos culturales son demostrativos,
   no constituyen un registro oficial.
*/
"use strict";

const map = L.map("map", {
  center: [-9.19, -75.015],
  zoom: 5,
  minZoom: 4,
  worldCopyJump: true
});

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// Referencias generales de ciudades. No son capas oficiales de límites.
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

// Puntos ficticios únicamente para demostrar cómo se verán futuras capas.
// Reemplazar por datos oficiales y validados antes de presentarlos como reales.
const culturalDemo = [
  { name: "Punto cultural demostrativo 01", type: "Ejemplo de infraestructura", city: "Lima", coords: [-12.055, -77.035] },
  { name: "Punto cultural demostrativo 02", type: "Ejemplo de infraestructura", city: "Cusco", coords: [-13.525, -71.970] },
  { name: "Punto cultural demostrativo 03", type: "Ejemplo de infraestructura", city: "Arequipa", coords: [-16.398, -71.536] },
  { name: "Punto cultural demostrativo 04", type: "Ejemplo de infraestructura", city: "Trujillo", coords: [-8.115, -79.030] }
];

const cityLayer = L.layerGroup();
cities.forEach(place => {
  const marker = L.circleMarker(place.coords, {
    radius: 5,
    color: "#fff",
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

const cultureLayer = L.layerGroup();
culturalDemo.forEach(place => {
  const marker = L.circleMarker(place.coords, {
    radius: 7,
    color: "#fff",
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

// Activar/desactivar capas.
document.getElementById("layerDepartments").addEventListener("change", event => {
  // La capa oficial de límites se conectará desde QGIS/GeoServer.
  setStatus(event.target.checked
    ? "La capa de límites departamentales reales se incorporará en la siguiente fase."
    : "La visualización de límites oficiales está pendiente de conexión.");
});

document.getElementById("layerCulture").addEventListener("change", event => {
  if (event.target.checked) cultureLayer.addTo(map);
  else map.removeLayer(cultureLayer);
});

document.getElementById("layerCities").addEventListener("change", event => {
  if (event.target.checked) cityLayer.addTo(map);
  else map.removeLayer(cityLayer);
});

function setStatus(message) {
  document.getElementById("statusMessage").textContent = message;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

// Búsqueda local entre ciudades y puntos demostrativos.
function searchPlaces() {
  const query = document.getElementById("searchInput").value.trim().toLocaleLowerCase("es");
  if (!query) {
    setStatus("Escribe el nombre de una ciudad o un término de búsqueda.");
    return;
  }

  const matches = [
    ...cities.map(p => ({ ...p, group: "Ciudad" })),
    ...culturalDemo.map(p => ({ ...p, group: "Punto demostrativo" }))
  ].filter(p =>
    `${p.name} ${p.type} ${p.city || ""}`.toLocaleLowerCase("es").includes(query)
  );

  if (!matches.length) {
    setStatus("No hay coincidencias en los datos demostrativos. La búsqueda se conectará a las capas oficiales en la siguiente fase.");
    return;
  }

  if (matches.length === 1) {
    map.setView(matches[0].coords, 11);
  } else {
    const bounds = L.latLngBounds(matches.map(p => p.coords));
    map.fitBounds(bounds, { padding: [35, 35], maxZoom: 10 });
  }
  setStatus(`Coincidencias en datos demostrativos: ${matches.length}.`);
}

document.getElementById("searchButton").addEventListener("click", searchPlaces);
document.getElementById("searchInput").addEventListener("keydown", event => {
  if (event.key === "Enter") searchPlaces();
});

document.getElementById("homeButton").addEventListener("click", () => {
  map.setView([-9.19, -75.015], 5);
  setStatus("Se restableció la vista general del Perú.");
});

document.getElementById("locateButton").addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Este navegador no permite consultar la ubicación.");
    return;
  }
  setStatus("Solicitando permiso de ubicación al navegador...");
  navigator.geolocation.getCurrentPosition(
    position => {
      const coords = [position.coords.latitude, position.coords.longitude];
      map.setView(coords, 12);
      L.circleMarker(coords, {
        radius: 8, color: "#fff", weight: 2, fillColor: "#2b837d", fillOpacity: 1
      }).addTo(map).bindPopup("Ubicación indicada por tu navegador").openPopup();
      setStatus("Se mostró la ubicación autorizada en este dispositivo.");
    },
    () => setStatus("No se obtuvo la ubicación. Verifica los permisos del navegador."),
    { enableHighAccuracy: false, timeout: 8000 }
  );
});

map.on("mousemove", event => {
  document.getElementById("coordinateReadout").textContent =
    `Lat ${event.latlng.lat.toFixed(4)} · Lon ${event.latlng.lng.toFixed(4)}`;
});

setStatus("Visor inicial listo. Los puntos culturales son demostrativos.");
