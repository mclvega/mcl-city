import './styles.css';

import { app } from './app';
import { audio, EMISORAS } from './audio';
import { MODOS } from './core/difficulty';
import { Entrada } from './core/input';
import { iniciarBucle } from './core/loop';
import { progresoNivel } from './core/respeto';
import { VEHICULOS } from './core/vehiculos';
import { iniciarPantallaCompleta } from './fullscreen';
import { controlesVacios, Partida, type Resumen } from './game/logica';
import type { Render3D } from './game/render3d';
import { Rendimiento, tamanoSombras } from './rendimiento';
import { limpiarNombre } from './storage';
import { panelConfiguracion } from './ui/configuracion';
import { boton, h, mostrarPanel } from './ui/dom';
import { dibujarHud } from './ui/hud';
import { panelMapa } from './ui/mapa';
import { ControlesPsp } from './ui/psp';
import { panelArmeria, panelCasa, panelComida } from './ui/tiendas';

const hud = document.getElementById('lienzo') as HTMLCanvasElement;
const ctx = hud.getContext('2d')!;
const lienzo3d = document.createElement('canvas');
lienzo3d.id = 'lienzo3d';
hud.before(lienzo3d);
const controles = document.getElementById('controles')!;
// Teclado y mando (misma disposición que el mando PSP en pantalla).
const entrada = new Entrada(
  [
    { nombre: 'disparar', teclas: [], mando: 1, etiqueta: '🔫' },
    { nombre: 'disparar2', teclas: [], mando: 7, etiqueta: '🔫' },
    { nombre: 'entrar', teclas: ['KeyF', 'Enter'], mando: 3, etiqueta: '🚗' },
    { nombre: 'correr', teclas: ['ShiftLeft', 'ShiftRight'], mando: 0, etiqueta: '🏃' },
    { nombre: 'saltar', teclas: ['Space'], mando: 2, etiqueta: '⤴' },
    { nombre: 'apuntar', teclas: [], mando: 5, etiqueta: '🎯' },
    { nombre: 'armaSig', teclas: ['KeyE'], mando: 4, etiqueta: '▶' },
    { nombre: 'armaAnt', teclas: ['KeyQ'], mando: 99, etiqueta: '◀' },
    { nombre: 'claxon', teclas: ['KeyH'], mando: 6, etiqueta: '📯' },
    { nombre: 'radio', teclas: ['KeyR'], mando: 10, etiqueta: '📻' },
    { nombre: 'camara', teclas: ['KeyC'], mando: 11, etiqueta: '🎥' },
    { nombre: 'mapa', teclas: ['KeyM'], mando: 8, etiqueta: '🗺️' },
    { nombre: 'pausa', teclas: ['KeyP'], mando: 9, etiqueta: '⏸' },
  ],
  controles,
);
const tactil = matchMedia('(pointer: coarse)').matches || (import.meta.env.DEV && location.search.includes('tactil'));
if (tactil) document.body.classList.add('tactil');

/* Mando PSP en pantalla con la distribución de los juegos de mundo abierto de PSP. */
const psp = new ControlesPsp(controles, {
  cuadrado: 'Saltar · Frenar', triangulo: 'Coche', cruz: 'Correr · Acelerar', circulo: 'Disparar', L: 'Cámara', R: 'Apuntar · Freno', select: 'Mapa', start: 'Pausa',
}, { crucetaBotones: true, etiquetasCruceta: { izquierda: 'Arma', derecha: 'Arma', arriba: 'Radio', abajo: 'Claxon' } });

let partida: Partida | null = null;
let render: Render3D | null = null;
let modulo3d: Promise<typeof import('./game/render3d')> | null = null;
const cargar3d = () => (modulo3d ??= import('./game/render3d'));

iniciarPantallaCompleta(() => app.g.config.pantallaCompleta);
app.aplicarConfig();

/* ---------- Tamaño ---------- */

const rend = new Rendimiento(() => app.g.config.calidad, () => app.g.config.limiteFps, () => ajustar());
let ancho = innerWidth;
let alto = innerHeight;
function ajustar() {
  ancho = innerWidth;
  alto = innerHeight;
  const dpr = Math.min(2, devicePixelRatio || 1);
  for (const c of [hud, lienzo3d]) {
    c.style.width = `${ancho}px`;
    c.style.height = `${alto}px`;
  }
  hud.width = Math.round(ancho * dpr);
  hud.height = Math.round(alto * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render?.ajustar(ancho, alto, rend.ratio);
}
addEventListener('resize', ajustar);
ajustar();

/* ---------- Cámara y ratón ---------- */

let giroX = 0;
let giroY = 0;
let ratonDisparo = false;
let ratonPulsado = false;
let ratonApuntar = false;
let ruedaArma: 1 | -1 | 0 = 0;
const sensibilidad = () => app.g.config.sensibilidad / 5;

addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== lienzo3d) return;
  giroX += e.movementX * 0.0022 * sensibilidad();
  giroY += e.movementY * 0.0022 * sensibilidad();
});
lienzo3d.addEventListener('mousedown', (e) => {
  if (!partida || tactil) return;
  if (document.pointerLockElement !== lienzo3d) {
    void lienzo3d.requestPointerLock();
    return;
  }
  if (e.button === 0) {
    ratonDisparo = true;
    ratonPulsado = true;
  }
  if (e.button === 2) ratonApuntar = true;
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) ratonDisparo = false;
  if (e.button === 2) ratonApuntar = false;
});
addEventListener('wheel', (e) => {
  if (document.pointerLockElement === lienzo3d) ruedaArma = e.deltaY > 0 ? 1 : -1;
});
addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== lienzo3d && partida && !partida.pausada && partida.fase === 'jugando' && !tactil && document.body.classList.contains('jugando')) pausar();
});

// Táctil: arrastrar en la pantalla mueve la cámara.
const GIRO_TACTIL = 0.0065;
const zonaMirar = h('div', { class: 'zona-mirar' });
controles.prepend(zonaMirar);
let toque = { id: -1, x: 0, y: 0 };
zonaMirar.addEventListener('pointerdown', (e) => {
  if (toque.id !== -1) return;
  zonaMirar.setPointerCapture(e.pointerId);
  toque = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
zonaMirar.addEventListener('pointermove', (e) => {
  if (e.pointerId !== toque.id) return;
  giroX += (e.clientX - toque.x) * GIRO_TACTIL * sensibilidad();
  giroY += (e.clientY - toque.y) * GIRO_TACTIL * sensibilidad();
  toque.x = e.clientX;
  toque.y = e.clientY;
});
const soltarToque = (e: PointerEvent) => e.pointerId === toque.id && (toque.id = -1);
zonaMirar.addEventListener('pointerup', soltarToque);
zonaMirar.addEventListener('pointercancel', soltarToque);

document.body.append(h('button', { type: 'button', class: 'boton-pausa', 'aria-label': 'Pausa', text: '⏸', onclick: () => pausar() }));

const vibrar = (ms: number) => app.g.config.vibracion && navigator.vibrate?.(ms);

/* ---------- Pantallas ---------- */

function jugando(si: boolean) {
  document.body.classList.toggle('jugando', si);
  if (!si) {
    entrada.limpiar();
    psp.limpiar();
    ratonDisparo = ratonApuntar = false;
    audio.motor(null);
    audio.sirena(0);
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (!tactil) void lienzo3d.requestPointerLock?.();
}

const AYUDA = tactil
  ? 'Stick: moverte o girar. Arrastra en la pantalla para la cámara. ✕ correr / acelerar, □ saltar / frenar, ○ disparar, △ subir o bajar del coche, R apuntar / freno de mano, L centrar la cámara. Cruceta: ◀ ▶ arma, ▲ radio, ▼ claxon. SELECT mapa, START pausa.'
  : 'WASD para moverte o conducir y ratón para la cámara. Clic izquierdo: disparar o golpear; derecho: apuntar. Mayús corre, Espacio salta (en coche, freno de mano). F sube o baja del coche. Q/E o la rueda: arma. H claxon, R radio, C centra la cámara, M mapa, P pausa.';

function bienvenida() {
  jugando(false);
  const campo = h('input', { type: 'text', maxlength: '20', placeholder: 'Tu nombre', 'aria-label': 'Tu nombre' }) as HTMLInputElement;
  const error = h('p', { class: 'error-campo', 'aria-live': 'polite' });
  const seguir = () => {
    const nombre = limpiarNombre(campo.value);
    if (!nombre) {
      error.textContent = 'Escribe tu nombre (hasta 20 caracteres).';
      return;
    }
    app.g.nombre = nombre;
    app.guardar();
    menu();
  };
  campo.addEventListener('keydown', (e) => e.key === 'Enter' && seguir());
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h1', { text: '🌆 McL City' }),
      h('p', { class: 'texto-suave', text: 'Una ciudad sin fin para ti solo. Sin misiones: roba coches, gana respeto y escapa de la policía.' }),
      campo,
      error,
      boton('Empezar', seguir, { variante: 'primario' }),
    ),
  );
  campo.focus();
}

function menu() {
  jugando(false);
  if (partida) {
    partida.sincronizar();
    app.guardar();
  }
  partida = null;
  audio.radio(-1);
  const pr = progresoNivel(app.g.respeto);
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h1', { text: '🌆 McL City' }),
      h('p', { class: 'texto-suave', text: `¡Hola, ${app.nombre()}! · ${app.g.dinero} $ · Respeto ${pr.nivel} (${Math.round(pr.fraccion * 100)} %)` }),
      boton('Jugar', empezar, { variante: 'primario', icono: '▶' }),
      boton(`Dificultad: ${MODOS[app.g.config.dificultad].nombre}`, () => configuracion(), { icono: '🎯' }),
      boton('Personaje', () => void import('./ui/personaje').then((m) => m.pantallaPersonaje(menu)), { icono: '👕' }),
      boton('Récords', records, { icono: '🏆' }),
      boton('Configuración', () => configuracion(), { icono: '⚙️' }),
      h('p', { class: 'texto-suave ayuda-texto', text: AYUDA }),
    ),
  );
}

function configuracion(volver: () => void = menu, enJuego = false) {
  mostrarPanel(
    h('div', { class: 'tarjeta ancha' },
      h('div', { class: 'cabecera' }, boton('Volver', () => volver(), { icono: '←' }), h('h2', { text: '⚙️ Configuración' })),
      panelConfiguracion({ enJuego, alReiniciar: () => (app.g.nombre ? configuracion(volver, enJuego) : bienvenida()) }),
    ),
  );
}

const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function records(volver: () => void = menu) {
  const e = app.g.estadisticas;
  const hb = app.g.habilidades;
  const dato = (t: string, v: string | number) => h('div', { class: 'fila-mejora' }, h('span', { text: t }), h('strong', { text: String(v) }));
  const filas = app.g.records.length
    ? app.g.records.map((r, i) => h('div', { class: 'fila-mejora' }, h('span', { text: `${i + 1}. ${r.nombre}` }), h('span', { text: `${'★'.repeat(r.estrellas)} · ${mmss(r.segundos)} · respeto ${r.nivel}` })))
    : [h('p', { class: 'texto-suave', text: 'Aún no hay persecuciones. ¡Que te busque la policía y escapa!' })];
  mostrarPanel(
    h('div', { class: 'tarjeta ancha' },
      h('div', { class: 'cabecera' }, boton('Volver', volver, { icono: '←' }), h('h2', { text: '🏆 Récords' })),
      dato('Nivel de respeto', progresoNivel(app.g.respeto).nivel),
      dato('Dinero', `${app.g.dinero} $ (máximo ${e.dineroMax} $)`),
      dato('Paquetes ocultos', app.g.paquetes.length),
      dato('Saltos únicos', app.g.saltos.length),
      dato('Coches robados', e.cochesRobados),
      dato('Coches destruidos', e.cochesDestruidos),
      dato('Distancia en coche', km(e.distanciaCoche)),
      dato('Distancia a pie', km(e.distanciaPie)),
      dato('Bajas (policías)', `${e.bajas} (${e.policias})`),
      dato('Muertes · arrestos', `${e.muertes} · ${e.arrestos}`),
      dato('Más estrellas', '★'.repeat(e.estrellasMax) || '—'),
      dato('Persecución más larga', mmss(e.persecucionMax)),
      h('h2', { text: '💪 Habilidades' }),
      dato('Aguante', `${Math.floor(hb.aguante)} %`),
      dato('Conducción', `${Math.floor(hb.conduccion)} %`),
      dato('Puntería', `${Math.floor(hb.punteria)} %`),
      h('h2', { text: '🚨 Mejores persecuciones' }),
      ...filas,
    ),
  );
}

/* ---------- Partida ---------- */

let marcaDano = 0;
let radioT = 0;
let emisora = Math.floor(Math.random() * EMISORAS.length);
let guardadoT = 0;
let estabaEnCoche = false;
/** Controles fijos de las escenas de prueba (solo en desarrollo). */
let controlesPrueba: Partial<ReturnType<typeof controlesVacios>> | null = null;

async function empezar() {
  audio.iniciar();
  const mod = await cargar3d();
  const p = new Partida(app.g, MODOS[app.g.config.dificultad]);
  p.nombreJugador = app.nombre();
  p.eventos = {
    disparo: (arma, d) => audio.efecto(arma === 'escopeta' ? 'escopeta' : 'disparo', 1 / (1 + d / 12)),
    golpe: (d) => audio.efecto('golpe', 1 / (1 + d / 10)),
    dano: () => {
      marcaDano = 0.6;
      audio.efecto('dano');
      vibrar(40);
    },
    explosion: (d) => {
      audio.efecto('explosion', 1.5 / (1 + d / 20));
      if (d < 25) vibrar(120);
    },
    dinero: () => audio.efecto('recoger'),
    nivel: () => audio.efecto('nivel'),
    estrellas: (antes, ahora) => ahora > antes && audio.efecto('estrella'),
    choque: (f) => {
      audio.efecto('choque', Math.min(1.5, f / 15));
      if (f > 6) vibrar(Math.min(120, f * 6));
    },
    puerta: () => audio.efecto('puerta'),
    recoger: () => audio.efecto('recoger'),
    pintura: () => audio.efecto('nivel'),
    tienda: (s) => tienda(s),
    fin: (r) => {
      app.guardar();
      setTimeout(() => finDePartida(r), 400);
    },
  };
  partida = p;
  if (import.meta.env.DEV) {
    (window as unknown as { __partida: Partida }).__partida = p;
    // Escenas de prueba para revisar el juego sin jugar a mano (?demo&prueba=coche|policia|tiroteo&hora=22).
    const q = new URLSearchParams(location.search);
    if (q.get('hora')) p.hora = Number(q.get('hora'));
    const prueba = q.get('prueba');
    const j = p.jugador;
    if (prueba === 'coche' || prueba === 'policia') {
      const v = p.crearVehiculo(prueba === 'policia' ? 'patrulla' : 'deportivo', j.cuerpo.x, Math.round(j.cuerpo.z / 60) * 60 + 2.6, Math.PI / 2);
      p.entrarEn(v);
      controlesPrueba = { acelerar: 1, x: 0.05 };
      if (prueba === 'policia') for (let n = 0; n < 4; n++) p.delito('matarPolicia');
    } else if (prueba === 'tiroteo') {
      p.darArma('fusil', 200);
      for (let n = 0; n < 4; n++) {
        const o = p.crearPersona('rival', j.cuerpo.x + Math.sin(p.camYaw) * (8 + n * 2) + n, j.cuerpo.z + Math.cos(p.camYaw) * (8 + n * 2));
        o.ia.modo = 'atacar';
        o.ia.enemigo = j;
      }
      controlesPrueba = { apuntar: true, disparar: true };
    }
  }
  if (!render) render = new mod.Render3D(lienzo3d);
  app.g.estadisticas.sesiones++;
  app.guardar();
  estabaEnCoche = false;
  ajustar();
  mostrarPanel(null);
  jugando(true);
}

function pausar() {
  const p = partida;
  if (!p || p.fase !== 'jugando' || p.pausada) return;
  p.pausada = true;
  p.sincronizar();
  app.guardar();
  jugando(false);
  audio.radio(-1);
  const pr = progresoNivel(app.g.respeto);
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: '⏸ Pausa' }),
      h('p', { class: 'texto-suave', text: `${p.zona} · ${p.g.dinero} $ · Respeto ${pr.nivel} (faltan ${pr.falta}) · Paquetes ${p.g.paquetes.length}` }),
      boton('Continuar', continuar, { variante: 'primario', icono: '▶' }),
      boton('Mapa', () => panelMapa(p, volverPausa), { icono: '🗺️' }),
      boton('Trucos', trucos, { icono: '🎮' }),
      boton('Récords', () => records(volverPausa), { icono: '🏆' }),
      boton('Configuración', () => configuracion(volverPausa, true), { icono: '⚙️' }),
      boton('Salir al menú', menu, { icono: '🚪' }),
    ),
  );
}

function volverPausa() {
  if (!partida) return menu();
  partida.pausada = false;
  pausar();
}

function continuar() {
  const p = partida;
  if (!p) return;
  p.pausada = false;
  mostrarPanel(null);
  jugando(true);
  if (p.jugador.coche) audio.radio(emisora);
}

function trucos() {
  const p = partida!;
  const campo = h('input', { type: 'text', maxlength: '20', placeholder: 'Escribe un truco', 'aria-label': 'Truco', autocomplete: 'off' }) as HTMLInputElement;
  const salida = h('p', { class: 'error-campo', 'aria-live': 'polite' });
  const probar = () => {
    const r = p.truco(campo.value);
    salida.textContent = r ? `✔ ${r}` : 'Ese truco no existe.';
    if (r) {
      audio.efecto('nivel');
      app.guardar();
    }
    campo.value = '';
  };
  campo.addEventListener('keydown', (e) => e.key === 'Enter' && probar());
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('div', { class: 'cabecera' }, boton('Volver', volverPausa, { icono: '←' }), h('h2', { text: '🎮 Trucos' })),
      campo,
      salida,
      boton('Probar', probar, { variante: 'primario' }),
      h('p', { class: 'ayuda-texto', text: 'Pistas: SALUDYPLATA, SINPOLICIA, MASESTRELLAS, ARSENAL, DEPORTIVO, INMORTAL, MEDIODIA, MEDIANOCHE.' }),
    ),
  );
  campo.focus();
}

/** Abre la tienda en la que acaba de entrar el jugador. */
function tienda(s: 'hospital' | 'policia' | 'armeria' | 'comida' | 'taller' | 'casa') {
  const p = partida;
  if (!p) return;
  p.pausada = true;
  jugando(false);
  audio.efecto('puerta');
  const cerrar = () => {
    p.pausada = false;
    app.guardar();
    mostrarPanel(null);
    jugando(true);
  };
  if (s === 'armeria') panelArmeria(p, cerrar);
  else if (s === 'comida') {
    panelComida(p, cerrar, () => {
      const botin = Math.round((150 + Math.random() * 350) * (1 + p.nivel * 0.1));
      p.ganarDinero(botin);
      p.delito('atraco');
      p.avisar(`¡Atraco! +${Math.round(botin * p.modo.dinero)} $`, 3);
      cerrar();
    });
  } else if (s === 'casa') {
    panelCasa(p, cerrar, () => void import('./ui/personaje').then((m) => m.pantallaPersonaje(() => tienda('casa'))));
  } else cerrar();
}

function finDePartida(r: Resumen) {
  const p = partida;
  if (!p) return;
  jugando(false);
  audio.radio(-1);
  const muerto = r.tipo === 'muerto';
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: muerto ? '💀 Has muerto' : '🚔 Te han arrestado' }),
      h('p', { class: 'texto-suave', text: `${mmss(r.tiempo)} de juego · ${r.dinero} $ ganados · ${r.coches} coches · ${r.bajas} bajas${r.estrellas ? ` · ${'★'.repeat(r.estrellas)}` : ''}` }),
      h('p', { class: 'texto-suave', text: r.perdida }),
      boton(muerto ? 'Reintentar (salir del hospital)' : 'Reintentar (salir de la comisaría)', () => {
        p.reaparecer(muerto ? 'hospital' : 'policia');
        app.guardar();
        mostrarPanel(null);
        jugando(true);
      }, { variante: 'primario', icono: '↻' }),
      boton('Menú', menu, { icono: '🏠' }),
    ),
  );
}

addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && tactil) pausar();
});
document.addEventListener('visibilitychange', () => document.hidden && pausar());

/* ---------- Bucle ---------- */

const diag = import.meta.env.DEV && location.search.includes('diag') ? document.body.appendChild(h('pre', { style: 'position:fixed;left:0;bottom:0;z-index:99;color:#0f0;background:#000a;font:12px monospace;margin:0' })) : null;
const DENSIDAD = { baja: 0.55, normal: 1, alta: 1.45 };
let fps = 60;
let ultimo = performance.now();
iniciarBucle(
  (dt) => rend.medir('logica', () => {
    entrada.actualizar();
    psp.actualizar();
    const p = partida;
    if (!p || p.pausada) {
      giroX = giroY = 0;
      return;
    }
    if (psp.pulsado('start') || entrada.pulsado('pausa')) return pausar();
    if (psp.pulsado('select') || entrada.pulsado('mapa')) {
      pausar();
      if (partida?.pausada) panelMapa(partida, volverPausa);
      return;
    }
    const c = controlesVacios();
    const enCoche = p.jugador.estado === 'coche';
    const mx = entrada.x || psp.x;
    const mz = entrada.y || psp.y;
    c.x = mx;
    c.z = mz;
    c.giroX = giroX;
    c.giroY = giroY;
    giroX = giroY = 0;
    const disparo = ratonDisparo || entrada.activo('disparar') || entrada.activo('disparar2') || psp.activo('circulo');
    c.disparar = disparo;
    c.dispararPulsado = ratonPulsado || entrada.pulsado('disparar') || entrada.pulsado('disparar2') || psp.pulsado('circulo');
    ratonPulsado = false;
    c.apuntar = ratonApuntar || (!enCoche && (entrada.activo('apuntar') || psp.activo('R')));
    c.correr = entrada.activo('correr') || psp.activo('cruz');
    c.saltar = entrada.pulsado('saltar') || psp.pulsado('cuadrado');
    c.entrar = entrada.pulsado('entrar') || psp.pulsado('triangulo');
    c.armaSiguiente = entrada.pulsado('armaSig') || psp.flecha('derecha') || ruedaArma === 1;
    c.armaAnterior = entrada.pulsado('armaAnt') || psp.flecha('izquierda') || ruedaArma === -1;
    ruedaArma = 0;
    c.claxon = entrada.activo('claxon') || psp.flechaActiva('abajo');
    if (enCoche) {
      // Teclado: W/S aceleran y frenan; mando y PSP: ✕ acelera y □ frena.
      c.acelerar = Math.max(entrada.y < -0.3 ? -entrada.y : 0, entrada.activo('correr') || psp.activo('cruz') ? 1 : 0);
      c.frenar = Math.max(entrada.y > 0.3 ? entrada.y : 0, psp.activo('cuadrado') || entrada.activo('saltar') && tactil ? 1 : 0);
      c.mano = entrada.activo('saltar') && !tactil || entrada.activo('apuntar') || psp.activo('R');
      if (entrada.pulsado('claxon') || psp.flecha('abajo')) audio.efecto('claxon');
    }
    if (entrada.pulsado('camara') || psp.pulsado('L')) p.camYaw = p.jugador.coche ? p.jugador.coche.yaw : p.jugador.yaw;
    c.asistido = app.g.config.apuntadoAuto;
    c.camaraAuto = app.g.config.camaraAuto;
    p.densidad = DENSIDAD[app.g.config.densidad];
    p.modo = MODOS[app.g.config.dificultad];
    if (import.meta.env.DEV && controlesPrueba) Object.assign(c, controlesPrueba);
    p.actualizar(dt, c);

    // Radio al subir al coche.
    const ahoraEnCoche = p.jugador.estado === 'coche';
    if (ahoraEnCoche !== estabaEnCoche) {
      estabaEnCoche = ahoraEnCoche;
      if (ahoraEnCoche) {
        audio.radio(emisora);
        radioT = 2.5;
      } else audio.radio(-1);
    }
    if (ahoraEnCoche && (entrada.pulsado('radio') || psp.flecha('arriba'))) {
      emisora = emisora + 1 >= EMISORAS.length ? -1 : emisora + 1;
      audio.radio(emisora);
      radioT = 2.5;
    }
    radioT = Math.max(0, radioT - dt);
    marcaDano = Math.max(0, marcaDano - dt);
    guardadoT += dt;
    if (guardadoT > 20) {
      guardadoT = 0;
      p.sincronizar();
      app.guardar();
    }
  }),
  () => {
    const ahora = performance.now();
    const p = partida;
    if (!rend.debeDibujar(ahora, !p || p.pausada)) return;
    const dt = Math.min(0.1, (ahora - ultimo) / 1000);
    fps = fps * 0.9 + (1 / Math.max(0.001, dt)) * 0.1;
    ultimo = ahora;
    if (p && render) {
      const r = render;
      r.sombras(tamanoSombras(app.g.config.calidad));
      rend.medir('render', () => r.dibujar(p, app.g.look, { efectos: !app.g.config.animacionesReducidas, distancia: app.g.config.calidad === 'baja' ? 170 : 250, oscuro: app.g.config.tema === 'oscuro' }, dt));
      dibujarHud(ctx, p, ancho, alto, {
        tactil,
        dano: marcaDano,
        radio: emisora >= 0 ? `📻 ${EMISORAS[emisora].nombre}` : '📻 Radio apagada',
        radioT,
        proyectar: (x, y, z) => r.proyectar(x, y, z, ancho, alto),
      });
      // Sonido del motor y sirenas cercanas.
      if (!p.pausada && document.body.classList.contains('jugando')) {
        const v = p.jugador.coche;
        audio.motor(v ? Math.min(1, Math.hypot(v.vx, v.vz) / VEHICULOS[v.tipo].velMax + v.mandos.acelerar * 0.15) : null);
        const pos = p.posJugador();
        let sirena = 0;
        for (const o of p.vehiculos) if (o.sirena && o !== v) sirena = Math.max(sirena, 1 - Math.hypot(o.x - pos.x, o.z - pos.z) / 90);
        audio.sirena(Math.max(0, sirena));
      }
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, ancho, alto);
    }
    if (app.g.config.mostrarFps) {
      ctx.fillStyle = '#9f9';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.round(fps)} FPS`, 8, alto - 8);
    }
    rend.actualizarMonitor(render?.renderer ?? null);
    if (import.meta.env.DEV && diag && p) {
      const c = p.camara();
      const pos = p.posJugador();
      diag.textContent = `t=${p.tiempo.toFixed(1)} fase=${p.fase} pausa=${p.pausada} cam=${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)} pos=${pos.x.toFixed(1)},${pos.z.toFixed(1)} personas=${p.personas.length} coches=${p.vehiculos.length} fps=${fps.toFixed(0)} llamadas=${render?.renderer.info.render.calls}`;
    }
  },
);


if (import.meta.env.DEV) {
  // En desarrollo, los errores se ven en pantalla (útil para capturas sin consola).
  addEventListener('error', (e) => document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;left:0;top:0;z-index:99;color:#f66;background:#000c;font:12px monospace;white-space:pre-wrap">${e.message}
${e.error?.stack ?? ''}</pre>`));
}
if (import.meta.env.DEV && location.search.includes('demo')) void empezar();
else if (app.g.nombre) menu();
else bienvenida();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
addEventListener('load', () => setTimeout(() => void cargar3d(), 800));
