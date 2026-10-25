// =====================================================================
// CAPAS NUEVAS: Manzanas, Colonias, Parques y Escuelas dentro de un menú "Capas".
// - Colonias: cada una con un color distinto, sin contorno; clic = información
//   solo de esa colonia (calculada con las manzanas que caen dentro).
// - Parques: relleno verde claro; clic = ventana del parque.
// - Escuelas: puntos por nivel (preescolar, secundaria, superior); clic = ventana de la escuela.
// - Transporte público: rutas (BRT-1/2/3 gruesas, resto en gris) y paradas; clic = ventana con las rutas o la parada.
// - Entorno en el radio: escuelas, áreas verdes por habitante y transporte dentro del círculo de análisis.
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
      visible: false,
      color: "#86efac",
      etiqueta: "Parques y áreas verdes"
    }
  };
  var NIVELES = {
    "PREESCOLAR":     { nombre: "Preescolar",     color: "#f2a900", forma: "circulo" },
    "PRIMARIA":       { nombre: "Primaria",       color: "#2563eb", forma: "rombo" },
    "SECUNDARIA":     { nombre: "Secundaria",     color: "#d1495b", forma: "cuadrado" },
    "MEDIA SUPERIOR": { nombre: "Media superior", color: "#0f9fb5", forma: "hexagono" },
    "SUPERIOR":       { nombre: "Superior",       color: "#6f3fa0", forma: "triangulo" }
  };
  CAPAS.escuelas = {
    archivo: "escuelas_2025-2026.geojson",
    fuente: "escuelas-src",
    relleno: "escuelas-pts",
    visible: false,
    color: "linear-gradient(135deg,#f2a900 0 20%,#2563eb 20% 40%,#d1495b 40% 60%,#0f9fb5 60% 80%,#6f3fa0 80%)",
    etiqueta: "Escuelas"
  };
  // Transporte: UNA fila en el menú que controla rutas + paradas (dos archivos).
  var COLORES_RUTA = { "BRT-1": "#7ab800", "BRT-2": "#2fa6e0", "BRT-3": "#c8102e" };  // como en el mapa oficial de JuárezBús
  var COLOR_RUTA_OTRA = "#94a3b8";
  CAPAS.transporte = {
    archivo: "transporte_rutas.geojson",
    archivoParadas: "transporte_paradas.geojson",
    fuente: "transporte-rutas-src",
    fuenteParadas: "transporte-paradas-src",
    visible: false,
    color: "linear-gradient(135deg,#7ab800 0 33%,#2fa6e0 33% 66%,#c8102e 66%)",
    etiqueta: "Transporte público"
  };
  // Camellones y glorietas: se dibujan como capa aparte y NO cuentan como área verde por habitante.
  var CLASIF_VIAL = ["CAMELLON", "GLORIETA"];
  var FILTRO_VIAL = ["in", ["get", "clasif"], ["literal", CLASIF_VIAL]];
  CAPAS.camellones = { fuente: "parques-src", relleno: "camellones-fill", visible: false, color: "#f97316", etiqueta: "Camellones y glorietas" };
  var SEL = { fuente: "colonia-sel-src", linea: "colonia-sel-line" };
  // Orden de las capas de arriba (se ve encima) a abajo. El usuario lo cambia con las flechas del menú.
  var ordenCapas = ["escuelas", "transporte", "parques", "camellones", "manzanas", "colonias"];
  // Capas reales de MapLibre que pertenecen a cada grupo del menú.
  var GRUPOS = {
    manzanas: ["manzanas-fill", "manzanas-hit", "manzanas-linea"],
    colonias: ["colonias-fill"],
    parques:  ["parques-fill", "parques-line"],
    camellones: ["camellones-fill", "camellones-line"],
    escuelas: ["escuelas-pts"],
    transporte: ["transporte-rutas-otras", "transporte-rutas-brt", "transporte-paradas"]
  };
  var datos = { colonias: null, parques: null, escuelas: null, transporte: null };
  var cargando = { colonias: false, parques: false, escuelas: false, transporte: false };
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
      ".popup-capa .nota{margin:8px 0 0;font-size:10.5px;color:var(--tenue)}",
      ".panel-capas{width:250px;max-width:calc(100vw - 32px);gap:8px}",
      ".panel-capas .cab-capas{display:flex;align-items:center;justify-content:space-between;gap:8px}",
      ".panel-capas .btn-texto{background:none;border:0;padding:2px 0;color:var(--acento);font-size:11.5px;font-weight:600;cursor:pointer}",
      ".panel-capas .btn-texto:hover{text-decoration:underline}",
      ".panel-capas .pie-capas{display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:1px solid var(--linea-fuerte)}",
      ".lista-capas{display:flex;flex-direction:column;gap:2px}",
      ".fila-capa{display:flex;align-items:center;gap:4px;position:relative;border-radius:6px;transition:transform .15s}",
      ".fila-capa .interruptor{flex:1;min-width:0}",
      ".asa-capa{flex:none;width:18px;height:28px;padding:0;border:0;border-radius:4px;background:none;color:var(--tenue);cursor:grab;touch-action:none;display:inline-flex;align-items:center;justify-content:center}",
      ".asa-capa:hover{color:var(--texto)}",
      ".asa-capa:focus-visible{outline:2px solid var(--acento)}",
      ".asa-capa svg{width:14px;height:14px;fill:currentColor}",
      ".fila-capa.arrastrando{transition:none;z-index:2;background:var(--superficie-2);box-shadow:var(--sombra)}",
      ".fila-capa.arrastrando .asa-capa{cursor:grabbing}",
      ".panel-capas .ayuda-capas{margin:0;font-size:11px;line-height:1.35;color:var(--tenue)}",
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

    // Si quedó el interruptor suelto de "Escuelas" de una versión anterior, se quita.
    var suelto = document.getElementById("chk-escuelas");
    if (suelto && suelto.closest("label")) suelto.closest("label").remove();

    var wrap = document.createElement("div");
    wrap.className = "capas-wrap";
    wrap.innerHTML =
      '<button type="button" id="btn-capas" class="btn-capas" aria-haspopup="true" aria-expanded="false" aria-controls="panel-capas">Capas ' +
      '<svg class="chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button>' +
      '<div id="panel-capas" class="panel-capas" hidden><p class="titulo-capas">Selecciona capas</p></div>';
    var panel = wrap.querySelector("#panel-capas");

    var titulo = panel.querySelector(".titulo-capas");
    var cab = document.createElement("div");
    cab.className = "cab-capas";
    panel.insertBefore(cab, titulo);
    cab.appendChild(titulo);
    var apagarTodas = document.createElement("button");
    apagarTodas.type = "button";
    apagarTodas.className = "btn-texto";
    apagarTodas.textContent = "Apagar todas";
    apagarTodas.addEventListener("click", function () {
      ["chk-manzanas", "chk-colonias", "chk-parques", "chk-camellones", "chk-escuelas-capa", "chk-transporte"].forEach(function (id) {
        var c = document.getElementById(id);
        if (c && c.checked) c.click();
      });
    });
    cab.appendChild(apagarTodas);
    var lista = document.createElement("div");
    lista.className = "lista-capas";
    panel.appendChild(lista);

    // La casilla "Manzanas" original se MUEVE aquí (conserva sus eventos).
    var chkManz = document.getElementById("chk-manzanas");
    var labelManz = chkManz ? chkManz.closest("label") : null;
    if (labelManz) {
      var m = document.createElement("span");
      m.className = "muestra";
      m.style.background = "#ec4c2d";
      labelManz.insertBefore(m, labelManz.children[1]);
    }
    var interruptores = {
      manzanas: labelManz,
      colonias: filaInterruptor("chk-colonias", CAPAS.colonias.etiqueta, CAPAS.colonias.color, CAPAS.colonias.visible),
      parques: filaInterruptor("chk-parques", CAPAS.parques.etiqueta, CAPAS.parques.color, CAPAS.parques.visible),
      camellones: filaInterruptor("chk-camellones", CAPAS.camellones.etiqueta, CAPAS.camellones.color, CAPAS.camellones.visible),
      escuelas: filaInterruptor("chk-escuelas-capa", CAPAS.escuelas.etiqueta, CAPAS.escuelas.color, CAPAS.escuelas.visible),
      transporte: filaInterruptor("chk-transporte", CAPAS.transporte.etiqueta, CAPAS.transporte.color, CAPAS.transporte.visible)
    };
    var nombres = { manzanas: "Manzanas", colonias: "Colonias", parques: "Parques y áreas verdes", camellones: "Camellones y glorietas", escuelas: "Escuelas", transporte: "Transporte público" };
    var iconoAsa = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
    var filas = {};

    function pintarLista() {
      ordenCapas.forEach(function (k) { lista.appendChild(filas[k]); });
    }
    function moverCapa(k, dir) {
      var i = ordenCapas.indexOf(k), j = i + dir;
      if (j < 0 || j >= ordenCapas.length) return false;
      ordenCapas.splice(i, 1);
      ordenCapas.splice(j, 0, k);
      pintarLista();
      ordenar();
      return true;
    }

    Object.keys(interruptores).forEach(function (k) {
      var fila = document.createElement("div");
      fila.className = "fila-capa";
      fila.setAttribute("data-capa", k);

      var asa = document.createElement("button");
      asa.type = "button";
      asa.className = "asa-capa";
      asa.title = "Arrastra para cambiar el orden";
      asa.setAttribute("aria-label", "Mover la capa " + nombres[k] + ": arrastra, o usa las flechas arriba y abajo");
      asa.innerHTML = iconoAsa;
      fila.appendChild(asa);
      if (interruptores[k]) fila.appendChild(interruptores[k]);
      filas[k] = fila;

      // Con teclado: flechas arriba/abajo sobre el asa.
      asa.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        if (moverCapa(k, e.key === "ArrowUp" ? -1 : 1)) asa.focus();
      });

      // Con mouse o dedo: se arrastra la fila y las demás se apartan; al soltar se aplica el orden.
      asa.addEventListener("pointerdown", function (ev) {
        if (ev.button !== undefined && ev.button !== 0) return;
        ev.preventDefault();
        try { asa.setPointerCapture(ev.pointerId); } catch (err) { /* sin captura también funciona */ }
        var items = ordenCapas.map(function (c) { return filas[c]; });
        var desde = items.indexOf(fila), hasta = desde;
        var paso = items.length > 1
          ? items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().top
          : items[0].getBoundingClientRect().height;
        var y0 = ev.clientY;
        fila.classList.add("arrastrando");

        function mover(e2) {
          var dy = e2.clientY - y0;
          dy = Math.max(-desde * paso, Math.min((items.length - 1 - desde) * paso, dy));
          fila.style.transform = "translateY(" + dy + "px)";
          hasta = Math.max(0, Math.min(items.length - 1, desde + Math.round(dy / paso)));
          items.forEach(function (el, i) {
            if (el === fila) return;
            var d = 0;
            if (desde < hasta && i > desde && i <= hasta) d = -paso;
            if (desde > hasta && i >= hasta && i < desde) d = paso;
            el.style.transform = d ? "translateY(" + d + "px)" : "";
          });
        }
        function fin() {
          asa.removeEventListener("pointermove", mover);
          asa.removeEventListener("pointerup", fin);
          asa.removeEventListener("pointercancel", fin);
          items.forEach(function (el) { el.style.transition = "none"; el.style.transform = ""; });
          fila.classList.remove("arrastrando");
          if (hasta !== desde) {
            ordenCapas.splice(desde, 1);
            ordenCapas.splice(hasta, 0, k);
            pintarLista();
            ordenar();
          }
          void lista.offsetHeight;
          items.forEach(function (el) { el.style.transition = ""; });
        }
        asa.addEventListener("pointermove", mover);
        asa.addEventListener("pointerup", fin);
        asa.addEventListener("pointercancel", fin);
      });
    });
    pintarLista();

    var pie = document.createElement("p");
    pie.className = "ayuda-capas";
    pie.textContent = "Arrastra ⋮⋮ para ordenar las capas.";
    panel.appendChild(pie);
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
    document.getElementById("chk-camellones").addEventListener("change", function (e) {
      alternar("camellones", e.target.checked);
    });
    document.getElementById("chk-escuelas-capa").addEventListener("change", function (e) {
      alternar("escuelas", e.target.checked);
    });
    document.getElementById("chk-transporte").addEventListener("change", function (e) {
      alternar("transporte", e.target.checked);
    });

    // Al entrar, el menú se muestra abierto para invitar a elegir capas.
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
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
    var pedido = clave === "transporte"
      ? Promise.all([traer(CAPAS.transporte.archivo), traer(CAPAS.transporte.archivoParadas)])
      : traer(CAPAS[clave].archivo);
    pedido.then(function (gj) {
      if (clave === "colonias") prepararColonias(gj);
      datos[clave] = gj;
      if (clave === "transporte") {
        var sr = map.getSource(CAPAS.transporte.fuente), sp = map.getSource(CAPAS.transporte.fuenteParadas);
        if (sr) sr.setData(gj[0]);
        if (sp) sp.setData(gj[1]);
      } else {
        var src = map.getSource(CAPAS[clave].fuente);
        if (src) src.setData(gj);
      }
      if (window.ocultarEstado) window.ocultarEstado();
    }).catch(function (err) {
      console.error("Capas nuevas:", err);
      if (window.mostrarEstado) window.mostrarEstado(err.message, true);
    }).then(function () { cargando[clave] = false; });
  }

  // -------------------------------------------------------------- Capas
  function antesDeEtiquetas() {
    // Antes del bloque de etiquetas del final del estilo base (por encima de calles y edificios).
    var propias = ["manzanas", "circulo-busqueda", "manzana-seleccionada", "colonias-src", "parques-src", "escuelas-src", "transporte-rutas-src", "transporte-paradas-src", "colonia-sel-src"];
    var base = map.getStyle().layers.filter(function (x) { return propias.indexOf(x.source) < 0; });
    var ult = -1;
    base.forEach(function (x, i) { if (x.type !== "symbol") ult = i; });
    var l = base.slice(ult + 1).find(function (x) { return x.type === "symbol"; });
    return l ? l.id : undefined;
  }

  // Dibuja los iconos de escuelas con canvas y los registra en el mapa
  // (hay que repetirlo tras cada cambio de estilo base, que borra las imágenes).
  function registrarIconosEscuelas() {
    var niveles = Object.keys(NIVELES).concat(["otro"]);
    niveles.forEach(function (k) {
      var id = "esc-" + k;
      if (map.hasImage(id)) return;
      var forma = NIVELES[k] ? NIVELES[k].forma : "circulo";
      var color = NIVELES[k] ? NIVELES[k].color : "#888888";
      var T = 44, m = T / 2, c = document.createElement("canvas");
      c.width = c.height = T;
      var g = c.getContext("2d");
      g.beginPath();
      if (forma === "circulo") g.arc(m, m, 14, 0, Math.PI * 2);
      else if (forma === "cuadrado") g.rect(m - 12, m - 12, 24, 24);
      else if (forma === "rombo") { g.moveTo(m, m - 17); g.lineTo(m + 17, m); g.lineTo(m, m + 17); g.lineTo(m - 17, m); g.closePath(); }
      else if (forma === "hexagono") { for (var q = 0; q < 6; q++) { var an = Math.PI / 3 * q + Math.PI / 6; g.lineTo(m + 16 * Math.cos(an), m + 16 * Math.sin(an)); } g.closePath(); }
      else { g.moveTo(m, 6); g.lineTo(T - 6, T - 8); g.lineTo(6, T - 8); g.closePath(); }
      g.fillStyle = color;
      g.fill();
      g.lineWidth = 3.5;
      g.strokeStyle = "#ffffff";
      g.lineJoin = "round";
      g.stroke();
      map.addImage(id, g.getImageData(0, 0, T, T), { pixelRatio: 2 });
    });
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
        id: CAPAS.parques.relleno, type: "fill", source: CAPAS.parques.fuente, filter: ["!", FILTRO_VIAL],
        layout: { visibility: CAPAS.parques.visible ? "visible" : "none" },
        paint: { "fill-color": "#86efac", "fill-opacity": 0.6 }
      }, antes);
      map.addLayer({
        id: CAPAS.parques.linea, type: "line", source: CAPAS.parques.fuente, filter: ["!", FILTRO_VIAL],
        layout: { visibility: CAPAS.parques.visible ? "visible" : "none" },
        paint: { "line-color": "#16a34a", "line-width": 0.9, "line-opacity": 0.9 }
      }, antes);
    }

    // Camellones y glorietas (misma fuente que parques, solo esas clases)
    if (!map.getLayer(CAPAS.camellones.relleno)) {
      map.addLayer({
        id: CAPAS.camellones.relleno, type: "fill", source: CAPAS.parques.fuente, filter: FILTRO_VIAL,
        layout: { visibility: CAPAS.camellones.visible ? "visible" : "none" },
        paint: { "fill-color": CAPAS.camellones.color, "fill-opacity": 0.85 }
      }, antes);
      // Los camellones son franjas angostas: un contorno más oscuro los hace visibles al alejar el zoom.
      map.addLayer({
        id: "camellones-line", type: "line", source: CAPAS.parques.fuente, filter: FILTRO_VIAL,
        layout: { visibility: CAPAS.camellones.visible ? "visible" : "none" },
        paint: { "line-color": "#9a3412", "line-opacity": 0.95,
                 "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 14, 1.4, 17, 2.2] }
      }, antes);
    }

    // Escuelas: un símbolo distinto por nivel (círculo, cuadrado, triángulo)
    registrarIconosEscuelas();
    if (!map.getSource(CAPAS.escuelas.fuente)) {
      map.addSource(CAPAS.escuelas.fuente, { type: "geojson", data: datos.escuelas || vacio });
    }
    if (!map.getLayer(CAPAS.escuelas.relleno)) {
      map.addLayer({
        id: CAPAS.escuelas.relleno, type: "symbol", source: CAPAS.escuelas.fuente,
        layout: {
          visibility: CAPAS.escuelas.visible ? "visible" : "none",
          "icon-image": ["match", ["get", "NIVEL"]].concat(
            Object.keys(NIVELES).reduce(function (a, k) { return a.concat([k, "esc-" + k]); }, []), ["esc-otro"]),
          "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.4, 14, 0.7, 17, 1],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true
        }
      }, antes);
    }

    // Transporte: rutas (otras abajo, BRT encima) y paradas
    var vTr = CAPAS.transporte.visible ? "visible" : "none";
    var esBRT = ["in", ["get", "sistema"], ["literal", ["BRT-1", "BRT-2", "BRT-3"]]];
    if (!map.getSource(CAPAS.transporte.fuente)) {
      map.addSource(CAPAS.transporte.fuente, { type: "geojson", data: datos.transporte ? datos.transporte[0] : vacio });
    }
    if (!map.getSource(CAPAS.transporte.fuenteParadas)) {
      map.addSource(CAPAS.transporte.fuenteParadas, { type: "geojson", data: datos.transporte ? datos.transporte[1] : vacio });
    }
    if (!map.getLayer("transporte-rutas-otras")) {
      map.addLayer({
        id: "transporte-rutas-otras", type: "line", source: CAPAS.transporte.fuente,
        filter: ["!", esBRT],
        layout: { visibility: vTr, "line-join": "round", "line-cap": "round" },
        paint: { "line-color": COLOR_RUTA_OTRA, "line-opacity": 0.75,
                 "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 3] }
      }, antes);
    }
    if (!map.getLayer("transporte-rutas-brt")) {
      map.addLayer({
        id: "transporte-rutas-brt", type: "line", source: CAPAS.transporte.fuente,
        filter: esBRT,
        layout: { visibility: vTr, "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ["match", ["get", "sistema"],
                   "BRT-1", COLORES_RUTA["BRT-1"], "BRT-2", COLORES_RUTA["BRT-2"], "BRT-3", COLORES_RUTA["BRT-3"], COLOR_RUTA_OTRA],
                 "line-opacity": 0.95,
                 "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 16, 7] }
      }, antes);
    }
    if (!map.getLayer("transporte-paradas")) {
      map.addLayer({
        id: "transporte-paradas", type: "circle", source: CAPAS.transporte.fuenteParadas, minzoom: 11,
        layout: { visibility: vTr },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2.5, 16, 6],
          "circle-color": "#ffffff", "circle-stroke-color": "#1b2030", "circle-stroke-width": 1.8
        }
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

  // Apila las capas según "ordenCapas" (el primero queda encima), siempre por debajo
  // del círculo de radio y la manzana seleccionada. Solo mueve si algo está fuera de lugar,
  // para no disparar eventos del estilo en bucle.
  function ordenar() {
    if (!map.getStyle()) return;
    var estilo = map.getStyle().layers.map(function (l) { return l.id; });
    var deseado = [];
    ordenCapas.slice().reverse().forEach(function (k) {
      GRUPOS[k].forEach(function (id) { if (map.getLayer(id)) deseado.push(id); });
    });
    if (map.getLayer(SEL.linea)) deseado.push(SEL.linea);   // contorno de la colonia elegida, siempre visible
    if (!deseado.length) return;
    var tope = estilo.indexOf("circulo-layer-fill") >= 0 ? "circulo-layer-fill" : undefined;
    var actual = estilo.filter(function (id) { return deseado.indexOf(id) >= 0; });
    var igual = actual.length === deseado.length && actual.every(function (id, i) { return id === deseado[i]; });
    var limite = tope ? estilo.indexOf(tope) : estilo.length;
    var ultimo = estilo.indexOf(deseado[deseado.length - 1]);
    if (igual && ultimo < limite) return;
    deseado.forEach(function (id) { map.moveLayer(id, tope); });
  }

  function alternar(clave, visible) {
    CAPAS[clave].visible = visible;
    var v = visible ? "visible" : "none";
    (GRUPOS[clave] || [CAPAS[clave].relleno, CAPAS[clave].linea]).forEach(function (id) {
      if (id && map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
    });
    if (visible) cargar(clave === "camellones" ? "parques" : clave);
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

  function popupEscuela(f) {
    var p = f.properties || {};
    var nivel = NIVELES[p.NIVEL] || { nombre: p.NIVEL || "Sin dato", color: "#888888" };
    var tiene = function (v) { return v !== null && v !== undefined && v !== "" && isFinite(Number(v)); };
    var filas = "<dt>Nivel</dt><dd>" + esc(nivel.nombre) + "</dd>" +
      "<dt>Turno</dt><dd>" + esc((p.TURNO || p.Turno) ? String(p.TURNO || p.Turno).toLowerCase() : "Sin dato") + "</dd>" +
      (p.MODALIDAD ? "<dt>Modalidad</dt><dd>" + esc(p.MODALIDAD) + "</dd>" : "") +
      "<dt>Dirección</dt><dd>" + esc(p.DIRECCION || "Sin dato") + "</dd>";
    if (tiene(p.TALUMNOS)) {
      filas += "<dt>Alumnos</dt><dd>" + num(p.TALUMNOS) + "</dd>" +
        "<dt>Mujeres</dt><dd>" + num(p.TAMUJERES) + "</dd>" +
        "<dt>Hombres</dt><dd>" + num(p.TAHOMBRES) + "</dd>";
    }
    if (p.CLAVE) filas += "<dt>Clave</dt><dd>" + esc(p.CLAVE) + "</dd>";
    var html = '<h4><i style="background:' + nivel.color + '"></i>' + esc(p.NOMBRE || "Sin nombre") + "</h4><dl>" + filas + "</dl>";
    new maplibregl.Popup({ className: "popup-capa", maxWidth: "300px", closeOnClick: true })
      .setLngLat(f.geometry.coordinates).setHTML(html).addTo(map);
  }

  // Los puntos son pequeños: se busca en un cuadro de ±6 px alrededor del clic.
  function escuelaEn(punto) {
    if (!CAPAS.escuelas.visible || !map.getLayer(CAPAS.escuelas.relleno)) return null;
    var caja = [[punto.x - 6, punto.y - 6], [punto.x + 6, punto.y + 6]];
    return map.queryRenderedFeatures(caja, { layers: [CAPAS.escuelas.relleno] })[0] || null;
  }

  // Paradas (±6 px) y rutas (±5 px) cerca del clic.
  function transporteEn(punto) {
    if (!CAPAS.transporte.visible) return null;
    var caja = function (r) { return [[punto.x - r, punto.y - r], [punto.x + r, punto.y + r]]; };
    if (map.getLayer("transporte-paradas")) {
      var fp = map.queryRenderedFeatures(caja(6), { layers: ["transporte-paradas"] })[0];
      if (fp) return { tipo: "parada", f: fp };
    }
    var capas = ["transporte-rutas-brt", "transporte-rutas-otras"].filter(function (id) { return map.getLayer(id); });
    if (!capas.length) return null;
    var fr = map.queryRenderedFeatures(caja(5), { layers: capas });
    return fr.length ? { tipo: "ruta", fs: fr } : null;
  }

  // Rutas a ≤ 40 m de una parada (para paradas del archivo sin dato de líneas).
  function rutasCercanas(coord) {
    if (!datos.transporte || !window.turf) return [];
    var pt = turf.point(coord), vistos = {};
    datos.transporte[0].features.forEach(function (f) {
      var t = f.properties && f.properties.titulo;
      if (!t) return;
      try {
        var cerca = turf.flatten(f).features.some(function (seg) {
          return turf.pointToLineDistance(pt, seg, { units: "kilometers" }) <= 0.04;
        });
        if (cerca) vistos[t] = true;
      } catch (err) { /* geometría rara: se omite */ }
    });
    return Object.keys(vistos).sort(function (a, b) { return a.localeCompare(b, "es", { numeric: true }); });
  }

  function popupParada(f) {
    var p = f.properties || {};
    var cerca = p.lineas ? [] : rutasCercanas(f.geometry.coordinates);
    var lineas = p.lineas ? esc(p.lineas)
      : cerca.length ? esc(cerca.join(", ")) + " (rutas a menos de 40 m)" : "Sin dato";
    var html = "<h4><i style=\"background:#ffffff\"></i>" + esc(p.nombre || "Parada sin nombre") + "</h4><dl>" +
      "<dt>Líneas</dt><dd>" + lineas + "</dd>" +
      (p.red ? "<dt>Red</dt><dd>" + esc(p.red) + "</dd>" : "") + "</dl>";
    new maplibregl.Popup({ className: "popup-capa", maxWidth: "300px", closeOnClick: true })
      .setLngLat(f.geometry.coordinates).setHTML(html).addTo(map);
  }

  // Varias rutas comparten calle: se listan todas las que pasan por donde se hizo clic.
  function popupRutas(e, fs) {
    var vistos = {}, lista = [];
    fs.forEach(function (f) {
      var p = f.properties || {};
      var id = (p.clave || p.titulo) + "|" + (p.sentido || "");
      if (vistos[id]) return;
      vistos[id] = true;
      lista.push(p);
    });
    var mostrar = lista.slice(0, 10);
    var filas = mostrar.map(function (p) {
      var c = COLORES_RUTA[p.sistema] || COLOR_RUTA_OTRA;
      return '<dt><i style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;background:' + c + '"></i>' +
        esc(p.titulo || "Ruta") + "</dt><dd>" + esc(p.detalle || "") +
        (p.sentido ? " · " + esc(p.sentido) : "") +
        (p.km ? " · " + num(p.km, 1) + " km" : "") + "</dd>";
    }).join("");
    var extra = lista.length > mostrar.length ? '<p class="nota">y ' + (lista.length - mostrar.length) + " más…</p>" : "";
    var uni = mostrar.length === 1 && mostrar[0].unidad ? '<p class="nota">Unidad: ' + esc(mostrar[0].unidad) + "</p>" : "";
    var html = "<h4>" + (lista.length === 1 ? "Ruta de transporte" : lista.length + " rutas aquí") + "</h4><dl>" + filas + "</dl>" + extra + uni;
    new maplibregl.Popup({ className: "popup-capa", maxWidth: "320px", closeOnClick: true })
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
    var cursorEscuela = false;
    map.on("mousemove", function (e) {
      var sobre = !!escuelaEn(e.point) || !!transporteEn(e.point);
      if (sobre !== cursorEscuela) {
        cursorEscuela = sobre;
        map.getCanvas().style.cursor = sobre ? "pointer" : "";
      }
    });

    map.on("click", function (e) {
      // 0) Escuela (no en modo Radio, para no estorbar al trazar círculos)
      var modoRadio = (typeof modoClic !== "undefined" && modoClic === "radio");
      if (!modoRadio) {
        var fe = escuelaEn(e.point);
        if (fe) { bloquearSeleccionManzana(); popupEscuela(fe); return; }
      }
      // 1) Parques y colonias: gana la que está encima según el orden elegido en el menú
      for (var i = 0; i < ordenCapas.length; i++) {
        var k = ordenCapas[i];
        if (k === "parques" && CAPAS.parques.visible && map.getLayer(CAPAS.parques.relleno)) {
          var fp = map.queryRenderedFeatures(e.point, { layers: [CAPAS.parques.relleno] })[0];
          if (fp) { bloquearSeleccionManzana(); popupParque(e, fp); return; }
        } else if (k === "camellones" && CAPAS.camellones.visible && map.getLayer(CAPAS.camellones.relleno)) {
          var cajaV = [[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]];   // franjas angostas: se busca en ±4 px
          var fv = map.queryRenderedFeatures(cajaV, { layers: [CAPAS.camellones.relleno, "camellones-line"] })[0];
          if (fv) { bloquearSeleccionManzana(); popupParque(e, fv); return; }
        } else if (k === "transporte" && !modoRadio) {
          var ft = transporteEn(e.point);
          if (ft) {
            bloquearSeleccionManzana();
            if (ft.tipo === "parada") popupParada(ft.f); else popupRutas(e, ft.fs);
            return;
          }
        } else if (k === "colonias" && CAPAS.colonias.visible && !modoRadio && map.getLayer(CAPAS.colonias.relleno)) {
          var fc = map.queryRenderedFeatures(e.point, { layers: [CAPAS.colonias.relleno] })[0];
          if (fc) { bloquearSeleccionManzana(); popupColoniaInfo(e, fc); return; }
        }
      }
    });
  }

  // ------------------------------------------- Entorno dentro del radio
  // Debajo de "Datos del radio" agrega: escuelas por nivel, áreas verdes por habitante
  // y transporte público (paradas y rutas) dentro del círculo de análisis.
  var REF_VERDE = 9;            // m² de área verde por habitante: referencia que suele citarse
  var tokenEntorno = 0, temporizadorEntorno = null, cacheBB = {};
  var contEntorno = null;

  function asegurarDatos(clave) {
    return new Promise(function (ok, fallo) {
      var t0 = Date.now();
      cargar(clave);
      (function esperar() {
        if (datos[clave]) return ok(datos[clave]);
        if (Date.now() - t0 > 20000) return fallo(new Error("No se pudo cargar " + clave));
        setTimeout(esperar, 150);
      })();
    });
  }

  // bbox de cada feature, calculado una sola vez
  function bbDe(clave, lista, i) {
    var c = cacheBB[clave] || (cacheBB[clave] = []);
    if (!c[i]) c[i] = turf.bbox(lista[i]);
    return c[i];
  }
  function cruzaCaja(a, b) { return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]); }

  function filaE(etq, val) { return "<tr><td>" + etq + "</td><td>" + val + "</td></tr>"; }
  function grupoE(t) { return '<tr class="grupo"><td colspan="2">' + t + "</td></tr>"; }

  function pintarEntorno(html) {
    if (contEntorno) contEntorno.innerHTML = html;
  }
  function limpiarEntorno() {
    tokenEntorno++;
    pintarEntorno("");
    if (contEntorno) contEntorno.hidden = true;
  }

  function calcularEntorno() {
    if (!contEntorno) return;
    if (typeof ultimoClickLngLat === "undefined" || !ultimoClickLngLat || typeof radioMetros === "undefined") {
      return limpiarEntorno();
    }
    var yo = ++tokenEntorno;
    var lng = ultimoClickLngLat.lng, lat = ultimoClickLngLat.lat, r = radioMetros;
    contEntorno.hidden = false;
    pintarEntorno('<p class="resumen">Calculando el entorno…</p>');

    Promise.all(["escuelas", "parques", "transporte"].map(asegurarDatos)).then(function () {
      if (yo !== tokenEntorno) return;   // el radio cambió mientras cargaba
      var centro = turf.point([lng, lat]);
      var circulo = turf.buffer(centro, r / 1000, { units: "kilometers" });
      var bb = turf.bbox(circulo);
      var dentroDe = function (c) { return c[0] >= bb[0] && c[0] <= bb[2] && c[1] >= bb[1] && c[1] <= bb[3] && turf.booleanPointInPolygon(turf.point(c), circulo); };

      // Población (manzanas cuyo centro cae dentro, igual que el análisis del radio)
      var pob = 0;
      if (typeof geojsonData !== "undefined" && geojsonData) {
        geojsonData.features.forEach(function (f) {
          var c = f.properties && f.properties.centroide;
          if (c && dentroDe(c)) pob += Number(f.properties.POBTOT) || 0;
        });
      }

      // Escuelas
      var porNivel = { otro: 0 }, totEsc = 0, alumnos = 0, hayAlumnos = false;
      Object.keys(NIVELES).forEach(function (k) { porNivel[k] = 0; });
      datos.escuelas.features.forEach(function (f) {
        if (!f.geometry || !dentroDe(f.geometry.coordinates)) return;
        totEsc++;
        var n = f.properties && f.properties.NIVEL;
        porNivel[porNivel.hasOwnProperty(n) ? n : "otro"]++;
        var a = Number(f.properties && f.properties.TALUMNOS);
        if (isFinite(a) && f.properties.TALUMNOS !== null && f.properties.TALUMNOS !== "") { alumnos += a; hayAlumnos = true; }
      });

      // Áreas verdes (recortadas al círculo)
      var m2 = 0, nParq = 0, m2Vial = 0;
      datos.parques.features.forEach(function (f, i) {
        if (!f.geometry || !cruzaCaja(bbDe("parques", datos.parques.features, i), bb)) return;
        var area = 0;
        try {
          var x = turf.intersect(circulo, f);
          if (x) area = turf.area(x);
        } catch (err) {
          var cc = turf.centroid(f).geometry.coordinates;      // si falla el recorte, se cuenta completo si su centro cae dentro
          if (dentroDe(cc)) area = turf.area(f);
        }
        if (area > 0) {
          if (CLASIF_VIAL.indexOf(f.properties && f.properties.clasif) >= 0) m2Vial += area;
          else { m2 += area; nParq++; }
        }
      });

      // Transporte: paradas y rutas
      var paradas = 0, masCerca = Infinity;
      datos.transporte[1].features.forEach(function (f) {
        if (!f.geometry) return;
        var c = f.geometry.coordinates;
        var d = turf.distance(centro, turf.point(c), { units: "kilometers" }) * 1000;
        if (d < masCerca) masCerca = d;
        if (d <= r) paradas++;
      });
      var rutas = {}, lineas = {};
      datos.transporte[0].features.forEach(function (f, i) {
        if (!f.geometry || !cruzaCaja(bbDe("rutas", datos.transporte[0].features, i), bb)) return;
        var cruza = false;
        try { cruza = turf.booleanIntersects(circulo, f); } catch (err) { cruza = false; }
        if (!cruza) return;
        var p = f.properties || {};
        rutas[p.clave || p.titulo] = true;
        if (p.titulo) lineas[p.titulo] = true;
      });
      var nRutas = Object.keys(rutas).length;
      var listaLineas = Object.keys(lineas).sort(function (a, b) { return a.localeCompare(b, "es", { numeric: true }); });
      var lineasTxt = listaLineas.length > 14 ? listaLineas.slice(0, 14).join(", ") + "…" : listaLineas.join(", ");

      var h = '<p class="rotulo-sec">Entorno en el radio</p><table class="tabla-datos">';
      h += grupoE("Escuelas");
      h += filaE("Total", num(totEsc));
      Object.keys(NIVELES).forEach(function (k) { h += filaE(NIVELES[k].nombre, num(porNivel[k])); });
      if (porNivel.otro) h += filaE("Otro nivel", num(porNivel.otro));
      if (hayAlumnos) h += filaE("Alumnos", num(alumnos));
      h += grupoE("Áreas verdes");
      h += filaE("Parques y áreas verdes", num(nParq));
      h += filaE("Superficie", num(m2) + " m²" + (m2 >= 10000 ? " (" + num(m2 / 10000, 2) + " ha)" : ""));
      h += filaE("Por habitante", pob > 0 ? num(m2 / pob, 1) + " m²/hab" : "Sin población");
      h += filaE("Referencia citada", REF_VERDE + " m²/hab");
      if (m2Vial > 0) h += filaE("Camellones y glorietas", num(m2Vial) + " m²");
      h += grupoE("Transporte público");
      h += filaE("Paradas en el radio", num(paradas));
      h += filaE("Parada más cercana", isFinite(masCerca) ? num(masCerca) + " m" : "Sin dato");
      h += filaE("Rutas que pasan", num(nRutas));
      if (lineasTxt) h += filaE("Líneas", esc(lineasTxt));
      h += "</table>";
      h += '<p class="menu-ayuda">Población: manzanas cuyo centro cae dentro del círculo. Áreas verdes recortadas al círculo; camellones y glorietas se muestran aparte y no entran en m²/hab. ' +
           "La parada más cercana se mide en línea recta desde el centro.</p>";
      pintarEntorno(h);
    }).catch(function (err) {
      if (yo !== tokenEntorno) return;
      pintarEntorno('<p class="resumen">No se pudo calcular el entorno: ' + esc(err.message) + "</p>");
    });
  }

  function activarEntorno() {
    var tabla = document.getElementById("tabla-radio");
    var resumen = document.getElementById("resumen-radio");
    if (!tabla || !resumen || document.getElementById("entorno-radio")) return;
    contEntorno = document.createElement("div");
    contEntorno.id = "entorno-radio";
    contEntorno.hidden = true;
    tabla.parentNode.insertBefore(contEntorno, tabla.nextSibling);
    // El análisis principal reescribe #resumen-radio cada vez que dibuja, mueve o limpia el radio.
    new MutationObserver(function () {
      clearTimeout(temporizadorEntorno);
      temporizadorEntorno = setTimeout(calcularEntorno, 150);
    }).observe(resumen, { childList: true, characterData: true, subtree: true });
  }

  // --------------------------------------------------------------- Init
  esperarMapa(function () {
    inyectarCSS();
    construirMenu();
    activarClics();
    activarEntorno();

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
