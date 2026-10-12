// =====================================================================
// CAPAS NUEVAS: Manzanas, Colonias y Parques dentro de un menú "Capas".
// - Colonias: cada una con un color distinto, sin contorno; clic = información
//   solo de esa colonia (calculada con las manzanas que caen dentro).
// - Parques: relleno verde claro; clic = ventana del parque.
// Rutas: se prueba primero la carpeta "NUEVAS CAPAS DASHBOARD/" y luego la raíz.
// =====================================================================
(function () {
  "use strict";

  var CARPETA = "NUEVAS CAPAS DASHBOARD/";
  var GRADIENTE = "linear-gradient(135deg,#f87171,#facc15,#4ade80,#60a5fa,#c084fc)";
  var CAPAS = {
    colonias: {
      archivo: "colonias.geojson",
      fuente: "colonias-src",
      relleno: "colonias-fill",
      visible: false,
      color: GRADIENTE,
      etiqueta: "Colonias"
    },
    parques: {
      archivo: "areas_verdes.geojson",
      fuente: "parques-src",
      relleno: "parques-fill",
      linea: "parques-line",
      visible: true,
      color: "#86efac",
      etiqueta: "Parques y áreas verdes"
    }
  };
  var SEL = { fuente: "colonia-sel-src", linea: "colonia-sel-line" };
  var datos = { colonias: null, parques: null };
  var cargando = { colonias: false, parques: false };
  var vacio = { type: "FeatureCollection", features: [] };
  var coloniaSel = null;      // feature (geometría completa) de la colonia seleccionada
  var popupColonia = null;

  function esperarMapa(fn) {
    if (typeof map === "undefined") { return setTimeout(function () { esperarMapa(fn); }, 100); }
    fn();
  }

  // ---------------------------------------------------------------- UI
  function inyectarCSS() {
    var css = [
      ".capas-wrap{position:relative}",
      ".btn-capas{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--linea-fuerte);border-radius:6px;background:var(--superficie-2);color:var(--texto);font-size:12px;font-weight:600;cursor:pointer}",
      ".btn-capas:hover{border-color:var(--acento)}",
      ".btn-capas svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .2s}",
      ".btn-capas[aria-expanded='true'] svg.chev{transform:rotate(180deg)}",
      ".panel-capas{position:absolute;top:calc(100% + 10px);right:0;min-width:230px;padding:12px 14px;display:flex;flex-direction:column;gap:12px;background:var(--superficie);border:1px solid var(--linea-fuerte);border-radius:8px;box-shadow:var(--sombra);z-index:40}",
      ".panel-capas[hidden]{display:none}",
      ".panel-capas .titulo-capas{margin:0;font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--suave)}",
      ".panel-capas .interruptor{position:relative;justify-content:flex-start}",
      ".panel-capas .interruptor .pista{margin-left:auto;order:2}",
      ".panel-capas .interruptor input:checked ~ .pista{background:var(--acento)}",
      ".panel-capas .interruptor input:checked ~ .pista::after{transform:translateX(16px)}",
      ".panel-capas .interruptor input:focus-visible ~ .pista{outline:2px solid var(--acento);outline-offset:2px}",
      ".panel-capas .muestra{width:12px;height:12px;border-radius:3px;flex:none;border:1px solid rgba(0,0,0,.3)}",
      ".popup-capa .maplibregl-popup-content{background:var(--superficie);color:var(--texto);border:1px solid var(--linea-fuerte);border-radius:8px;padding:12px 14px;font-family:var(--fuente);font-size:12.5px;line-height:1.45;box-shadow:var(--sombra);max-width:300px}",
      ".popup-capa .maplibregl-popup-close-button{color:var(--suave);font-size:18px;padding:2px 8px}",
      ".popup-capa.maplibregl-popup-anchor-top .maplibregl-popup-tip{border-bottom-color:var(--superficie)}",
      ".popup-capa.maplibregl-popup-anchor-bottom .maplibregl-popup-tip{border-top-color:var(--superficie)}",
      ".popup-capa.maplibregl-popup-anchor-left .maplibregl-popup-tip{border-right-color:var(--superficie)}",
      ".popup-capa.maplibregl-popup-anchor-right .maplibregl-popup-tip{border-left-color:var(--superficie)}",
      ".popup-capa h4{margin:0 22px 8px 0;font-family:var(--fuente-titulo);font-size:15px;font-weight:600;letter-spacing:-.01em;display:flex;align-items:center;gap:8px}",
      ".popup-capa h4 i{width:12px;height:12px;border-radius:3px;flex:none;border:1px solid rgba(0,0,0,.35)}",
      ".popup-capa dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:3px 10px}",
      ".popup-capa dt{color:var(--suave);font-family:var(--mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;padding-top:2px}",
      ".popup-capa dd{margin:0;text-align:right;word-break:break-word;font-variant-numeric:tabular-nums}",
      ".popup-capa .nota{margin:8px 0 0;font-size:10.5px;color:var(--tenue)}"
    ].join("\n");
    var st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  }

  function filaInterruptor(id, texto, color, marcado) {
    var l = document.createElement("label");
    l.className = "interruptor";
    l.innerHTML = '<input type="checkbox" id="' + id + '"' + (marcado ? " checked" : "") + ' />' +
      '<span class="muestra" style="background:' + color + '"></span>' + texto + '<span class="pista"></span>';
    return l;
  }

  function construirMenu() {
    var barra = document.getElementById("control-estilos");
    if (!barra) return;

    var wrap = document.createElement("div");
    wrap.className = "capas-wrap";
    wrap.innerHTML =
      '<button type="button" id="btn-capas" class="btn-capas" aria-haspopup="true" aria-expanded="false" aria-controls="panel-capas">Capas ' +
      '<svg class="chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button>' +
      '<div id="panel-capas" class="panel-capas" hidden><p class="titulo-capas">Capas del mapa</p></div>';
    var panel = wrap.querySelector("#panel-capas");

    // La casilla "Manzanas" original se MUEVE aquí (conserva sus eventos).
    var chkManz = document.getElementById("chk-manzanas");
    var labelManz = chkManz ? chkManz.closest("label") : null;
    if (labelManz) {
      var m = document.createElement("span");
      m.className = "muestra";
      m.style.background = "#ec4c2d";
      labelManz.insertBefore(m, labelManz.children[1]);
      panel.appendChild(labelManz);
    }
    panel.appendChild(filaInterruptor("chk-colonias", CAPAS.colonias.etiqueta, CAPAS.colonias.color, CAPAS.colonias.visible));
    panel.appendChild(filaInterruptor("chk-parques", CAPAS.parques.etiqueta, CAPAS.parques.color, CAPAS.parques.visible));
    barra.appendChild(wrap);

    var btn = wrap.querySelector("#btn-capas");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var abierto = panel.hidden;
      panel.hidden = !abierto;
      btn.setAttribute("aria-expanded", String(abierto));
    });
    panel.addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("click", function () { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    });

    document.getElementById("chk-colonias").addEventListener("change", function (e) {
      alternar("colonias", e.target.checked);
    });
    document.getElementById("chk-parques").addEventListener("change", function (e) {
      alternar("parques", e.target.checked);
    });
  }

  // ------------------------------------------------------------- Datos
  function traer(archivo) {
    var urls = [encodeURI(CARPETA + archivo), encodeURI(archivo)];
    var i = 0;
    function intento() {
      if (i >= urls.length) return Promise.reject(new Error("No encontré " + archivo));
      var u = urls[i++];
      return fetch(u).then(function (r) {
        if (!r.ok) return intento();
        return r.json();
      }).catch(function () { return intento(); });
    }
    return intento();
  }

  // Un color distinto por colonia (ángulo áureo para separar tonos consecutivos).
  function colorColonia(i) {
    var h = (i * 137.508) % 360;
    var s = 62 + (i % 3) * 10;
    var l = 48 + (i % 4) * 5;
    return "hsl(" + h.toFixed(1) + "," + s + "%," + l + "%)";
  }

  function prepararColonias(gj) {
    gj.features.forEach(function (f, i) {
      f.properties = f.properties || {};
      f.properties._cid = i;
      f.properties._color = colorColonia(i);
    });
  }

  function cargar(clave) {
    if (datos[clave] || cargando[clave]) return;
    cargando[clave] = true;
    if (window.mostrarEstado) window.mostrarEstado("Cargando " + CAPAS[clave].etiqueta.toLowerCase() + "...");
    traer(CAPAS[clave].archivo).then(function (gj) {
      if (clave === "colonias") prepararColonias(gj);
      datos[clave] = gj;
      var src = map.getSource(CAPAS[clave].fuente);
      if (src) src.setData(gj);
      if (window.ocultarEstado) window.ocultarEstado();
    }).catch(function (err) {
      console.error("Capas nuevas:", err);
      if (window.mostrarEstado) window.mostrarEstado(err.message, true);
    }).then(function () { cargando[clave] = false; });
  }

  // -------------------------------------------------------------- Capas
  function antesDeEtiquetas() {
    var l = map.getStyle().layers.find(function (x) { return x.type === "symbol"; });
    return l ? l.id : undefined;
  }

  function asegurarCapas() {
    if (!map.getStyle()) return;
    var antes = antesDeEtiquetas();

    // Colonias: relleno de color distinto por colonia, SIN contorno
    if (!map.getSource(CAPAS.colonias.fuente)) {
      map.addSource(CAPAS.colonias.fuente, { type: "geojson", data: datos.colonias || vacio });
    }
    if (!map.getLayer(CAPAS.colonias.relleno)) {
      map.addLayer({
        id: CAPAS.colonias.relleno, type: "fill", source: CAPAS.colonias.fuente,
        layout: { visibility: CAPAS.colonias.visible ? "visible" : "none" },
        paint: { "fill-color": ["coalesce", ["get", "_color"], "#facc15"], "fill-opacity": 0.5, "fill-antialias": false }
      }, antes);
    }

    // Parques
    if (!map.getSource(CAPAS.parques.fuente)) {
      map.addSource(CAPAS.parques.fuente, { type: "geojson", data: datos.parques || vacio });
    }
    if (!map.getLayer(CAPAS.parques.relleno)) {
      map.addLayer({
        id: CAPAS.parques.relleno, type: "fill", source: CAPAS.parques.fuente,
        layout: { visibility: CAPAS.parques.visible ? "visible" : "none" },
        paint: { "fill-color": "#86efac", "fill-opacity": 0.6 }
      }, antes);
      map.addLayer({
        id: CAPAS.parques.linea, type: "line", source: CAPAS.parques.fuente,
        layout: { visibility: CAPAS.parques.visible ? "visible" : "none" },
        paint: { "line-color": "#16a34a", "line-width": 0.9, "line-opacity": 0.9 }
      }, antes);
    }

    // Resalte de la colonia seleccionada (solo esa lleva contorno)
    if (!map.getSource(SEL.fuente)) {
      map.addSource(SEL.fuente, { type: "geojson", data: coloniaSel ? { type: "FeatureCollection", features: [coloniaSel] } : vacio });
    }
    if (!map.getLayer(SEL.linea)) {
      map.addLayer({
        id: SEL.linea, type: "line", source: SEL.fuente,
        paint: { "line-color": "#ffffff", "line-width": 3, "line-opacity": 1 }
      }, antes);
    }
    ordenar();
  }

  // Orden: colonias (abajo) < manzanas < parques < colonia seleccionada < radio/selección.
  function ordenar() {
    var capas = function () { return map.getStyle().layers.map(function (l) { return l.id; }); };
    var ids = capas();
    var pos = function (id) { return ids.indexOf(id); };

    if (pos("manzanas-fill") >= 0 && pos(CAPAS.colonias.relleno) > pos("manzanas-fill")) {
      map.moveLayer(CAPAS.colonias.relleno, "manzanas-fill");
      ids = capas();
    }
    var tope = pos("circulo-layer-fill") >= 0 ? "circulo-layer-fill" : undefined;
    var arriba = [CAPAS.parques.relleno, CAPAS.parques.linea, SEL.linea].filter(function (id) { return pos(id) >= 0; });
    var ref = pos("manzanas-linea");
    var mal = arriba.some(function (id) {
      return (ref >= 0 && pos(id) < ref) || (tope && pos(id) > pos(tope));
    });
    if (mal) arriba.forEach(function (id) { map.moveLayer(id, tope); });
  }

  function alternar(clave, visible) {
    CAPAS[clave].visible = visible;
    var v = visible ? "visible" : "none";
    [CAPAS[clave].relleno, CAPAS[clave].linea].forEach(function (id) {
      if (id && map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
    });
    if (visible) cargar(clave);
    if (clave === "colonias" && !visible) limpiarColonia();
  }

  // --------------------------------------------------------- Utilidades
  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(n, dec) {
    return Number(n).toLocaleString("es-MX", { maximumFractionDigits: dec || 0 });
  }

  // Suma las manzanas cuyo centroide cae dentro de la colonia.
  function resumenColonia(feat) {
    if (typeof geojsonData === "undefined" || !geojsonData || !window.turf) return null;
    var bb = turf.bbox(feat), n = 0;
    var t = { POBTOT: 0, POBFEM_1: 0, POBMAS_1: 0, POB0_14_15: 0, POB65_MA_1: 0, TVIVHAB_1: 0, PEA_1: 0 };
    var escSum = 0, escPeso = 0;
    geojsonData.features.forEach(function (f) {
      var c = f.properties && f.properties.centroide;
      if (!c || c[0] < bb[0] || c[0] > bb[2] || c[1] < bb[1] || c[1] > bb[3]) return;
      if (!turf.booleanPointInPolygon(turf.point(c), feat)) return;
      n++;
      Object.keys(t).forEach(function (k) { t[k] += Number(f.properties[k]) || 0; });
      var g = Number(f.properties.GRAPROES_1), w = Number(f.properties.P_15YMAS_1);
      if (isFinite(g) && w > 0) { escSum += g * w; escPeso += w; }
    });
    t.manzanas = n;
    t.escolaridad = escPeso > 0 ? escSum / escPeso : null;
    return t;
  }

  function limpiarColonia() {
    coloniaSel = null;
    var s = map.getSource(SEL.fuente);
    if (s) s.setData(vacio);
    if (popupColonia) { var p = popupColonia; popupColonia = null; p.remove(); }
  }

  // -------------------------------------------------------------- Clics
  function bloquearSeleccionManzana() {
    // El código principal ignora clics mientras tsFinAsa sea reciente (< 400 ms),
    // y este manejador corre antes que el suyo.
    if (typeof modoClic !== "undefined" && modoClic === "manzana" && typeof tsFinAsa !== "undefined") {
      tsFinAsa = Date.now();
    }
  }

  function popupParque(e, f) {
    var p = f.properties || {};
    var area = Number(p.area_m2);
    var areaTxt = isFinite(area) && area > 0
      ? num(area) + " m²" + (area >= 10000 ? " (" + num(area / 10000, 2) + " ha)" : "")
      : "Sin dato";
    var html = "<h4>" + esc(p.nombre || "Sin nombre") + "</h4><dl>" +
      "<dt>Clasificación</dt><dd>" + esc(p.clasif || "Sin dato") + "</dd>" +
      "<dt>Tipo</dt><dd>" + esc(p.tipo || "Sin dato") + "</dd>" +
      "<dt>Superficie</dt><dd>" + areaTxt + "</dd>" +
      "<dt>Acceso controlado</dt><dd>" + (p.acceso_con === "SI" ? "Sí" : "No especificado") + "</dd>" +
      "<dt>Dirección</dt><dd>" + esc(p.direccion || "Sin dato") + "</dd></dl>";
    new maplibregl.Popup({ className: "popup-capa", maxWidth: "300px", closeOnClick: true })
      .setLngLat(e.lngLat).setHTML(html).addTo(map);
  }

  function popupColoniaInfo(e, f) {
    var p = f.properties || {};
    // La geometría que devuelve el mapa viene recortada por teselas: usamos la original completa.
    var original = (datos.colonias && datos.colonias.features[p._cid]) || f;
    coloniaSel = original;
    var s = map.getSource(SEL.fuente);
    if (s) s.setData({ type: "FeatureCollection", features: [original] });

    var haTotal = turf.area(original) / 10000;
    var r = resumenColonia(original);
    var filas = "<dt>Tipo</dt><dd>" + esc(p.tipo || "Sin dato") + "</dd>" +
      "<dt>Superficie</dt><dd>" + num(haTotal, 1) + " ha</dd>";
    var nota = "";
    if (r && r.manzanas > 0) {
      var pct = function (v) { return r.POBTOT > 0 ? " (" + num(v / (r.POBFEM_1 + r.POBMAS_1 || 1) * 100, 1) + "%)" : ""; };
      filas += "<dt>Manzanas</dt><dd>" + num(r.manzanas) + "</dd>" +
        "<dt>Población total</dt><dd>" + num(r.POBTOT) + "</dd>" +
        "<dt>Densidad</dt><dd>" + num(r.POBTOT / haTotal, 1) + " hab/ha</dd>" +
        "<dt>Mujeres</dt><dd>" + num(r.POBFEM_1) + pct(r.POBFEM_1) + "</dd>" +
        "<dt>Hombres</dt><dd>" + num(r.POBMAS_1) + pct(r.POBMAS_1) + "</dd>" +
        "<dt>0-14 años</dt><dd>" + num(r.POB0_14_15) + "</dd>" +
        "<dt>65 años y más</dt><dd>" + num(r.POB65_MA_1) + "</dd>" +
        "<dt>Viviendas habitadas</dt><dd>" + num(r.TVIVHAB_1) + "</dd>" +
        "<dt>Pob. económicamente activa</dt><dd>" + num(r.PEA_1) + "</dd>" +
        (r.escolaridad != null ? "<dt>Escolaridad promedio</dt><dd>" + num(r.escolaridad, 1) + " años</dd>" : "");
      nota = '<p class="nota">Suma de las manzanas del Censo 2020 cuyo centro cae dentro de la colonia.</p>';
    } else if (r) {
      nota = '<p class="nota">No hay manzanas del Censo dentro de esta colonia.</p>';
    }
    var html = '<h4><i style="background:' + esc(p._color || "#facc15") + '"></i>' + esc(p.nombre || "Sin nombre") + "</h4><dl>" + filas + "</dl>" + nota;

    if (popupColonia) { var viejo = popupColonia; popupColonia = null; viejo.remove(); }
    var pop = new maplibregl.Popup({ className: "popup-capa", maxWidth: "320px", closeOnClick: true })
      .setLngLat(e.lngLat).setHTML(html).addTo(map);
    popupColonia = pop;
    pop.on("close", function () {
      if (popupColonia === pop) { popupColonia = null; coloniaSel = null; var src = map.getSource(SEL.fuente); if (src) src.setData(vacio); }
    });
  }

  function activarClics() {
    map.on("click", function (e) {
      // 1) Parque (tiene prioridad sobre colonia y manzana)
      if (CAPAS.parques.visible && map.getLayer(CAPAS.parques.relleno)) {
        var fp = map.queryRenderedFeatures(e.point, { layers: [CAPAS.parques.relleno] })[0];
        if (fp) { bloquearSeleccionManzana(); popupParque(e, fp); return; }
      }
      // 2) Colonia (no en modo Radio, para no estorbar al trazar círculos)
      var radio = (typeof modoClic !== "undefined" && modoClic === "radio");
      if (CAPAS.colonias.visible && !radio && map.getLayer(CAPAS.colonias.relleno)) {
        var fc = map.queryRenderedFeatures(e.point, { layers: [CAPAS.colonias.relleno] })[0];
        if (fc) { bloquearSeleccionManzana(); popupColoniaInfo(e, fc); }
      }
    });
  }

  // --------------------------------------------------------------- Init
  esperarMapa(function () {
    inyectarCSS();
    construirMenu();
    activarClics();

    // Se vuelven a crear tras cualquier cambio de estilo base (Oscuro/Claro/Satélite)
    // y se reordenan cuando el código principal reconstruye las manzanas.
    var intentar = function () {
      try { asegurarCapas(); } catch (e) { /* el estilo aún se está cargando; se reintenta en el siguiente evento */ }
    };
    ["style.load", "styledata", "idle"].forEach(function (ev) { map.on(ev, intentar); });
    intentar();

    Object.keys(CAPAS).forEach(function (k) { if (CAPAS[k].visible) cargar(k); });
  });
})();
