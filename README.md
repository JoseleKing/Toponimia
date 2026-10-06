# Toponimia

Juego diario de topónimos: cada día, tres lugares del mundo hispanohablante y una pregunta,
**¿qué significa su nombre?** PWA en HTML, CSS y JavaScript, sin compilación; se publica tal cual
en GitHub Pages.

## Cambiar la fecha de inicio

En `config.js`:

```js
const FECHA_INICIO = '2026-10-03';
```

Ese día es el nº 1, y se avanza uno cada medianoche (hora local del jugador). Pasado el último
día de `data/dias.json`, el ciclo vuelve a empezar por el primero; el número del día sigue
creciendo. Con 39 días, el último es el 10 de noviembre de 2026 y el 11 vuelve el día 1.

## Añadir días

Añade objetos al final de `data/dias.json`, con `dia` correlativo y tres rondas:

```json
{ "dia": 40, "rondas": [
  { "lugar": "…", "region": "…", "lengua": "latín", "original": "…",
    "correcta": "…", "opciones": ["…", "…", "…"], "nota": "…", "lat": 0, "lon": 0 }
]}
```

- `correcta` debe estar también en `opciones` (el orden da igual: se barajan solas, igual para todos).
- Ronda inversa: añade `"tipo": "inversa"` y `"pregunta": "¿Qué lugar significa «…»?"`; entonces
  `correcta` y `opciones` son topónimos. El significado de la ficha se toma de entre las comillas.
- En `nota`, `*texto*` se muestra en cursiva.
- `zoom` (opcional) ajusta el mini-mapa; si no, se usa 5, o 3 para regiones amplias.
- Lenguas nuevas: añade su color en `LENGUAS`, al principio de `app.js`.

Después sube `VERSION` en `sw.js` para que los jugadores reciban los cambios sin conexión.

## Probar

- `?dia=N` fuerza el día N (las partidas de prueba no se guardan ni cuentan en las estadísticas).
- En local: `python3 -m http.server` y abre `http://localhost:8000`.
- **Empezar de cero:** `http://localhost:8000/reiniciar/` borra la partida, el historial y la
  racha de ese navegador (clave `toponimia:v1` del `localStorage`), y las instrucciones vuelven
  a salir la primera vez.
