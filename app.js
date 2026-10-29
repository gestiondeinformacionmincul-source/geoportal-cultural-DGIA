/* Geoportal Cultural DGIA: infraestructura cultural y RENTOCA */
"use strict";

const ROOT_DATA = "datos/";
const FILES = {
  departments: "departamentos.geojson",
  provinces: "provincias_sim.geojson",
  districts: "distritos_sim.geojson",
  infrastructure: "infraestructura_cultural.csv",
  rentoca: "agentes_rentoca.csv"
};
const RENTOCACOLOR = "#A30262";

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

const $ = id => document.getElementById(id);
const fmt = n => Number(n || 0).toLocaleString("es-PE");

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

const clean = v => String(v ?? "").replace(/^\uFEFF/, "").trim();

const norm = v => clean(v)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, " ")
  .toLocaleUpperCase("es-PE");

function status(message) {
  $("statusMessage").textContent = message;
}

// ============================================================
// 1. LECTURA DE ARCHIVOS CSV Y GEOJSON
// ============================================================

function parseCSV(text) {
  // Parser CSV con separador punto y coma y soporte de comillas
  // y saltos de línea dentro de los campos.
  text = text.replace(/^\uFEFF/, "");

  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter =
    (firstLine.match(/;/g) || []).length >=
    (firstLine.match(/,/g) || []).length
      ? ";"
      : ",";

  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (c === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;

      row.push(field);

      if (row.some(x => clean(x) !== "")) {
        rows.push(row);
      }

      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  row.push(field);

  if (row.some(x => clean(x) !== "")) {
    rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows.shift().map(h => clean(h));

  return rows.map(values => {
    const obj = {};

    headers.forEach((h, i) => {
      obj[h] = clean(values[i] ?? "");
    });

    return obj;
  });
}

async function fetchText(file) {
  const r = await fetch(ROOT_DATA + file, {
    cache: "no-cache"
  });

  if (!r.ok) {
    throw new Error(`No se pudo leer ${file} (HTTP ${r.status}).`);
  }

  return r.text();
}

async function fetchJSON(file) {
  const r = await fetch(ROOT_DATA + file, {
    cache: "default"
  });

  if (!r.ok) {
    throw new Error(`No se pudo leer ${file} (HTTP ${r.status}).`);
  }

  return r.json();
}

// ============================================================
// 2. NORMALIZACIÓN DE ATRIBUTOS TERRITORIALES
// ============================================================

function firstProp(props, names) {
  for (const n of names) {
    if (
      props[n] !== undefined &&
      props[n] !== null &&
      clean(props[n]) !== ""
    ) {
      return props[n];
    }
  }

  const byNorm = {};

  Object.keys(props || {}).forEach(k => {
    byNorm[norm(k)] = props[k];
  });

  for (const n of names) {
    const val = byNorm[norm(n)];

    if (
      val !== undefined &&
      val !== null &&
      clean(val) !== ""
    ) {
      return val;
    }
  }

  return "";
}

function getDept(p) {
  return norm(firstProp(p, [
    "NOMBDEP",
    "DEPARTAMENTO",
    "Departamento",
    "DEPARTAMEN"
  ]));
}

function getProv(p) {
  return norm(firstProp(p, [
    "NOMBPROV",
    "PROVINCIA",
    "Provincia",
    "PROVIN"
  ]));
}

function getDist(p) {
  return norm(firstProp(p, [
    "NOMBDIST",
    "DISTRITO",
    "Distrito",
    "NOMBDISTRI"
  ]));
}

function getUbigeo(p) {
  const raw = clean(firstProp(p, [
    "UBIGEO",
    "ubigeo",
    "CODIGO",
    "IDDIST"
  ])).replace(/\D/g, "");

  return raw ? raw.padStart(6, "0").slice(-6) : "";
}

// ============================================================
// 3. VARIABLES Y CAPAS DEL MAPA
// ============================================================

const territory = {
  departments: {
    file: FILES.departments,
    name: "Departamentos",
    layer: null
  },
  provinces: {
    file: FILES.provinces,
    name: "Provincias",
    layer: null
  },
  districts: {
    file: FILES.districts,
    name: "Distritos",
    layer: null
  }
};

let geoData = {
  departments: null,
  provinces: null,
  districts: null
};

let infrastructure = [];
let rentocaRows = [];
let rentocaLayer = null;
let infrastructureLayer = L.layerGroup().addTo(map);

let territoryLayers = {
  departments: null,
  provinces: null,
  districts: null
};

let activeInfra = [];

// ============================================================
// 4. ESTILO DE LAS CAPAS TERRITORIALES
// ============================================================

function baseTerritoryStyle(level) {
  if (level === "departments") {
    return {
      color: "#7b526b",
      weight: 1.3,
      fillColor: "#e7d8e1",
      fillOpacity: 0.14
    };
  }

  if (level === "provinces") {
    return {
      color: "#9a6a86",
      weight: 0.8,
      fillColor: "#eadbe4",
      fillOpacity: 0.08
    };
  }

  return {
    color: "#9b8b96",
    weight: 0.45,
    fillColor: "#f2e8ee",
    fillOpacity: 0.035
  };
}

function territoryPopup(feature, layer, level) {
  const p = feature.properties || {};

  const d = getDept(p);
  const pr = getProv(p);
  const di = getDist(p);
  const u = getUbigeo(p);

  const bits = [];

  if (d) {
    bits.push(
      `<div><b>Departamento:</b> ${
        esc(firstProp(p, [
          "NOMBDEP",
          "DEPARTAMENTO",
          "Departamento"
        ]) || d)
      }</div>`
    );
  }

  if (pr && level !== "departments") {
    bits.push(
      `<div><b>Provincia:</b> ${
        esc(firstProp(p, [
          "NOMBPROV",
          "PROVINCIA",
          "Provincia"
        ]) || pr)
      }</div>`
    );
  }

  if (di && level === "districts") {
    bits.push(
      `<div><b>Distrito:</b> ${
        esc(firstProp(p, [
          "NOMBDIST",
          "DISTRITO",
          "Distrito"
        ]) || di)
      }</div>`
    );
  }

  if (u) {
    bits.push(`<div><b>UBIGEO:</b> ${esc(u)}</div>`);
  }

  layer.bindPopup(
    `<div class="territory-popup">${
      bits.join("") || "Unidad territorial"
    }</div>`
  );
}

async function loadTerritory(level) {
  if (geoData[level]) {
    return geoData[level];
  }

  const data = await fetchJSON(territory[level].file);

  if (
    !data ||
    data.type !== "FeatureCollection" ||
    !Array.isArray(data.features)
  ) {
    throw new Error(
      `${territory[level].file} no tiene estructura GeoJSON válida.`
    );
  }

  geoData[level] = data;

  return data;
}

// ============================================================
// 5. DATOS RENTOCA Y FILTROS TERRITORIALES
// ============================================================

function numberOf(v) {
  const s = clean(v)
    .replace(/\s/g, "")
    .replace(/,/g, "");

  const n = Number(s);

  return Number.isFinite(n) ? n : 0;
}

function rowDepartment(r) {
  return norm(r.DEPARTAMENTO);
}

function rowProvince(r) {
  return norm(r.PROVINCIA);
}

function rowDistrict(r) {
  return norm(r.DISTRITO);
}

function rowUbigeo(r) {
  const raw = clean(r.UBIGEO).replace(/\D/g, "");

  return raw ? raw.padStart(6, "0").slice(-6) : "";
}

function filteredRentocaRows() {
  const dept = norm($("departmentFilter").value);
  const prov = norm($("provinceFilter").value);
  const dist = norm($("districtFilter").value);

  return rentocaRows.filter(r =>
    (!dept || rowDepartment(r) === dept) &&
    (!prov || rowProvince(r) === prov) &&
    (!dist || rowDistrict(r) === dist)
  );
}

// ============================================================
// 6. AGRUPACIÓN DE REGISTROS RENTOCA
// ============================================================

function aggregateRentoca(level, rows = rentocaRows) {
  const totals = new Map();

  rows.forEach(r => {
    const qty = numberOf(r.Cantidad);
    const dept = rowDepartment(r);
    const prov = rowProvince(r);
    const dist = rowDistrict(r);

    if (level === "districts") {
      // Guardar las dos claves posibles: UBIGEO y nombres territoriales.
      // Esto permite trabajar aunque el GeoJSON no tenga una propiedad
      // UBIGEO reconocible.

      const ubigeo = rowUbigeo(r);
      const nameKey = `${dept}|${prov}|${dist}`;

      if (ubigeo) {
        totals.set(
          ubigeo,
          (totals.get(ubigeo) || 0) + qty
        );
      }

      if (nameKey.replace(/\|/g, "")) {
        totals.set(
          nameKey,
          (totals.get(nameKey) || 0) + qty
        );
      }
    } else if (level === "provinces") {
      const key = `${dept}|${prov}`;

      if (key !== "|") {
        totals.set(
          key,
          (totals.get(key) || 0) + qty
        );
      }
    } else if (dept) {
      totals.set(
        dept,
        (totals.get(dept) || 0) + qty
      );
    }
  });

  return totals;
}

function featureRentocaKey(feature, level) {
  const p = feature.properties || {};

  if (level === "districts") {
    const ub = getUbigeo(p);

    if (ub) return ub;

    return `${getDept(p)}|${getProv(p)}|${getDist(p)}`;
  }

  if (level === "provinces") {
    return `${getDept(p)}|${getProv(p)}`;
  }

  return getDept(p);
}

// ============================================================
// 7. DEGRADADO DE COLORES RENTOCA
// ============================================================

function interpolateColor(hex, t) {
  const target = hex.replace("#", "");

  const tr = [
    parseInt(target.slice(0, 2), 16),
    parseInt(target.slice(2, 4), 16),
    parseInt(target.slice(4, 6), 16)
  ];

  const start = [255, 247, 251];

  const rgb = start.map((s, i) =>
    Math.round(
      s + (tr[i] - s) * Math.max(0, Math.min(1, t))
    )
  );

  return "#" + rgb.map(v =>
    v.toString(16).padStart(2, "0")
  ).join("");
}

function shadeFor(value, max) {
  if (!value || max <= 0) {
    return "#f7f4f6";
  }

  // Transformación logarítmica para distinguir también
  // los territorios con cantidades pequeñas.
  const t = Math.log1p(value) / Math.log1p(max);

  return interpolateColor(RENTOCACOLOR, t);
}

function updateLegend(values) {
  const positive = values
    .filter(v => v > 0)
    .sort((a, b) => a - b);

  const min = positive.length ? positive[0] : 0;
  const max = positive.length
    ? positive[positive.length - 1]
    : 0;

  $("legendMin").textContent = `Mín.: ${fmt(min)}`;
  $("legendMax").textContent = `Máx.: ${fmt(max)}`;
}

// ============================================================
// 8. DIBUJAR EL DEGRADADO RENTOCA CON FILTROS TERRITORIALES
// ============================================================

async function renderRentocaLayer() {
  const enabled = $("layerRentoca").checked;

  if (rentocaLayer && map.hasLayer(rentocaLayer)) {
    map.removeLayer(rentocaLayer);
  }

  rentocaLayer = null;

  if (!enabled) return;

  const deptSelected = norm($("departmentFilter").value);
  const provSelected = norm($("provinceFilter").value);
  const distSelected = norm($("districtFilter").value);

  // Si existe un filtro territorial, usar el nivel correspondiente:
  // distrito seleccionado -> distritos;
  // provincia seleccionada -> provincias;
  // departamento seleccionado -> departamentos.
  //
  // Si no hay filtros, se respeta el nivel del selector RENTOCA.

  const level = distSelected
    ? "districts"
    : provSelected
      ? "provinces"
      : deptSelected
        ? "departments"
        : $("rentocaLevel").value;

  status(
    `Preparando degradado RENTOCA por ${
      territory[level].name.toLowerCase()
    }...`
  );

  try {
    // Esperar la carga del GeoJSON antes de procesarlo.
    const data = await loadTerritory(level);

    const selectedRows = filteredRentocaRows();
    const totals = aggregateRentoca(level, selectedRows);

    function isInSelectedTerritory(feature) {
      const p = feature.properties || {};

      const dept = getDept(p);
      const prov = getProv(p);
      const dist = getDist(p);

      // Nivel departamento.
      if (level === "departments" && deptSelected) {
        return dept === deptSelected;
      }

      // Nivel provincia.
      if (level === "provinces" && provSelected) {
        return (
          prov === provSelected &&
          (!deptSelected || dept === deptSelected)
        );
      }

      // Nivel distrito.
      if (level === "districts" && distSelected) {
        const selectedRowsWithUbigeo = selectedRows
          .map(rowUbigeo)
          .filter(Boolean);

        const featureUbigeo = getUbigeo(p);

        if (
          featureUbigeo &&
          selectedRowsWithUbigeo.length
        ) {
          return selectedRowsWithUbigeo.includes(
            featureUbigeo
          );
        }

        return (
          dist === distSelected &&
          (!provSelected || prov === provSelected) &&
          (!deptSelected || dept === deptSelected)
        );
      }

      // Cuando se selecciona un nivel diferente del más específico,
      // respetar los filtros que estén activos.
      if (deptSelected && dept !== deptSelected) {
        return false;
      }

      if (provSelected && prov !== provSelected) {
        return false;
      }

      if (distSelected && dist !== distSelected) {
        return false;
      }

      return true;
    }

    // Calcular el máximo solo dentro del territorio seleccionado,
    // para que la escala de colores responda a los filtros activos.
    const visibleValues = [];

    data.features.forEach(feature => {
      if (!isInSelectedTerritory(feature)) return;

      const key = featureRentocaKey(feature, level);
      const value = totals.get(key) || 0;

      if (value > 0) {
        visibleValues.push(value);
      }
    });

    const maxValue = Math.max(0, ...visibleValues);

    updateLegend(visibleValues);

    const hasFilter = Boolean(
      deptSelected || provSelected || distSelected
    );

    rentocaLayer = L.geoJSON(data, {
      style: feature => {
        const inside = isInSelectedTerritory(feature);

        const value = inside
          ? (totals.get(featureRentocaKey(feature, level)) || 0)
          : 0;

        const hasValue = inside && value > 0;

        return {
          color: hasValue ? "#6b244d" : "#d6cfd4",

          weight:
            level === "departments"
              ? 1.2
              : level === "provinces"
                ? 0.65
                : 0.4,

          fillColor: hasValue
            ? shadeFor(value, maxValue)
            : "#eee9ed",

          fillOpacity: hasValue
            ? 0.86
            : (hasFilter ? 0.035 : 0.24),

          opacity: hasValue
            ? 0.9
            : (hasFilter ? 0.18 : 0.55)
        };
      },

      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};

        const dept =
          firstProp(p, [
            "NOMBDEP",
            "DEPARTAMENTO",
            "Departamento"
          ]) || getDept(p);

        const prov =
          firstProp(p, [
            "NOMBPROV",
            "PROVINCIA",
            "Provincia"
          ]) || getProv(p);

        const dist =
          firstProp(p, [
            "NOMBDIST",
            "DISTRITO",
            "Distrito"
          ]) || getDist(p);

        const inside = isInSelectedTerritory(feature);

        const value = inside
          ? (totals.get(featureRentocaKey(feature, level)) || 0)
          : 0;

        let title = dept;

        if (level === "provinces") {
          title = `${prov}, ${dept}`;
        }

        if (level === "districts") {
          title = `${dist}, ${prov}, ${dept}`;
        }

        layer.bindPopup(`
          <div class="popup-title">
            ${esc(title || territory[level].name)}
          </div>
          <div>
            <b>Agentes culturales inscritos en RENTOCA:</b>
            ${fmt(value)}
          </div>
          ${
            level === "districts"
              ? `<div><b>UBIGEO:</b> ${
                  esc(getUbigeo(p) || "No disponible")
                }</div>`
              : ""
          }
          ${
            !inside
              ? "<div>Fuera del ámbito territorial seleccionado.</div>"
              : ""
          }
        `);

        layer.bindTooltip(
          `${esc(title || "Territorio")}: ${fmt(value)} agentes`,
          { sticky: true }
        );
      }
    }).addTo(map);

    $("rentocaMetric").textContent = fmt(
      totalFilteredRentoca()
    );

    status(
      `Degradado RENTOCA cargado por ${
        territory[level].name.toLowerCase()
      }.`
    );

    applyTerritorialFilters();

  } catch (error) {
    console.error(error);

    status(
      `No se pudo cargar el degradado RENTOCA: ${error.message}`
    );
  }
}

// ============================================================
// 9. MÉTRICAS RENTOCA
// ============================================================

function totalFilteredRentoca() {
  const dept = norm($("departmentFilter").value);
  const prov = norm($("provinceFilter").value);
  const dist = norm($("districtFilter").value);

  return rentocaRows
    .filter(r =>
      (!dept || rowDepartment(r) === dept) &&
      (!prov || rowProvince(r) === prov) &&
      (!dist || rowDistrict(r) === dist)
    )
    .reduce((s, r) => s + numberOf(r.Cantidad), 0);
}

function updateRentocaMetric() {
  $("rentocaMetric").textContent = fmt(
    totalFilteredRentoca()
  );
}

// ============================================================
// 10. LISTAS DESPLEGABLES TERRITORIALES
// ============================================================

function propValue(row, key) {
  return clean(row[key]);
}

function fillSelect(select, values, placeholder) {
  const previous = select.value;

  select.innerHTML = "";

  const first = document.createElement("option");
  first.value = "";
  first.textContent = placeholder;

  select.appendChild(first);

  [...new Map(
    values
      .filter(Boolean)
      .map(v => [norm(v), v])
  ).values()]
    .sort((a, b) => a.localeCompare(b, "es"))
    .forEach(v => {
      const op = document.createElement("option");

      op.value = v;
      op.textContent = v;

      select.appendChild(op);
    });

  if ([...select.options].some(o => o.value === previous)) {
    select.value = previous;
  }
}

function updateTerritorialSelects() {
  const d = $("departmentFilter").value;
  const p = $("provinceFilter").value;

  const rows = rentocaRows.length
    ? rentocaRows
    : infrastructure;

  fillSelect(
    $("departmentFilter"),
    rows.map(r => r.DEPARTAMENTO || r.Departamento),
    "Todos los departamentos"
  );

  // Restaurar el departamento seleccionado.
  if (
    d &&
    [...$("departmentFilter").options].some(
      o => norm(o.value) === norm(d)
    )
  ) {
    $("departmentFilter").value = [
      ...$("departmentFilter").options
    ].find(o => norm(o.value) === norm(d)).value;
  }

  const chosenD = $("departmentFilter").value;

  const provRows = rows.filter(r =>
    !chosenD ||
    norm(r.DEPARTAMENTO || r.Departamento) === norm(chosenD)
  );

  fillSelect(
    $("provinceFilter"),
    provRows.map(r => r.PROVINCIA || r.Provincia),
    "Todas las provincias"
  );

  if (
    p &&
    [...$("provinceFilter").options].some(
      o => norm(o.value) === norm(p)
    )
  ) {
    $("provinceFilter").value = [
      ...$("provinceFilter").options
    ].find(o => norm(o.value) === norm(p)).value;
  }

  const chosenP = $("provinceFilter").value;

  const distRows = rows.filter(r =>
    (!chosenD ||
      norm(r.DEPARTAMENTO || r.Departamento) === norm(chosenD)) &&
    (!chosenP ||
      norm(r.PROVINCIA || r.Provincia) === norm(chosenP))
  );

  fillSelect(
    $("districtFilter"),
    distRows.map(r => r.DISTRITO || r.Distrito),
    "Todos los distritos"
  );

  $("provinceFilter").disabled = !chosenD;
  $("districtFilter").disabled = !chosenP;
}

// ============================================================
// 11. FILTROS DE INFRAESTRUCTURA CULTURAL
// ============================================================

function selectedTerritoryMatches(row) {
  const d = norm($("departmentFilter").value);
  const p = norm($("provinceFilter").value);
  const di = norm($("districtFilter").value);

  const rd = norm(row.Departamento || row.DEPARTAMENTO);
  const rp = norm(row.Provincia || row.PROVINCIA);
  const rdi = norm(row.Distrito || row.DISTRITO);

  return (
    (!d || rd === d) &&
    (!p || rp === p) &&
    (!di || rdi === di)
  );
}

function infraType(row) {
  return propValue(row, "Tipo de infraestructura principal");
}

function infraFunction(row) {
  return propValue(
    row,
    "¿Actualmente se encuentra en funcionamiento?"
  );
}

function infraName(row) {
  return propValue(row, "Nombre de la infraestructura");
}

function infraLat(row) {
  return Number(
    String(row.Latitud || "").replace(",", ".")
  );
}

function infraLon(row) {
  return Number(
    String(row.Longitud || "").replace(",", ".")
  );
}

function updateInfrastructureFilters() {
  fillSelect(
    $("typeFilter"),
    infrastructure.map(infraType),
    "Todos los tipos"
  );

  fillSelect(
    $("functionFilter"),
    infrastructure.map(infraFunction),
    "Todos los estados"
  );
}

// ============================================================
// 12. VENTANA EMERGENTE DE INFRAESTRUCTURAS
// ============================================================

function infraPopup(row) {
  const fields = [
    ["ID", "ID-INFRAESTRUCTURA"],
    ["Nombre", "Nombre de la infraestructura"],
    [
      "Funcionamiento",
      "¿Actualmente se encuentra en funcionamiento?"
    ],
    [
      "Tipo de infraestructura",
      "Tipo de infraestructura principal"
    ],
    ["Tipo de administración", "Tipo de administración"],
    [
      "Entidad administradora",
      "Entidad u organización administradora"
    ],
    ["Departamento", "Departamento"],
    ["Provincia", "Provincia"],
    ["Distrito", "Distrito"],
    ["Centro poblado", "Centro Poblado"],
    ["UBIGEO", "Ubigeo"],
    ["Dirección", "Direccion"],
    ["Referencia", "Referencia específica"],
    ["Teléfono", "Telefono"],
    ["Correo institucional 1", "Correo institucional 1"],
    ["Correo institucional 2", "Correo institucional 2"],
    ["Redes sociales", "Redes sociales institucionales"],
    ["Web", "Web"]
  ];

  return `
    <div class="territory-popup">
      ${
        fields
          .filter(([label, key]) => propValue(row, key))
          .map(([label, key]) => `
            <div>
              <strong>${esc(label)}:</strong>
              ${esc(propValue(row, key))}
            </div>
          `)
          .join("")
      }
    </div>
  `;
}

// ============================================================
// 13. ICONOS SEGÚN TIPO DE INFRAESTRUCTURA
// ============================================================

function infraIconForType(type) {
  const t = norm(type);

  const categories = [
    {
      words: ["ANFITEATRO"],
      emoji: "🎭",
      color: "#8E245D"
    },
    {
      words: ["TEATRO", "TEATRIN"],
      emoji: "🎭",
      color: "#8E245D"
    },
    {
      words: ["CENTRO CULTURAL"],
      emoji: "🏛️",
      color: "#245A8D"
    },
    {
      words: ["AUDITORIO"],
      emoji: "🎤",
      color: "#7650A6"
    },
    {
      words: ["CINE"],
      emoji: "🎬",
      color: "#C36A1B"
    },
    {
      words: ["BIBLIOTECA", "LIBRERIA"],
      emoji: "📚",
      color: "#287C68"
    },
    {
      words: ["ARCHIVO"],
      emoji: "🗂️",
      color: "#65758B"
    },
    {
      words: ["MUSEO"],
      emoji: "🏺",
      color: "#A35C32"
    },
    {
      words: ["GALERIA", "SALA DE EXPOSICION"],
      emoji: "🖼️",
      color: "#A13D77"
    },
    {
      words: ["CASA DE LA CULTURA"],
      emoji: "🏠",
      color: "#3E7D52"
    },
    {
      words: ["ESPACIO PUBLICO"],
      emoji: "🌳",
      color: "#4D8247"
    }
  ];

  const match = categories.find(category =>
    category.words.some(word => t.includes(word))
  );

  return match || {
    emoji: "📍",
    color: "#A30262"
  };
}

// Construye un marcador visual con el icono de su categoría.
function createInfrastructureMarker(row, lat, lon) {
  const category = infraIconForType(infraType(row));

  const icon = L.divIcon({
    className: "infra-map-icon-wrapper",

    html: `
      <span
        class="infra-map-icon"
        style="--infra-icon-color:${category.color}"
        title="${esc(
          infraType(row) || "Infraestructura cultural"
        )}"
      >${category.emoji}</span>
    `,

    iconSize: [34, 38],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32]
  });

  return L.marker([lat, lon], {
    icon,
    keyboard: true,
    title:
      infraName(row) ||
      infraType(row) ||
      "Infraestructura cultural"
  });
}

// ============================================================
// 14. MOSTRAR INFRAESTRUCTURAS Y TABLA DE RESULTADOS
// ============================================================

function renderInfrastructure() {
  const type = $("typeFilter").value;
  const func = $("functionFilter").value;

  // Los filtros territoriales también afectan la infraestructura.
  activeInfra = infrastructure.filter(row =>
    selectedTerritoryMatches(row) &&
    (!type || infraType(row) === type) &&
    (!func || infraFunction(row) === func)
  );

  infrastructureLayer.clearLayers();

  if ($("layerCulture").checked) {
    activeInfra.forEach(row => {
      const lat = infraLat(row);
      const lon = infraLon(row);

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      ) {
        return;
      }

      const marker = createInfrastructureMarker(
        row,
        lat,
        lon
      );

      marker.bindPopup(
        infraPopup(row),
        { maxWidth: 360 }
      );

      marker.bindTooltip(
        `${esc(infraName(row) || "Infraestructura cultural")} · ${
          esc(infraType(row) || "Tipo no especificado")
        }`,
        {
          direction: "top",
          offset: [0, -24]
        }
      );

      infrastructureLayer.addLayer(marker);
    });
  }

  // Actualizar indicadores y tabla con los mismos filtros.
  $("infraMetric").textContent = fmt(activeInfra.length);

  $("resultsSummary").textContent =
    `${fmt(activeInfra.length)} registros coinciden con los filtros seleccionados. ` +
    "Se muestran hasta 300 filas en la tabla.";

  const tbody = $("infraTable").querySelector("tbody");

  tbody.innerHTML = "";

  activeInfra.slice(0, 300).forEach(row => {
    const tr = document.createElement("tr");

    const values = [
      row["ID-INFRAESTRUCTURA"],
      row["Nombre de la infraestructura"],
      infraType(row),
      row.Departamento,
      row.Provincia,
      row.Distrito,
      infraFunction(row)
    ];

    values.forEach(value => {
      const td = document.createElement("td");
      td.textContent = clean(value);
      tr.appendChild(td);
    });

    tr.style.cursor = "pointer";
    tr.title = "Haz clic para ubicar la infraestructura en el mapa";

    tr.addEventListener("click", () => {
      const lat = infraLat(row);
      const lon = infraLon(row);

      if (
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lon) <= 180
      ) {
        map.setView([lat, lon], 15);

        infrastructureLayer.eachLayer(marker => {
          const ll = marker.getLatLng();

          if (
            Math.abs(ll.lat - lat) < 1e-7 &&
            Math.abs(ll.lng - lon) < 1e-7
          ) {
            marker.openPopup();
          }
        });
      } else {
        status(
          "Este registro no tiene coordenadas geográficas válidas."
        );
      }
    });

    tbody.appendChild(tr);
  });

  if (!activeInfra.length) {
    tbody.innerHTML =
      '<tr><td colspan="7">No hay registros que coincidan con los filtros.</td></tr>';
  }
}

// ============================================================
// 15. APLICAR FILTROS A LAS CAPAS TERRITORIALES
// ============================================================

function applyTerritorialFilters() {
  const d = norm($("departmentFilter").value);
  const p = norm($("provinceFilter").value);
  const di = norm($("districtFilter").value);

  Object.entries(territoryLayers).forEach(([level, layer]) => {
    if (!layer) return;

    layer.eachLayer(l => {
      const props = l.feature?.properties || {};

      const matches =
        (!d || !getDept(props) || getDept(props) === d) &&
        (!p || !getProv(props) || getProv(props) === p) &&
        (!di || !getDist(props) || getDist(props) === di);

      if (matches) {
        l.setStyle({
          opacity: 1,
          fillOpacity: level === "departments" ? 0.12 : 0.05
        });
      } else {
        l.setStyle({
          opacity: 0.08,
          fillOpacity: 0.005
        });
      }
    });
  });

  if (rentocaLayer) {
    // No se alteran los colores cuantitativos del degradado RENTOCA.
    // Los filtros territoriales se aplican a la capa RENTOCA
    // desde renderRentocaLayer().
  }

  updateRentocaMetric();
  renderInfrastructure();
}

// ============================================================
// 16. ACTIVAR Y DESACTIVAR CAPAS TERRITORIALES
// ============================================================

async function toggleTerritoryLayer(level, enabled) {
  if (!enabled) {
    if (
      territoryLayers[level] &&
      map.hasLayer(territoryLayers[level])
    ) {
      map.removeLayer(territoryLayers[level]);
    }

    return;
  }

  try {
    const data = await loadTerritory(level);

    const checkboxId =
      level === "departments"
        ? "layerDepartments"
        : level === "provinces"
          ? "layerProvinces"
          : "layerDistricts";

    if (!$(checkboxId).checked) return;

    if (!territoryLayers[level]) {
      territoryLayers[level] = L.geoJSON(data, {
        style: () => baseTerritoryStyle(level),

        onEachFeature: (f, l) => {
          territoryPopup(f, l, level);
        }
      });
    }

    territoryLayers[level].addTo(map);

    applyTerritorialFilters();

    status(
      `Capa ${territory[level].name.toLowerCase()} activada.`
    );

  } catch (e) {
    console.error(e);

    status(
      `Error al cargar ${territory[level].file}: ${e.message}`
    );
  }
}

// ============================================================
// 17. LIMPIAR FILTROS
// ============================================================

function resetFilters() {
  $("departmentFilter").value = "";

  updateTerritorialSelects();

  $("provinceFilter").value = "";
  $("districtFilter").value = "";
  $("typeFilter").value = "";
  $("functionFilter").value = "";

  applyTerritorialFilters();

  if ($("layerRentoca").checked) {
    renderRentocaLayer();
  }

  map.setView([-9.19, -75.015], 5);
}

// ============================================================
// 18. BÚSQUEDA DE INFRAESTRUCTURA Y TERRITORIOS
// ============================================================

function search() {
  const q = norm($("searchInput").value);

  if (!q) {
    status(
      "Escribe un nombre de infraestructura, ID o territorio."
    );
    return;
  }

  const r = activeInfra.find(x =>
    norm(infraName(x)).includes(q) ||
    norm(x["ID-INFRAESTRUCTURA"]).includes(q)
  );

  if (r) {
    const lat = infraLat(r);
    const lon = infraLon(r);

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      map.setView([lat, lon], 15);

      infrastructureLayer.eachLayer(m => {
        const ll = m.getLatLng();

        if (
          Math.abs(ll.lat - lat) < 1e-7 &&
          Math.abs(ll.lng - lon) < 1e-7
        ) {
          m.openPopup();
        }
      });
    }

    return;
  }

  const all = [
    ...Object.values(territoryLayers).filter(Boolean)
  ];

  const matches = [];

  all.forEach(l => {
    l.eachLayer(x => {
      const p = x.feature?.properties || {};

      if (
        Object.values(p).some(v => norm(v).includes(q))
      ) {
        matches.push(x);
      }
    });
  });

  if (matches.length) {
    const group = L.featureGroup(matches);
    const b = group.getBounds();

    if (b.isValid()) {
      map.fitBounds(b, {
        padding: [20, 20],
        maxZoom: 12
      });
    }

    matches[0].openPopup();

    status(
      `Coincidencias territoriales: ${matches.length}.`
    );

  } else {
    status(
      "No se encontraron coincidencias en los datos cargados."
    );
  }
}

// ============================================================
// 19. INICIALIZAR EL GEOPORTAL
// ============================================================

async function initialize() {
  try {
    status("Cargando bases CSV...");

    const [infraText, rentocaText] = await Promise.all([
      fetchText(FILES.infrastructure),
      fetchText(FILES.rentoca)
    ]);

    infrastructure = parseCSV(infraText);
    rentocaRows = parseCSV(rentocaText);

    if (!infrastructure.length) {
      throw new Error(
        "El CSV de infraestructura no contiene registros."
      );
    }

    if (!rentocaRows.length) {
      throw new Error(
        "El CSV RENTOCA no contiene registros."
      );
    }

    updateInfrastructureFilters();
    updateTerritorialSelects();
    renderInfrastructure();

    await toggleTerritoryLayer(
      "departments",
      true
    );

    await renderRentocaLayer();

    status(
      `Geoportal listo. Infraestructuras: ${
        fmt(infrastructure.length)
      } · filas territoriales RENTOCA: ${
        fmt(rentocaRows.length)
      }.`
    );

  } catch (e) {
    console.error(e);

    status(
      `No se pudieron cargar los datos: ${e.message} ` +
      "Revisa que los CSV estén en la carpeta datos/ y que sus nombres sean exactos."
    );
  }
}

// ============================================================
// 20. EVENTOS DE LOS FILTROS Y CONTROLES
// ============================================================

$("departmentFilter").addEventListener("change", () => {
  updateTerritorialSelects();
  applyTerritorialFilters();

  if ($("layerRentoca").checked) {
    renderRentocaLayer();
  }
});

$("provinceFilter").addEventListener("change", () => {
  updateTerritorialSelects();
  applyTerritorialFilters();

  if ($("layerRentoca").checked) {
    renderRentocaLayer();
  }
});

$("districtFilter").addEventListener("change", () => {
  applyTerritorialFilters();

  if ($("layerRentoca").checked) {
    renderRentocaLayer();
  }
});

$("typeFilter").addEventListener(
  "change",
  renderInfrastructure
);

$("functionFilter").addEventListener(
  "change",
  renderInfrastructure
);

$("layerCulture").addEventListener(
  "change",
  renderInfrastructure
);

$("layerRentoca").addEventListener("change", () => {
  renderRentocaLayer().catch(e => {
    console.error(e);
    status(e.message);
  });
});

$("rentocaLevel").addEventListener("change", () => {
  renderRentocaLayer().catch(e => {
    console.error(e);
    status(e.message);
  });
});

$("layerDepartments").addEventListener("change", e => {
  toggleTerritoryLayer(
    "departments",
    e.target.checked
  );
});

$("layerProvinces").addEventListener("change", e => {
  toggleTerritoryLayer(
    "provinces",
    e.target.checked
  );
});

$("layerDistricts").addEventListener("change", e => {
  toggleTerritoryLayer(
    "districts",
    e.target.checked
  );
});

$("clearFilters").addEventListener(
  "click",
  resetFilters
);

$("searchButton").addEventListener(
  "click",
  search
);

$("searchInput").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    search();
  }
});

$("homeButton").addEventListener("click", () => {
  map.setView([-9.19, -75.015], 5);
  status("Vista general del Perú.");
});

$("locateButton").addEventListener("click", () => {
  if (!navigator.geolocation) {
    status(
      "Este navegador no permite consultar la ubicación."
    );
    return;
  }

  status("Solicitando permiso de ubicación...");

  navigator.geolocation.getCurrentPosition(
    pos => {
      const ll = [
        pos.coords.latitude,
        pos.coords.longitude
      ];

      map.setView(ll, 12);

      L.circleMarker(ll, {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: RENTOCACOLOR,
        fillOpacity: 1
      })
        .addTo(map)
        .bindPopup(
          "Ubicación autorizada por el navegador"
        )
        .openPopup();
    },

    () => {
      status(
        "No se obtuvo la ubicación. Verifica los permisos del navegador."
      );
    },

    { timeout: 8000 }
  );
});

map.on("mousemove", e => {
  $("coordinateReadout").textContent =
    `Lat ${e.latlng.lat.toFixed(4)} · Lon ${e.latlng.lng.toFixed(4)}`;
});

// Iniciar la aplicación.
initialize();
