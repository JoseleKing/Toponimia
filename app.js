/* Toponimia · app.js
   Tres lugares al día, los mismos para todos. Sin servidor: el día sale de la fecha local
   (FECHA_INICIO, en config.js) y la partida se guarda en localStorage. */
'use strict';

const CLAVE = 'toponimia:v1';
const RONDAS = 3;
const MS_DIA = 86400000;

const ESTADISTICAS_INICIALES = { jugadas: 0, aciertos: 0, racha: 0, rachaMax: 0, ultimoDia: 0 };

/** Color de la etiqueta de cada lengua. Las compuestas («italiano / español») usan la primera. */
const LENGUAS = {
  'latín': '#7A5C3E',
  'griego': '#4F6A7A',
  'árabe': '#3F6B5C',
  'fenicio': '#6B4E71',
  'púnico': '#6B4E71',
  'hebreo': '#5E5A82',
  'náhuatl': '#9A6A2F',
  'purépecha': '#8A5A44',
  'maya': '#5F7A45',
  'quechua': '#8C4F3A',
  'guaraní': '#4E7A63',
  'taíno': '#3D7378',
  'mapudungun': '#6E6448',
  'yagán': '#4A6A80',
  'guanche': '#8A6A3A',
  'bubi': '#5A7058',
  'aimara': '#7A4A5E',
  'caddo': '#5B6E3A',
  'español': '#A0453A',
  'italiano': '#47658C',
  'portugués': '#6C7F3A',
  'francés': '#5A5F8C',
  'inglés': '#5C6670',
  'vasco': '#7E3F4D',
  'catalán': '#8C5A2E',
  'celta': '#56704F',
  'germánico': '#6A6A5A',
};
const LENGUA_POR_DEFECTO = '#8A7B6B';

/** Regiones tan amplias que el mini-mapa se ve mejor más alejado. */
const REGIONES_AMPLIAS = ['Sudamérica', 'Centroamérica', 'Estados Unidos', 'Estados Unidos / México'];

const CHINCHETA =
  '<svg viewBox="0 0 24 34" width="24" height="34" aria-hidden="true">' +
  '<path d="M12 33C10 26 2 20.5 2 12a10 10 0 0 1 20 0c0 8.5-8 14-10 21z" fill="#B23A2E" stroke="#7E2A21" stroke-width="1.2"/>' +
  '<circle cx="12" cy="12" r="3.6" fill="#FBF6EC"/></svg>';

const app = document.getElementById('app');
const aviso = document.getElementById('aviso');
const panel = document.getElementById('estadisticas');
const reglas = document.getElementById('reglas');

let DIAS = [];
let mapa = null;

const parametros = new URLSearchParams(location.search);
/** Modo prueba: ?dia=3 fuerza el día 3 sin tocar la partida ni las estadísticas guardadas. */
const diaPrueba = /^\d+$/.test(parametros.get('dia') || '') ? Math.max(1, Number(parametros.get('dia'))) : 0;
/** En modo prueba las respuestas solo viven en memoria (se pierden al recargar). */
let respuestasPrueba = [];

let guardado = cargar();
let diaMostrado = 0;
/** Ronda en pantalla (0, 1, 2) o RONDAS para el resultado. */
let vista = 0;
/** La ficha solo se anima justo al responder, no al volver a pintarla. */
let animarFicha = false;

/* ---------- Almacenamiento ---------- */

function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo) return JSON.parse(crudo);
  } catch (e) {
    // Sin almacenamiento (modo privado, etc.): se juega igual, sin memoria.
  }
  return { estadisticas: { ...ESTADISTICAS_INICIALES }, resultados: {}, partida: null };
}

function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(guardado));
  } catch (e) {
    // Ídem.
  }
}

/* ---------- Fechas (hora local) ---------- */

/** Número del día de hoy (nº 1 el día de FECHA_INICIO). Puede ser 0 o negativo antes de empezar. */
function numeroDeHoy() {
  const [a, m, d] = FECHA_INICIO.split('-').map(Number);
  const ahora = new Date();
  // Date.UTC con las fechas locales: así el cambio de hora no descuadra la cuenta.
  const hoy = Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  return Math.round((hoy - Date.UTC(a, m - 1, d)) / MS_DIA) + 1;
}

function cuentaAtras() {
  const ahora = new Date();
  const manana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1);
  const s = Math.max(0, Math.floor((manana - ahora) / 1000));
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(Math.floor(s / 3600))}:${dos(Math.floor(s / 60) % 60)}:${dos(s % 60)}`;
}

function fechaLarga(numero) {
  const [a, m, d] = FECHA_INICIO.split('-').map(Number);
  return new Date(a, m - 1, d + numero - 1).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

/* ---------- Rondas ---------- */

/** Rondas del día `numero`: al acabarse los días, el ciclo vuelve a empezar por el primero. */
function rondasDe(numero) {
  if (numero < 1 || !DIAS.length) return null;
  const enCiclo = ((numero - 1) % DIAS.length) + 1;
  const dia = DIAS.find((d) => d.dia === enCiclo);
  return dia ? dia.rondas : null;
}

const esInversa = (r) => r.tipo === 'inversa';

/** El significado: en las inversas va entre comillas en la pregunta. */
function significado(r) {
  if (!esInversa(r)) return r.correcta;
  const m = /«([^»]+)»/.exec(r.pregunta || '');
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : '';
}

/** Generador pseudoaleatorio determinista (mulberry32): todos ven las opciones en el mismo orden. */
function aleatorio(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function opcionesDe(numero, indice, r) {
  const rnd = aleatorio(numero * 7919 + indice * 104729);
  const opciones = [...r.opciones];
  for (let i = opciones.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [opciones[i], opciones[j]] = [opciones[j], opciones[i]];
  }
  return opciones;
}

function respuestasDe(numero) {
  if (diaPrueba) return respuestasPrueba;
  return guardado.partida && guardado.partida.dia === numero ? guardado.partida.respuestas : [];
}

function aciertosDe(rondas, respuestas) {
  return respuestas.map((resp, i) => resp === rondas[i].correcta);
}

/* ---------- Estadísticas ---------- */

/** La racha cuenta los días seguidos en que se termina la partida, se acierte o no. */
function registrarDia(e, dia, aciertos) {
  if (e.ultimoDia === dia) return e;
  const racha = e.ultimoDia === dia - 1 ? e.racha + 1 : 1;
  return {
    jugadas: e.jugadas + 1,
    aciertos: e.aciertos + aciertos.filter(Boolean).length,
    racha,
    rachaMax: Math.max(e.rachaMax, racha),
    ultimoDia: dia,
  };
}

/** Si se salta un día, la racha se pierde. */
function rachaVigente(e, hoy) {
  return e.ultimoDia >= hoy - 1 ? e.racha : 0;
}

/* ---------- Interfaz ---------- */

function esc(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Escapa y convierte *cursiva* en <em>. */
function enriquecer(texto) {
  return esc(texto).replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function numeroActual() {
  return diaPrueba || numeroDeHoy();
}

function quitarMapa() {
  if (mapa) {
    mapa.remove();
    mapa = null;
  }
}

/** Con los tres lugares de hoy jugados, la mano ☜ marca Toponimia como «Hecho» en Almanaque,
    y su hoja muestra los aciertos del día y la racha. */
function avisarAlmanaque(numero, rondas, respuestas) {
  const aciertos = aciertosDe(rondas, respuestas);
  const avisar = () => window.almanaqueHecho?.({
    aciertos: aciertos.filter(Boolean).length,
    total: aciertos.length,
    racha: rachaVigente(guardado.estadisticas, numero),
  });
  // app.js va antes que volver-almanaque.js (los dos con defer): si aún no existe,
  // se espera a DOMContentLoaded, que llega después de todos los scripts con defer.
  if (window.almanaqueHecho) avisar();
  else document.addEventListener('DOMContentLoaded', avisar, { once: true });
}

function render() {
  quitarMapa();
  const numero = numeroActual();
  const rondas = rondasDe(numero);

  if (numero < 1) return pintarFuera(antesDeEmpezar());

  if (numero !== diaMostrado) {
    diaMostrado = numero;
    vista = Math.min(respuestasDe(numero).length, RONDAS);
  }
  const respuestas = respuestasDe(numero);
  if (respuestas.length === RONDAS && !diaPrueba) avisarAlmanaque(numero, rondas, respuestas);

  app.innerHTML = `
    ${diaPrueba ? avisoPrueba(numero) : ''}
    ${progreso(rondas, respuestas)}
    ${vista < RONDAS ? ronda(numero, vista, rondas[vista], respuestas[vista]) : resultado(numero, rondas, respuestas)}
  `;
  animarFicha = false;

  app.querySelectorAll('.opcion').forEach((b) =>
    b.addEventListener('click', () => responder(numero, vista, b.dataset.valor)),
  );
  const seguir = app.querySelector('#seguir');
  if (seguir) {
    seguir.addEventListener('click', () => {
      vista++;
      render();
      scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  const compartirBoton = app.querySelector('#compartir');
  if (compartirBoton) compartirBoton.addEventListener('click', () => compartir(numero, aciertosDe(rondas, respuestas)));

  const contenedor = app.querySelector('.mapa');
  if (contenedor) montarMapa(contenedor, rondas[vista]);
}

function pintarFuera(html) {
  diaMostrado = 0;
  app.innerHTML = html;
}

function antesDeEmpezar() {
  return `
    <section class="mensaje">
      <img src="icons/toponimia-logo.svg" width="96" height="96" alt="">
      <h2>Todavía no</h2>
      <p>Toponimia empieza el ${esc(fechaLarga(1))}. ¡Vuelve entonces!</p>
    </section>`;
}

function avisoPrueba(numero) {
  const enlace = (n, texto, etiqueta) =>
    `<a href="?dia=${n}" aria-label="${etiqueta}" ${n < 1 ? 'aria-disabled="true" tabindex="-1"' : ''}>${texto}</a>`;
  return `
    <p class="prueba">
      ${enlace(numero - 1, '‹', 'Día anterior')}
      <span>Modo prueba · día ${numero}${numero <= DIAS.length ? ` de ${DIAS.length}` : ''}</span>
      ${enlace(numero + 1, '›', 'Día siguiente')}
    </p>`;
}

function progreso(rondas, respuestas) {
  const aciertos = aciertosDe(rondas, respuestas);
  const pasos = rondas.map((_, i) => {
    const estado = i < aciertos.length ? (aciertos[i] ? 'bien' : 'mal') : '';
    const texto = i < aciertos.length ? (aciertos[i] ? ', acertada' : ', fallada') : '';
    return `<li class="${estado} ${i === vista ? 'actual' : ''}" ${i === vista ? 'aria-current="step"' : ''}><span class="visualmente-oculto">Ronda ${i + 1}${texto}</span></li>`;
  }).join('');
  return `<ol class="progreso" aria-label="Rondas del día">${pasos}</ol>`;
}

function ronda(numero, indice, r, respuesta) {
  const jugada = respuesta !== undefined;
  const inversa = esInversa(r);
  const opciones = opcionesDe(numero, indice, r)
    .map((op) => {
      let estado = '';
      let senal = '';
      if (jugada) {
        if (op === r.correcta) {
          estado = 'correcta';
          senal = '<span class="senal" aria-label="Correcta">✓</span>';
        } else if (op === respuesta) {
          estado = 'fallada';
          senal = '<span class="senal" aria-label="Tu respuesta">✗</span>';
        } else {
          estado = 'apagada';
        }
      }
      return `<button class="opcion ${inversa ? 'toponimo' : ''} ${estado}" type="button" data-valor="${esc(op)}" ${jugada ? 'disabled' : ''}>
          <span>${esc(op)}</span>${senal}
        </button>`;
    })
    .join('');

  const enunciado = inversa
    ? `<p class="pregunta-inversa">${esc(r.pregunta)}</p>`
    : `<h2 class="toponimo-grande">${esc(r.lugar)}</h2><p class="pregunta">¿Qué significa su nombre?</p>`;

  return `
    <section class="reto">
      <p class="ronda-numero">Nº ${numero} · Ronda ${indice + 1} de ${RONDAS}${inversa ? ' · <span class="del-reves">del revés</span>' : ''}</p>
      ${enunciado}
      <div class="opciones">${opciones}</div>
    </section>
    ${jugada ? ficha(r, respuesta === r.correcta, indice === RONDAS - 1) : ''}
  `;
}

function etiquetaLengua(lengua) {
  const principal = lengua.split('/')[0].trim().toLowerCase();
  const color = LENGUAS[principal] || LENGUA_POR_DEFECTO;
  return `<span class="lengua" style="--color-lengua:${color}">${esc(lengua)}</span>`;
}

function ficha(r, acierto, ultima) {
  const inversa = esInversa(r);
  const titulo = inversa ? r.correcta : r.lugar;
  const donde = r.lugar !== titulo ? `${r.lugar} · ${r.region}` : r.region;
  return `
    <section class="ficha ${animarFicha ? 'entra' : ''}">
      <p class="veredicto ${acierto ? 'bien' : 'mal'}">
        ${acierto ? '<span aria-hidden="true">✓</span> ¡Correcto!' : `<span aria-hidden="true">✗</span> Era «${esc(r.correcta)}»`}
      </p>
      <h3 class="ficha-lugar">${esc(titulo)}</h3>
      <p class="ficha-region">${esc(donde)}</p>
      <p class="origen"><em class="original">${esc(r.original)}</em> ${etiquetaLengua(r.lengua)}</p>
      <p class="significado"><span class="rotulo">Significa</span> ${esc(significado(r))}</p>
      <p class="nota">${enriquecer(r.nota)}</p>
      ${window.L ? `<div class="mapa" role="img" aria-label="Mapa: ${esc(r.lugar)}, ${esc(r.region)}"></div>` : ''}
    </section>
    <button id="seguir" class="boton" type="button">${ultima ? 'Ver resultado' : 'Siguiente'}</button>
  `;
}

/* ---------- Mini-mapa ---------- */

function montarMapa(contenedor, r) {
  const zoom = r.zoom || (REGIONES_AMPLIAS.includes(r.region) ? 3 : 5);
  mapa = L.map(contenedor, {
    center: [r.lat, r.lon],
    zoom,
    zoomControl: false,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    tap: false,
    attributionControl: true,
  });
  mapa.attributionControl.setPrefix(false);

  let cargadas = 0;
  // Esri Light Gray Canvas: claro, discreto y sin clave (CARTO ya pide clave de API).
  // Con el modo oscuro elegido en Almanaque, su pareja Dark Gray.
  const base = document.documentElement.dataset.theme === 'dark' ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base';
  const capa = L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${base}/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: 16,
    crossOrigin: true,
    attribution: 'Teselas © <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> — Esri, HERE, Garmin, © OpenStreetMap',
  });
  capa.on('tileload', () => {
    cargadas++;
    contenedor.classList.add('cargado');
  });
  // Sin teselas (sin conexión): el mapa se retira y la ficha queda limpia.
  const retirar = () => {
    if (cargadas === 0 && contenedor.isConnected) {
      quitarMapa();
      contenedor.remove();
    }
  };
  capa.on('load', retirar);
  setTimeout(retirar, 8000);
  capa.addTo(mapa);

  L.marker([r.lat, r.lon], {
    icon: L.divIcon({ className: 'chincheta', html: CHINCHETA, iconSize: [24, 34], iconAnchor: [12, 33] }),
    keyboard: false,
    interactive: false,
  }).addTo(mapa);
}

/* ---------- Resultado ---------- */

function resultado(numero, rondas, respuestas) {
  const aciertos = aciertosDe(rondas, respuestas);
  const total = aciertos.filter(Boolean).length;
  const e = guardado.estadisticas;
  const frases = ['Hoy el mapa se resistió.', 'Un buen comienzo de viaje.', '¡Casi perfecto!', '¡Pleno de topónimos!'];
  const lista = rondas
    .map(
      (r, i) => `
        <li>
          <span class="marca ${aciertos[i] ? 'bien' : 'mal'}" aria-label="${aciertos[i] ? 'Acierto' : 'Fallo'}">${aciertos[i] ? '✓' : '✗'}</span>
          <span class="lista-lugar">${esc(esInversa(r) ? r.correcta : r.lugar)}</span>
          <span class="lista-significado">${esc(significado(r))}</span>
        </li>`,
    )
    .join('');

  return `
    <section class="resultado">
      <p class="ronda-numero">Toponimia nº ${numero}</p>
      <p class="cuadros" aria-hidden="true">${aciertos.map((a) => `<span class="${a ? 'bien' : 'mal'}"></span>`).join('')}</p>
      <h2>${total} de ${RONDAS}</h2>
      <p class="frase">${frases[total]}</p>
      ${diaPrueba ? '' : `<p class="racha-hoy">Racha: <strong>${rachaVigente(e, numero)}</strong> ${rachaVigente(e, numero) === 1 ? 'día' : 'días'}</p>`}
      <ol class="lista-resultado">${lista}</ol>
    </section>

    <button id="compartir" class="boton" type="button">Compartir</button>
    <a class="boton boton-secundario" data-almanaque-volver hidden href="https://joseleking.github.io/Almanaque/">☜ Regresar al Almanaque</a>
    ${diaPrueba ? '' : `<p class="siguiente">Nuevos lugares en <time id="cuenta">${cuentaAtras()}</time></p>`}
  `;
}

/* ---------- Panel de estadísticas ---------- */

function pintarEstadisticas() {
  const e = guardado.estadisticas;
  const hoy = numeroDeHoy();
  const porcentaje = e.jugadas ? Math.round((e.aciertos / (e.jugadas * RONDAS)) * 100) : 0;
  const dias = Object.keys(guardado.resultados || {}).map(Number).sort((a, b) => b - a);
  const historial = dias.length
    ? `<h3>Tus días</h3>
       <ol class="historial">${dias
         .map((d) => `<li><span>nº ${d}</span><span class="mini-cuadros" aria-label="${guardado.resultados[d].filter(Boolean).length} de ${RONDAS}">${guardado.resultados[d].map((a) => `<span class="${a ? 'bien' : 'mal'}"></span>`).join('')}</span></li>`)
         .join('')}</ol>`
    : '<p class="vacio">Aún no has terminado ninguna partida.</p>';

  document.getElementById('estadisticas-cuerpo').innerHTML = `
    <div class="cifras">
      <div><strong>${e.jugadas}</strong><span>jugadas</span></div>
      <div><strong>${e.aciertos}</strong><span>aciertos</span></div>
      <div><strong>${porcentaje}%</strong><span>acierto</span></div>
      <div><strong>${rachaVigente(e, hoy)}</strong><span>racha</span></div>
      <div><strong>${e.rachaMax}</strong><span>mejor racha</span></div>
    </div>
    ${historial}
    ${diaPrueba ? '<p class="vacio">En modo prueba las partidas no cuentan.</p>' : ''}
  `;
}

panel.querySelector('.cerrar').addEventListener('click', () => panel.close());
panel.addEventListener('click', (ev) => {
  if (ev.target === panel) panel.close();
});
document.getElementById('abrir-estadisticas').addEventListener('click', () => {
  pintarEstadisticas();
  panel.showModal();
});

/* ---------- Reglas ---------- */

reglas.querySelectorAll('.cerrar, .empezar').forEach((b) => b.addEventListener('click', () => reglas.close()));
reglas.addEventListener('click', (ev) => {
  if (ev.target === reglas) reglas.close();
});
document.getElementById('abrir-reglas').addEventListener('click', () => {
  reglas.scrollTop = 0;
  reglas.showModal();
});

/** La primera vez que se abre el juego, las reglas salen solas. */
function reglasPrimeraVez() {
  if (guardado.reglasVistas) return;
  reglas.showModal();
  guardado = { ...guardado, reglasVistas: true };
  guardar();
}

/* ---------- Acciones ---------- */

function responder(numero, indice, valor) {
  const respuestas = respuestasDe(numero);
  if (respuestas.length !== indice) return;
  const nuevas = [...respuestas, valor];
  if (diaPrueba) {
    respuestasPrueba = nuevas;
  } else {
    let { estadisticas, resultados = {} } = guardado;
    if (nuevas.length === RONDAS) {
      const aciertos = aciertosDe(rondasDe(numero), nuevas);
      estadisticas = registrarDia(estadisticas, numero, aciertos);
      resultados = { ...resultados, [numero]: aciertos };
    }
    guardado = { ...guardado, estadisticas, resultados, partida: { dia: numero, respuestas: nuevas } };
    guardar();
  }
  animarFicha = true;
  render();
  const revelada = app.querySelector('.ficha');
  if (revelada) setTimeout(() => revelada.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
}

// Una marca por lugar: ▰ acertado, ▱ fallado. «Toponimia nº 7 ▰▱▰ 2/3 aciertos» y el enlace.
function textoCompartir(numero, aciertos) {
  const marcas = aciertos.map((a) => (a ? '▰' : '▱')).join('');
  return `Toponimia nº ${numero} ${marcas} ${aciertos.filter(Boolean).length}/${aciertos.length} aciertos\njoseleking.github.io/Toponimia`;
}

async function compartir(numero, aciertos) {
  const texto = textoCompartir(numero, aciertos);
  try {
    if (navigator.share) {
      await navigator.share({ text: texto });
      return;
    }
    await navigator.clipboard.writeText(texto);
    mostrarAviso('Resultado copiado');
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    mostrarAviso('No se pudo compartir');
  }
}

function mostrarAviso(texto) {
  aviso.textContent = texto;
  aviso.classList.add('visible');
  setTimeout(() => aviso.classList.remove('visible'), 2000);
}

/* ---------- Arranque ---------- */

/**
 * La portada con el logo se ve al menos 1,5 s desde que se abre la página (y 1,4 s desde que se
 * pinta, por si tarda la primera visita) y luego se desvanece. `despues` corre poco después de
 * empezar el fundido.
 */
function retirarPortada(despues) {
  const portada = document.getElementById('portada');
  if (!portada) return despues?.();
  const pintada = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? performance.now();
  setTimeout(() => {
    portada.classList.add('oculta');
    setTimeout(() => portada.remove(), 500);
    if (despues) setTimeout(despues, 350);
  }, Math.max(0, 1500 - performance.now(), 1400 - (performance.now() - pintada)));
}

async function iniciar() {
  try {
    DIAS = await fetch('data/dias.json').then((r) => r.json());
  } catch (err) {
    app.innerHTML = '<p class="error">No se han podido cargar los lugares. Prueba a recargar la página.</p>';
    retirarPortada();
    return;
  }

  render();
  retirarPortada(reglasPrimeraVez);

  // Cada segundo: la cuenta atrás y, a medianoche, el día nuevo.
  let ultimoNumero = numeroDeHoy();
  setInterval(() => {
    const hoy = numeroDeHoy();
    if (!diaPrueba && hoy !== ultimoNumero) {
      ultimoNumero = hoy;
      return render();
    }
    const cuenta = document.getElementById('cuenta');
    if (cuenta) cuenta.textContent = cuentaAtras();
  }, 1000);
}

iniciar();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}
