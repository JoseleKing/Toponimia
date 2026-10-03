/* Toponimia · sw.js
   Service worker sencillo para jugar sin conexión.
   - Archivos propios: primero la red (así llegan los días y cambios nuevos)
     y, si no hay conexión, la copia guardada.
   - Fuentes, Leaflet y teselas del mapa: primero la caché, porque no cambian.
   Si cambias la lista de archivos, sube el número de VERSION. */

const VERSION = 'toponimia-v3';
const EXTERNOS = 'toponimia-externos';
const MAX_EXTERNOS = 250;

const ARCHIVOS = [
  './',
  'index.html',
  'styles.css',
  'config.js',
  'app.js',
  'volver-almanaque.js',
  'data/dias.json',
  'manifest.webmanifest',
  'icons/toponimia-logo.svg',
  'icons/toponimia-icono.svg',
  'icons/toponimia-32.png',
  'icons/toponimia-180.png',
  'icons/toponimia-192.png',
  'icons/toponimia-512.png',
  'icons/toponimia-maskable-512.png',
];

const LEAFLET = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
];

const HOSTS_EXTERNOS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    Promise.all([
      caches.open(VERSION).then((cache) => cache.addAll(ARCHIVOS)),
      // Leaflet, si se puede; sin él el juego funciona igual, solo que sin mapa.
      caches.open(EXTERNOS).then((cache) => cache.addAll(LEAFLET.map((u) => new Request(u, { mode: 'cors' })))).catch(() => {}),
    ]).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((c) => c !== VERSION && c !== EXTERNOS).map((c) => caches.delete(c)),
      ))
      .then(() => self.clients.claim()),
  );
});

/** Recorta la caché de externos para que las teselas no crezcan sin límite. */
async function recortar(cache) {
  const claves = await cache.keys();
  for (let i = 0; i < claves.length - MAX_EXTERNOS; i++) await cache.delete(claves[i]);
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;
  const url = new URL(peticion.url);

  if (HOSTS_EXTERNOS.includes(url.hostname) || url.hostname === 'server.arcgisonline.com') {
    evento.respondWith(
      caches.open(EXTERNOS).then((cache) =>
        cache.match(peticion).then((enCache) =>
          enCache || fetch(peticion).then((respuesta) => {
            if (respuesta.ok || respuesta.type === 'opaque') {
              cache.put(peticion, respuesta.clone()).then(() => recortar(cache));
            }
            return respuesta;
          }),
        ),
      ),
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // Archivos propios: red primero y, sin conexión, la caché. (?dia=… sirve la misma página.)
  evento.respondWith(
    fetch(peticion)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put(peticion, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(peticion, { ignoreSearch: true })
        .then((enCache) => enCache || (peticion.mode === 'navigate' ? caches.match('./') : undefined))),
  );
});
