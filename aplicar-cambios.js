// Uso: poner este archivo junto a index.html y ejecutar:  node aplicar-cambios.js
// Crea index.nuevo.html con los cambios. No modifica index.html.
const fs = require("fs");

const entrada = "index.html";
const salida = "index.nuevo.html";
if (!fs.existsSync(entrada)) {
  console.log("No encuentro index.html en esta carpeta.");
  process.exit(1);
}

let src = fs.readFileSync(entrada, "utf8");
const crlf = src.includes("\r\n");
if (crlf) src = src.replace(/\r\n/g, "\n");

let fallos = 0;
function cambiar(nombre, patron, nuevo) {
  if (src.search(patron) === -1) {
    console.log("✗ No encontré: " + nombre);
    fallos++;
    return;
  }
  src = src.replace(patron, () => nuevo);
  console.log("✓ " + nombre);
}

// 1. Variables globales
cambiar("variables globales", /let variableMapa = "POBTOT";/,
`let variableMapa = "POBTOT";
let radioMetros = 1000;
let arrastrandoAsa = false;
let tsFinAsa = 0;`);

// 2. CSS del punto arrastrable
cambiar("CSS del punto", /\.radio-etiqueta-mapa \{/,
`.asa-radio { width:20px; height:20px; border-radius:50%; background:#fff; border:3px solid #00d5ff;
    box-shadow:0 1px 6px rgba(0,0,0,.6); cursor:ew-resize; touch-action:none; }
  .radio-etiqueta-mapa {`);

// 3. Menú de radio: sin personalización y con la tabla visible
cambiar("menú de radio (HTML)",
  /<details class="panel" id="menu-radio">[\s\S]*?<\/details>\s*<\/div>\s*<\/details>/,
`<details class="panel" id="menu-radio">
    <summary>Radio de análisis</summary>
    <div class="contenido">
      <div class="radios-presets" role="group" aria-label="Radios predeterminados">
        <button type="button" class="radio-preset" data-radio-preset="250" aria-pressed="false">250 m</button>
        <button type="button" class="radio-preset" data-radio-preset="500" aria-pressed="false">500 m</button>
        <button type="button" class="radio-preset activo" data-radio-preset="1000" aria-pressed="true">1 km</button>
        <button type="button" class="radio-preset" data-radio-preset="2000" aria-pressed="false">2 km</button>
        <button type="button" class="radio-preset" data-radio-preset="5000" aria-pressed="false">5 km</button>
      </div>
      <p id="resumen-radio" class="resumen">Haz clic en el mapa para dibujar el radio.</p>
      <p class="menu-ayuda">Arrastra el punto blanco del borde del círculo para cambiar su tamaño.</p>
      <table id="tabla-radio" class="tabla-datos"></table>
    </div>
  </details>`);

// 4. Punto arrastrable + funciones de radio
cambiar("funciones de radio y punto arrastrable",
  /function actualizarControlRadio\(metros\) \{[\s\S]*?(?=function mostrarManzana\(\) \{)/,
`const asaRadio = document.createElement("div");
  asaRadio.className = "asa-radio";
  asaRadio.title = "Arrastra para cambiar el radio";
  asaRadio.addEventListener("click", (e) => e.stopPropagation());
  const marcadorAsa = new maplibregl.Marker({ element: asaRadio, draggable: true });

  function colocarAsaRadio(lngLat, metros) {
    const borde = turf.destination(turf.point([lngLat.lng, lngLat.lat]), metros / 1000, 90, { units: "kilometers" });
    marcadorAsa.setLngLat(borde.geometry.coordinates);
    if (!asaRadio.isConnected) marcadorAsa.addTo(map);
  }
  function quitarAsaRadio() { marcadorAsa.remove(); }

  let cuadroPendiente = false;
  marcadorAsa.on("dragstart", () => { arrastrandoAsa = true; });
  marcadorAsa.on("drag", () => {
    if (!ultimoClickLngLat || cuadroPendiente) return;
    cuadroPendiente = true;
    requestAnimationFrame(() => {
      cuadroPendiente = false;
      if (!ultimoClickLngLat) return;
      const p = marcadorAsa.getLngLat();
      const km = turf.distance([ultimoClickLngLat.lng, ultimoClickLngLat.lat], [p.lng, p.lat], { units: "kilometers" });
      actualizarControlRadio(Math.round(km * 100) * 10); // de 10 en 10 m
    });
  });
  marcadorAsa.on("dragend", () => {
    arrastrandoAsa = false;
    tsFinAsa = Date.now();
    if (ultimoClickLngLat) colocarAsaRadio(ultimoClickLngLat, radioMetros);
  });

  function actualizarControlRadio(metros) {
    const n = Number(metros);
    if (!Number.isFinite(n)) return;
    const valor = Math.max(50, Math.min(20000, Math.round(n)));
    radioMetros = valor;
    document.querySelectorAll("[data-radio-preset]").forEach(boton => {
      const activo = Number(boton.dataset.radioPreset) === valor;
      boton.classList.toggle("activo", activo);
      boton.setAttribute("aria-pressed", String(activo));
    });
    if (ultimoClickLngLat) ejecutarAnalisisEspacial(ultimoClickLngLat);
  }

  function ejecutarAnalisisEspacial(lngLat) {
    if (!geojsonData) return;
    document.getElementById("menu-radio").open = true;
    document.getElementById("paneles").classList.remove("oculto");
    ultimoClickLngLat = lngLat;
    const circuloGeo = turf.buffer(turf.point([lngLat.lng, lngLat.lat]), radioMetros / 1000, { units: "kilometers" });
    map.getSource("circulo-busqueda").setData(circuloGeo);
    actualizarEtiquetaRadio(lngLat, radioMetros);
    if (!arrastrandoAsa) colocarAsaRadio(lngLat, radioMetros);

    const [minX, minY, maxX, maxY] = turf.bbox(circuloGeo);
    const dentro = geojsonData.features.filter(f => {
      const [x, y] = f.properties.centroide;
      return x >= minX && x <= maxX && y >= minY && y <= maxY &&
             turf.booleanPointInPolygon(turf.point([x, y]), circuloGeo);
    });
    const valores = {};
    Object.entries(configVariables).forEach(([clave, cfg]) => {
      valores[clave] = agregarVariable(dentro, clave, cfg);
    });
    const resumen = \`\${dentro.length.toLocaleString()} manzanas en un radio de \${Math.round(radioMetros).toLocaleString()} m\`;
    document.getElementById("resumen-radio").textContent = resumen;
    document.getElementById("analisis-titulo").textContent = "Análisis por radio";
    document.getElementById("analisis-resumen").textContent = resumen;
    dibujarDonut("donut-analisis", valores);
    dibujarPiramide("piramide-analisis", valores);
    dibujarTabla("tabla-radio", (clave, cfg) => formatearValor(valores[clave], cfg.tipo));
  }

  `);

// 5. limpiarRadio quita el punto
cambiar("limpiarRadio", /(function limpiarRadio\(\) \{\s*ultimoClickLngLat = null;)/,
  "function limpiarRadio() {\n    ultimoClickLngLat = null;\n    quitarAsaRadio();");

// 6. El clic del mapa ignora el clic al soltar el punto
cambiar("clic del mapa", /map\.on\("click", \(e\) => \{\s*if \(modoClic === "radio"\)/,
  'map.on("click", (e) => {\n    if (Date.now() - tsFinAsa < 400) return; // ignora el clic al soltar el punto\n    if (modoClic === "radio")');

// 7. Quitar lo que ya no existe (slider, campo numérico)
cambiar("línea del campo numérico en agregarCapasDelMapa",
  /^[ \t]*const radioMetros = parseFloat\(document\.getElementById\("radio-num"\)\.value\) \|\| 1000;\n/m, "");
cambiar("escuchas del slider y del campo numérico",
  /^[ \t]*document\.getElementById\("radio"\)\.addEventListener\([^\n]*\n[ \t]*document\.getElementById\("radio-num"\)\.addEventListener\([^\n]*\n/m, "");

if (fallos) {
  console.log("\nNo se creó ningún archivo. Cópiame estas líneas (con los ✗) y lo arreglo.");
  process.exit(1);
}

const sobras = (src.match(/getElementById\("radio(-num)?"\)/g) || []).length;
if (sobras) console.log("Aviso: quedan " + sobras + " referencias al slider viejo.");

if (crlf) src = src.replace(/\n/g, "\r\n");
fs.writeFileSync(salida, src, "utf8");
console.log("\nListo: se creó " + salida + " (tu index.html no se tocó).");
