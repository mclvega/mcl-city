import { ARMAS, dispersionCon, ORDEN_ARMAS, type IdArma } from '../core/armas';
import { actualizarBuscado, borrarBuscado, buscadoNuevo, estrellasDe, sumarDelito, UMBRALES, type Buscado, type Delito } from '../core/buscado';
import { CELDA, Ciudad, DISTRITOS, DIRS, nombreZona, SERVICIOS, type Servicio } from '../core/ciudad';
import type { Modo } from '../core/difficulty';
import { moverCuerpo, rayoCajaGirada, rayoCilindro, type Bloque, type Cuerpo } from '../core/fisica';
import { escalaNivel, nivelDe, PREMIOS } from '../core/respeto';
import { crearRng, type Rng } from '../core/rng';
import { avanzarHora, luzDelDia } from '../core/tiempo';
import { circulosVehiculo, mandosVacios, pasoVehiculo, tipoTrafico, VEHICULOS, velocidadAdelante, type EstadoVehiculo, type IdVehiculo, type MandosVehiculo } from '../core/vehiculos';
import { anotarPersecucion, type Guardado } from '../storage';
import { actualizarConductor, actualizarHelicoptero, actualizarPersonaIa, asignarCarril, iaPersona, type IaCoche, type IaPersona } from './ia';

export const RADIO_PERSONA = 0.35;
export const ALTO_PERSONA = 1.8;
const VEL_TROTE = 4.3;
const VEL_SPRINT = 7;
const SALTO = 7;

export type TipoPersona = 'jugador' | 'civil' | 'policia' | 'banda' | 'rival';
export type EstadoPersona = 'pie' | 'caido' | 'muerto' | 'coche';

export interface Persona {
  id: number;
  tipo: TipoPersona;
  cuerpo: Cuerpo;
  yaw: number;
  /** Velocidad deseada (la decide la IA o el jugador). */
  vx: number;
  vz: number;
  /** Empujón (golpes, atropellos y explosiones) que se va frenando. */
  kx: number;
  kz: number;
  vida: number;
  vidaMax: number;
  chaleco: number;
  estado: EstadoPersona;
  caidoT: number;
  muerteT: number;
  arma: IdArma;
  cd: number;
  /** Segundos desde el último ataque (animación y fogonazo). */
  ataqueT: number;
  moviendose: boolean;
  corriendo: boolean;
  coche: Vehiculo | null;
  /** Índice de apariencia (lo usa el dibujo). */
  apariencia: number;
  manosArriba: boolean;
  ia: IaPersona;
}

export interface Vehiculo extends EstadoVehiculo {
  id: number;
  tipo: IdVehiculo;
  color: number;
  vida: number;
  /** Segundos que lleva ardiendo (-1 = no arde). */
  ardiendo: number;
  destruido: boolean;
  destruidoT: number;
  conductor: Persona | null;
  sirena: boolean;
  aparcado: boolean;
  /** Ya lo ha conducido el jugador (para contar coches robados una sola vez). */
  delJugador: boolean;
  mandos: MandosVehiculo;
  claxonT: number;
  ia: IaCoche;
}

export interface Helicoptero {
  x: number;
  y: number;
  z: number;
  yaw: number;
  vida: number;
  cd: number;
  destruido: boolean;
  vy: number;
  t: number;
}

export interface Recogible {
  id: number;
  x: number;
  y: number;
  z: number;
  tipo: 'dinero' | 'arma' | 'vida' | 'chaleco';
  valor: number;
  arma?: IdArma;
  t: number;
}

export interface Cohete {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  autor: Persona | null;
}

export interface Trazo {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  t: number;
}

export interface Explosion {
  x: number;
  y: number;
  z: number;
  t: number;
}

export interface Controles {
  /** Movimiento: x = derecha, z = adelante (-1) / atrás (+1). */
  x: number;
  z: number;
  giroX: number;
  giroY: number;
  disparar: boolean;
  /** Recién pulsado (armas semiautomáticas y golpes). */
  dispararPulsado: boolean;
  apuntar: boolean;
  saltar: boolean;
  correr: boolean;
  entrar: boolean;
  armaSiguiente: boolean;
  armaAnterior: boolean;
  claxon: boolean;
  acelerar: number;
  frenar: number;
  mano: boolean;
  /** Ayuda de apuntado más amplia (pantallas táctiles). */
  asistido: boolean;
  camaraAuto: boolean;
}

export const controlesVacios = (): Controles => ({
  x: 0, z: 0, giroX: 0, giroY: 0, disparar: false, dispararPulsado: false, apuntar: false, saltar: false, correr: false, entrar: false,
  armaSiguiente: false, armaAnterior: false, claxon: false, acelerar: 0, frenar: 0, mano: false, asistido: false, camaraAuto: true,
});

export interface Resumen {
  tipo: 'muerto' | 'arrestado';
  tiempo: number;
  dinero: number;
  coches: number;
  bajas: number;
  estrellas: number;
  /** Lo que se pierde (texto). */
  perdida: string;
}

export interface EventosPartida {
  disparo?: (arma: IdArma, distancia: number) => void;
  golpe?: (distancia: number) => void;
  dano?: () => void;
  explosion?: (distancia: number) => void;
  dinero?: (n: number) => void;
  nivel?: (n: number) => void;
  estrellas?: (antes: number, ahora: number) => void;
  choque?: (fuerza: number) => void;
  puerta?: () => void;
  recoger?: () => void;
  tienda?: (s: Servicio) => void;
  pintura?: () => void;
  fin: (r: Resumen) => void;
}

export type Pista = 'entrar' | 'robar' | 'salir' | 'taller' | null;

const tmpBloques: Bloque[] = [];
const difAngulo = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class Partida {
  readonly ciudad = new Ciudad();
  readonly rng: Rng;
  personas: Persona[] = [];
  vehiculos: Vehiculo[] = [];
  recogibles: Recogible[] = [];
  cohetes: Cohete[] = [];
  trazos: Trazo[] = [];
  explosiones: Explosion[] = [];
  helicoptero: Helicoptero | null = null;
  jugador: Persona;
  buscado: Buscado = buscadoNuevo();
  hora: number;
  tiempo = 0;
  fase: 'jugando' | 'muerto' | 'arrestado' | 'fin' = 'jugando';
  faseT = 0;
  pausada = false;
  camYaw = 0;
  camPitch = 0.18;
  /** Segundos desde que el jugador movió la cámara (para recolocarla sola). */
  private camLibreT = 99;
  armaActual: IdArma = 'punos';
  cargador = 0;
  recargando = 0;
  aguante = 1;
  objetivo: Persona | null = null;
  mensaje = '';
  mensajeT = 0;
  /** Texto pequeño (zona o coche) abajo a la derecha. */
  rotulo = '';
  rotuloT = 0;
  zona = '';
  pista: Pista = null;
  densidad = 1;
  /** Marcador de tienda en el que está el jugador (no se vuelve a abrir hasta salir). */
  tiendaBloqueada: { x: number; z: number } | null = null;
  persecucionT = 0;
  persecucionMax = 0;
  /** Sin policía (truco). */
  sinPolicia = false;
  /** Datos de la sesión para el resumen. */
  sesion = { dinero: 0, coches: 0, bajas: 0, estrellas: 0, t0: 0 };
  private siguienteId = 1;
  private poblacionT = 0;
  private policiaT = 0;
  private vistoT = 0;
  private visto = false;
  private arresto = 0;
  private saltoInicio: { x: number; z: number; alto: number; rampa: string | null } | null = null;
  private distanciaT = { x: 0, z: 0 };

  constructor(readonly g: Guardado, public modo: Modo, semilla = Date.now()) {
    this.rng = crearRng(semilla);
    this.hora = g.hora;
    const casa = this.ciudad.servicioCercano('casa', 30, 30);
    // Junto a la puerta de casa, mirando a la calle (sin abrir el panel ni quedar detrás de una farola).
    const fx = Math.sin(casa.yaw);
    const fz = Math.cos(casa.yaw);
    this.jugador = this.nuevaPersona('jugador', casa.x + fx * 2.5 - fz * 3, casa.z + fz * 2.5 + fx * 3, 0);
    this.tiendaBloqueada = { x: casa.x, z: casa.z };
    // El jugador también está en la lista: así le afectan la física, los golpes, los atropellos y las explosiones.
    this.personas.push(this.jugador);
    this.jugador.vidaMax = 100;
    this.jugador.vida = 100;
    this.jugador.chaleco = g.chaleco;
    this.jugador.yaw = casa.yaw;
    this.camYaw = casa.yaw;
    this.equipar(this.mejorArma());
    this.distanciaT = { x: casa.x, z: casa.z };
    this.zona = nombreZona(casa.x, casa.z);
    this.rotular(this.zona);
  }

  /* ---------- Consultas ---------- */

  get estrellas(): number {
    return estrellasDe(this.buscado.calor);
  }

  get nivel(): number {
    return nivelDe(this.g.respeto);
  }

  get escala() {
    return escalaNivel(this.nivel);
  }

  /** Posición del jugador (la del coche si va conduciendo). */
  posJugador(): { x: number; y: number; z: number } {
    const j = this.jugador;
    return j.coche ? { x: j.coche.x, y: j.coche.y, z: j.coche.z } : j.cuerpo;
  }

  /** Habilidad de 0 a 1. */
  habilidad(h: 'aguante' | 'conduccion' | 'punteria') {
    return this.g.habilidades[h] / 100;
  }

  private nuevaPersona(tipo: TipoPersona, x: number, z: number, apariencia: number): Persona {
    const p: Persona = {
      id: this.siguienteId++, tipo, cuerpo: { x, y: this.ciudad.alturaSuelo(x, z), z, vy: 0, radio: RADIO_PERSONA, alto: ALTO_PERSONA, enSuelo: true },
      yaw: 0, vx: 0, vz: 0, kx: 0, kz: 0, vida: 100, vidaMax: 100, chaleco: 0, estado: 'pie', caidoT: 0, muerteT: 0, arma: 'punos', cd: 0, ataqueT: 9,
      moviendose: false, corriendo: false, coche: null, apariencia, manosArriba: false, ia: iaPersona(),
    };
    return p;
  }

  /** Añade una persona controlada por la IA. */
  crearPersona(tipo: Exclude<TipoPersona, 'jugador'>, x: number, z: number): Persona {
    const esc = this.escala;
    const apariencia = tipo === 'civil' ? this.rng.entero(0, 15) : 0;
    const p = this.nuevaPersona(tipo, x, z, apariencia);
    p.yaw = this.rng.rango(-Math.PI, Math.PI);
    if (tipo === 'policia') {
      p.vida = p.vidaMax = Math.round(100 * esc.vida);
      p.arma = this.estrellas >= 4 ? (this.rng.azar(0.5) ? 'fusil' : 'escopeta') : 'pistola';
    } else if (tipo === 'rival' || tipo === 'banda') {
      p.vida = p.vidaMax = Math.round(90 * esc.vida);
      p.arma = this.rng.azar(0.6) ? 'pistola' : 'bate';
      if (tipo === 'rival' && this.nivel >= 6 && this.rng.azar(0.3)) p.arma = 'subfusil';
    } else {
      p.vida = p.vidaMax = 60;
      p.ia.valiente = this.rng.azar(0.15);
    }
    this.personas.push(p);
    return p;
  }

  crearVehiculo(tipo: IdVehiculo, x: number, z: number, yaw: number): Vehiculo {
    const d = VEHICULOS[tipo];
    const v: Vehiculo = {
      id: this.siguienteId++, tipo, color: this.rng.elegir(d.colores), x, y: 0, z, vx: 0, vy: 0, vz: 0, yaw, w: 0, ruedas: 0, enAire: false,
      vida: d.vida, ardiendo: -1, destruido: false, destruidoT: 0, conductor: null, sirena: false, aparcado: false, delJugador: false,
      mandos: mandosVacios(), claxonT: 0, ia: { modo: 'parado', dir: 0, ni: 0, nk: 0, giro: 0, atascadoT: 0, reversaT: 0, velObjetivo: 11 },
    };
    this.vehiculos.push(v);
    return v;
  }

  /** Mete a una persona en un coche como conductora. */
  subir(p: Persona, v: Vehiculo) {
    p.estado = 'coche';
    p.coche = v;
    v.conductor = p;
    v.aparcado = false;
    p.cuerpo.x = v.x;
    p.cuerpo.z = v.z;
  }

  /** Saca a una persona del coche por la puerta del conductor (o la otra si está tapada). */
  bajar(p: Persona): void {
    const v = p.coche;
    if (!v) return;
    const d = VEHICULOS[v.tipo];
    const lx = Math.cos(v.yaw);
    const lz = -Math.sin(v.yaw);
    const sep = d.ancho / 2 + 0.55;
    let x = v.x + lx * sep;
    let z = v.z + lz * sep;
    if (this.ciudad.bloquesEnArea(x - 0.3, z - 0.3, x + 0.3, z + 0.3, tmpBloques).some((b) => b.y1 > 0.6 && Math.abs(x - b.x) < b.w / 2 + 0.3 && Math.abs(z - b.z) < b.d / 2 + 0.3)) {
      x = v.x - lx * sep;
      z = v.z - lz * sep;
    }
    p.cuerpo.x = x;
    p.cuerpo.z = z;
    p.cuerpo.y = v.y + 0.05;
    p.cuerpo.vy = 0;
    p.yaw = v.yaw;
    p.estado = 'pie';
    p.coche = null;
    v.conductor = null;
    v.mandos = mandosVacios();
  }

  /* ---------- Dinero, respeto y mensajes ---------- */

  avisar(texto: string, t = 2.5) {
    this.mensaje = texto;
    this.mensajeT = t;
  }

  rotular(texto: string, t = 3.5) {
    this.rotulo = texto;
    this.rotuloT = t;
  }

  ganarDinero(n: number, aplicarModo = true) {
    const v = Math.round(aplicarModo ? n * this.modo.dinero : n);
    if (v <= 0) return;
    this.g.dinero += v;
    this.g.estadisticas.dineroGanado += v;
    this.g.estadisticas.dineroMax = Math.max(this.g.estadisticas.dineroMax, this.g.dinero);
    this.sesion.dinero += v;
    this.eventos.dinero?.(v);
  }

  gastar(n: number): boolean {
    if (this.g.dinero < n) return false;
    this.g.dinero -= n;
    return true;
  }

  ganarRespeto(n: number) {
    const antes = this.nivel;
    this.g.respeto += Math.round(n);
    const ahora = this.nivel;
    if (ahora > antes) {
      this.avisar(`¡Respeto: nivel ${ahora}!`, 3.5);
      this.ganarDinero(PREMIOS.dineroNivel(ahora), false);
      this.eventos.nivel?.(ahora);
    }
  }

  /** Suma un delito y avisa si cambian las estrellas. */
  delito(d: Delito) {
    if (this.sinPolicia || this.fase !== 'jugando') return;
    const antes = this.estrellas;
    const ahora = sumarDelito(this.buscado, d, this.modo.calor);
    if (ahora !== antes) this.cambioEstrellas(antes, ahora);
  }

  private cambioEstrellas(antes: number, ahora: number) {
    this.eventos.estrellas?.(antes, ahora);
    if (ahora > antes && antes === 0) {
      this.persecucionT = 0;
      this.persecucionMax = 0;
    }
    this.persecucionMax = Math.max(this.persecucionMax, ahora);
    this.sesion.estrellas = Math.max(this.sesion.estrellas, ahora);
    this.g.estadisticas.estrellasMax = Math.max(this.g.estadisticas.estrellasMax, ahora);
  }

  /** ¿Algún policía ve este punto (a menos de 45 m y sin edificios en medio)? */
  policiaVe(x: number, y: number, z: number, radio = 45): boolean {
    for (const p of this.personas) {
      if (p.tipo !== 'policia' || p.estado === 'muerto' || p.estado === 'caido') continue;
      const px = p.coche ? p.coche.x : p.cuerpo.x;
      const pz = p.coche ? p.coche.z : p.cuerpo.z;
      const dx = px - x;
      const dz = pz - z;
      if (dx * dx + dz * dz > radio * radio) continue;
      if (this.ciudad.seVen(px, 1.6, pz, x, y + 1.2, z)) return true;
    }
    const h = this.helicoptero;
    return !!h && !h.destruido && Math.hypot(h.x - x, h.z - z) < 70;
  }

  /* ---------- Armas ---------- */

  armasDisponibles(): IdArma[] {
    return ORDEN_ARMAS.filter((a) => a === 'punos' || (this.g.armas[a] ?? 0) > 0 || (ARMAS[a].cuerpo && this.g.armas[a] !== undefined));
  }

  mejorArma(): IdArma {
    const lista = this.armasDisponibles();
    const fuego = lista.filter((a) => !ARMAS[a].cuerpo && a !== 'lanzacohetes');
    return fuego[0] ?? lista[lista.length - 1] ?? 'punos';
  }

  equipar(a: IdArma) {
    this.armaActual = a;
    this.jugador.arma = a;
    this.recargando = 0;
    const d = ARMAS[a];
    this.cargador = d.cuerpo ? 0 : Math.min(d.cargador, this.g.armas[a] ?? 0);
  }

  cambiarArma(paso: 1 | -1) {
    const lista = this.armasDisponibles();
    const i = lista.indexOf(this.armaActual);
    this.equipar(lista[(i + paso + lista.length) % lista.length]);
  }

  /** Da un arma (o munición) al jugador. */
  darArma(a: IdArma, municion: number) {
    const d = ARMAS[a];
    this.g.armas[a] = d.cuerpo ? 1 : (this.g.armas[a] ?? 0) + municion;
    if (this.armaActual === a) this.equipar(a);
    else if (ARMAS[this.armaActual].cuerpo && !d.cuerpo) this.equipar(a);
  }

  /* ---------- Cámara ---------- */

  /** Posición y dirección de la cámara (tercera persona; se acerca si hay un edificio detrás). */
  camara(): { x: number; y: number; z: number; dx: number; dy: number; dz: number } {
    const j = this.jugador;
    const v = j.coche;
    const cp = Math.cos(this.camPitch);
    const dx = Math.sin(this.camYaw) * cp;
    const dy = -Math.sin(this.camPitch);
    const dz = Math.cos(this.camYaw) * cp;
    let tx: number;
    let ty: number;
    let tz: number;
    let dist: number;
    if (v) {
      const d = VEHICULOS[v.tipo];
      tx = v.x;
      ty = v.y + d.alto + 0.4;
      tz = v.z;
      dist = 3.2 + d.largo * 0.75 + Math.min(4, Math.hypot(v.vx, v.vz) * 0.06);
    } else {
      const apuntando = !!this.objetivo || this.apuntandoLibre;
      tx = j.cuerpo.x + (apuntando ? -Math.cos(this.camYaw) * 0.55 : 0);
      ty = j.cuerpo.y + 1.65;
      tz = j.cuerpo.z + (apuntando ? Math.sin(this.camYaw) * 0.55 : 0);
      dist = apuntando ? 2.8 : 4.3;
    }
    const libre = this.ciudad.rayo(tx, ty, tz, -dx, -dy, -dz, dist + 0.3);
    const d = Math.max(0.6, Math.min(dist, libre - 0.3));
    // Si hay una pared detrás, la cámara se acerca y además sube para no meterse en el coche.
    const sube = (dist - d) * 0.5;
    return { x: tx - dx * d, y: Math.max(0.3, ty - dy * d + sube), z: tz - dz * d, dx, dy: dy - sube / Math.max(2, d * 2), dz };
  }

  private apuntandoLibre = false;

  /* ---------- Bucle ---------- */

  eventos: EventosPartida = { fin: () => undefined };

  actualizar(dt: number, c: Controles) {
    if (this.pausada) return;
    this.tiempo += dt;
    this.hora = avanzarHora(this.hora, dt);
    this.mensajeT = Math.max(0, this.mensajeT - dt);
    this.rotuloT = Math.max(0, this.rotuloT - dt);
    const j = this.jugador;

    // Cámara.
    if (Math.abs(c.giroX) + Math.abs(c.giroY) > 1e-4) this.camLibreT = 0;
    else this.camLibreT += dt;
    this.camYaw -= c.giroX;
    this.camPitch = Math.max(-0.35, Math.min(1.0, this.camPitch + c.giroY));

    if (this.fase === 'jugando') {
      if (j.estado === 'coche') this.controlarCoche(c, dt);
      else if (j.estado === 'pie') this.controlarAPie(c, dt);
      else if (j.estado === 'caido') {
        j.caidoT -= dt;
        if (j.caidoT <= 0) j.estado = 'pie';
        j.vx = j.vz = 0;
      }
    } else {
      this.faseT += dt;
      j.vx = j.vz = 0;
      if (this.faseT > 3 && this.fase !== 'fin') {
        const tipo = this.fase === 'muerto' ? 'muerto' : 'arrestado';
        this.fase = 'fin';
        this.terminar(tipo);
      }
    }

    // IA y física.
    for (const p of this.personas) if (p !== j) actualizarPersonaIa(this, p, dt);
    for (const v of this.vehiculos) {
      if (v.conductor && v.conductor !== j && !v.destruido) actualizarConductor(this, v, dt);
    }
    if (this.helicoptero) actualizarHelicoptero(this, this.helicoptero, dt);
    this.fisicaVehiculos(dt);
    this.fisicaPersonas(dt);
    this.actualizarProyectiles(dt);
    this.actualizarEfectos(dt);

    if (this.fase === 'jugando') {
      this.comprobarBuscado(dt);
      this.comprobarArresto(dt);
      this.comprobarLugares();
      this.comprobarRecogibles();
      this.contarDistancia();
    }
    this.poblacionT -= dt;
    if (this.poblacionT <= 0) {
      this.poblacionT = 0.35;
      this.gestionarPoblacion();
    }
    this.policiaT -= dt;
    if (this.policiaT <= 0) {
      this.policiaT = 0.5;
      this.gestionarPolicia();
    }
  }

  /* ---------- Jugador a pie ---------- */

  private controlarAPie(c: Controles, dt: number) {
    const j = this.jugador;
    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);
    const rx = -fz;
    const rz = fx;
    let mx = fx * -c.z + rx * c.x;
    let mz = fz * -c.z + rz * c.x;
    const mag = Math.min(1, Math.hypot(mx, mz));
    if (mag > 0.01) {
      mx /= Math.hypot(mx, mz);
      mz /= Math.hypot(mx, mz) || 1;
    }
    // Aguante: correr lo gasta; la habilidad hace que dure más.
    const sprint = c.correr && mag > 0.2 && this.aguante > 0.02;
    if (sprint) {
      this.aguante = Math.max(0, this.aguante - dt * 0.12 * (1 - this.habilidad('aguante') * 0.7));
      this.g.habilidades.aguante = Math.min(100, this.g.habilidades.aguante + dt * 0.1);
    } else this.aguante = Math.min(1, this.aguante + dt * 0.18);

    // Fijar objetivo.
    if (c.apuntar) {
      if (!this.objetivo || !this.objetivoValido(this.objetivo)) this.objetivo = this.buscarObjetivo(0.9, ARMAS[this.armaActual].cuerpo ? 7 : ARMAS[this.armaActual].alcance);
    } else this.objetivo = null;
    this.apuntandoLibre = c.apuntar && !this.objetivo && !ARMAS[this.armaActual].cuerpo;

    const apuntando = !!this.objetivo || this.apuntandoLibre;
    const vel = apuntando ? 3 : sprint ? VEL_SPRINT * (1 + this.habilidad('aguante') * 0.08) : VEL_TROTE * (mag < 0.6 ? 0.45 : 1);
    j.vx = mx * vel * (mag > 0.01 ? 1 : 0);
    j.vz = mz * vel * (mag > 0.01 ? 1 : 0);
    j.moviendose = mag > 0.05;
    j.corriendo = sprint;
    if (this.objetivo) {
      const o = this.objetivo;
      const oy = Math.atan2(o.cuerpo.x - j.cuerpo.x, o.cuerpo.z - j.cuerpo.z);
      j.yaw = oy;
      this.camYaw += difAngulo(oy, this.camYaw) * Math.min(1, dt * 4);
    } else if (this.apuntandoLibre) {
      j.yaw = this.camYaw;
    } else if (mag > 0.05) {
      const objetivo = Math.atan2(mx, mz);
      j.yaw += difAngulo(objetivo, j.yaw) * Math.min(1, dt * 12);
      // La cámara se va colocando detrás al andar.
      if (c.camaraAuto && this.camLibreT > 1.5) this.camYaw += difAngulo(j.yaw, this.camYaw) * Math.min(1, dt * 0.8);
    }
    if (c.saltar && j.cuerpo.enSuelo) j.cuerpo.vy = SALTO;

    if (c.armaSiguiente) this.cambiarArma(1);
    if (c.armaAnterior) this.cambiarArma(-1);
    this.atacarJugador(c, dt);

    // Entrar en un coche.
    const cerca = this.cocheCercano();
    this.pista = cerca ? (cerca.conductor ? 'robar' : 'entrar') : null;
    if (c.entrar && cerca) this.entrarEn(cerca);

    // Manos arriba: los civiles a los que apuntas se quedan quietos.
    if (this.objetivo && this.objetivo.tipo === 'civil' && !ARMAS[this.armaActual].cuerpo && this.objetivo.ia.modo !== 'huir') {
      this.objetivo.manosArriba = true;
      this.objetivo.ia.modo = 'manos';
      this.objetivo.ia.t = 2.5;
    }
  }

  private objetivoValido(o: Persona): boolean {
    if (o.estado === 'muerto' || o.estado === 'coche') return false;
    const j = this.jugador;
    const d = Math.hypot(o.cuerpo.x - j.cuerpo.x, o.cuerpo.z - j.cuerpo.z);
    return d < Math.max(8, ARMAS[this.armaActual].alcance * 1.2);
  }

  /** Persona más adecuada dentro de un cono delante de la cámara (prefiere enemigos y cercanos). */
  buscarObjetivo(cono: number, alcance: number): Persona | null {
    const j = this.jugador;
    let mejor: Persona | null = null;
    let mejorP = Infinity;
    for (const o of this.personas) {
      if (o === j || o.estado === 'muerto' || o.estado === 'coche') continue;
      const dx = o.cuerpo.x - j.cuerpo.x;
      const dz = o.cuerpo.z - j.cuerpo.z;
      const d = Math.hypot(dx, dz);
      if (d > alcance || d < 0.1) continue;
      const ang = Math.abs(difAngulo(Math.atan2(dx, dz), this.camYaw));
      if (ang > cono) continue;
      if (!this.ciudad.seVen(j.cuerpo.x, j.cuerpo.y + 1.4, j.cuerpo.z, o.cuerpo.x, o.cuerpo.y + 1.2, o.cuerpo.z)) continue;
      const hostil = o.tipo === 'policia' || o.ia.enemigo === j ? 0.6 : 1;
      const puntos = (d / alcance + ang / cono) * hostil * (o.estado === 'caido' ? 1.5 : 1);
      if (puntos < mejorP) {
        mejorP = puntos;
        mejor = o;
      }
    }
    return mejor;
  }

  private atacarJugador(c: Controles, dt: number) {
    const j = this.jugador;
    j.cd -= dt;
    j.ataqueT += dt;
    const a = this.armaActual;
    const d = ARMAS[a];
    if (this.recargando > 0) {
      this.recargando -= dt;
      if (this.recargando <= 0) this.cargador = Math.min(d.cargador, this.g.armas[a] ?? 0);
      return;
    }
    const quiere = d.automatica ? c.disparar : c.dispararPulsado;
    if (!quiere || j.cd > 0) return;
    if (d.cuerpo) {
      j.cd = d.cadencia;
      j.ataqueT = 0;
      this.golpear(j, d.dano, d.alcance);
      return;
    }
    if ((this.g.armas[a] ?? 0) <= 0) {
      // Sin munición: a los puños.
      this.equipar(this.mejorArma() === a ? 'punos' : this.mejorArma());
      return;
    }
    if (this.cargador <= 0) {
      this.recargando = d.recarga;
      return;
    }
    j.cd = d.cadencia;
    j.ataqueT = 0;
    this.cargador--;
    this.g.armas[a] = (this.g.armas[a] ?? 1) - 1;
    if (this.cargador <= 0 && (this.g.armas[a] ?? 0) > 0) this.recargando = d.recarga;

    // Dirección: al objetivo fijado, con ayuda de apuntado o hacia el centro de la pantalla.
    const ox = j.cuerpo.x + Math.sin(j.yaw) * 0.5;
    const oy = j.cuerpo.y + 1.35;
    const oz = j.cuerpo.z + Math.cos(j.yaw) * 0.5;
    let objetivo = this.objetivo;
    if (!objetivo && c.asistido) objetivo = this.buscarObjetivo(c.asistido ? 0.5 : 0.12, d.alcance);
    let tx: number;
    let ty: number;
    let tz: number;
    if (objetivo) {
      tx = objetivo.cuerpo.x;
      ty = objetivo.cuerpo.y + (objetivo.estado === 'caido' ? 0.3 : 1.15);
      tz = objetivo.cuerpo.z;
      j.yaw = Math.atan2(tx - j.cuerpo.x, tz - j.cuerpo.z);
    } else {
      const cam = this.camara();
      const t = Math.min(d.alcance, this.ciudad.rayo(cam.x, cam.y, cam.z, cam.dx, cam.dy, cam.dz, d.alcance + 6));
      tx = cam.x + cam.dx * t;
      ty = cam.y + cam.dy * t;
      tz = cam.z + cam.dz * t;
      j.yaw = this.camYaw;
    }
    const disp = dispersionCon(a, this.habilidad('punteria'));
    if (a === 'lanzacohetes') {
      const l = Math.hypot(tx - ox, ty - oy, tz - oz) || 1;
      const v = 42;
      this.cohetes.push({ x: ox, y: oy, z: oz, vx: ((tx - ox) / l) * v, vy: ((ty - oy) / l) * v, vz: ((tz - oz) / l) * v, t: 0, autor: j });
    } else {
      for (let n = 0; n < d.perdigones; n++) {
        const yaw = Math.atan2(tx - ox, tz - oz) + (this.rng.siguiente() - 0.5) * 2 * disp;
        const h = Math.hypot(tx - ox, tz - oz);
        const pitch = Math.atan2(ty - oy, h) + (this.rng.siguiente() - 0.5) * 2 * disp;
        this.dispararRayo(j, ox, oy, oz, Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch), d.dano, d.alcance);
      }
    }
    this.eventos.disparo?.(a, 0);
    this.ruido(j.cuerpo.x, j.cuerpo.z, 35, j);
    if (this.policiaVe(j.cuerpo.x, j.cuerpo.y, j.cuerpo.z, 40)) this.delito('disparar');
  }

  /** Bala instantánea: la primera persona, coche, helicóptero o edificio que toca. */
  dispararRayo(autor: Persona, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, dano: number, alcance: number) {
    let mejor = this.ciudad.rayo(ox, oy, oz, dx, dy, dz, alcance);
    let golpeada: Persona | null = null;
    let coche: Vehiculo | null = null;
    let heli = false;
    for (const p of this.personas) {
      if (p === autor || p.estado === 'muerto' || p.estado === 'coche') continue;
      const alto = p.estado === 'caido' ? 0.5 : ALTO_PERSONA;
      const t = rayoCilindro(ox, oy, oz, dx, dy, dz, p.cuerpo.x, p.cuerpo.y, p.cuerpo.z, RADIO_PERSONA + 0.1, alto);
      if (t < mejor) {
        mejor = t;
        golpeada = p;
        coche = null;
      }
    }
    for (const v of this.vehiculos) {
      if (autor.coche === v) continue;
      const dd = VEHICULOS[v.tipo];
      const ex = v.x - ox;
      const ez = v.z - oz;
      if (ex * ex + ez * ez > (alcance + 4) ** 2) continue;
      const t = rayoCajaGirada(ox, oy, oz, dx, dy, dz, v.x, v.y, v.z, v.yaw, dd.ancho / 2, dd.alto, dd.largo / 2);
      if (t < mejor) {
        mejor = t;
        coche = v;
        golpeada = null;
      }
    }
    const h = this.helicoptero;
    if (h && !h.destruido) {
      const t = rayoCilindro(ox, oy, oz, dx, dy, dz, h.x, h.y - 1.5, h.z, 2.2, 3);
      if (t < mejor) {
        mejor = t;
        heli = true;
        coche = null;
        golpeada = null;
      }
    }
    const fx = ox + dx * mejor;
    const fy = oy + dy * mejor;
    const fz = oz + dz * mejor;
    this.trazos.push({ x0: ox, y0: oy, z0: oz, x1: fx, y1: fy, z1: fz, t: 0.07 });
    if (golpeada) {
      this.danarPersona(golpeada, dano, autor, 'bala');
      if (autor === this.jugador) this.g.habilidades.punteria = Math.min(100, this.g.habilidades.punteria + 0.12);
    } else if (coche) this.danarVehiculo(coche, dano * 0.8, autor);
    else if (heli && h) this.danarHelicoptero(h, dano, autor);
  }

  /** Golpe cuerpo a cuerpo hacia delante. */
  golpear(autor: Persona, dano: number, alcance: number) {
    const fx = Math.sin(autor.yaw);
    const fz = Math.cos(autor.yaw);
    let mejor: Persona | null = null;
    let mejorD = Infinity;
    for (const o of this.personas) {
      if (o === autor || o.estado === 'muerto' || o.estado === 'coche') continue;
      const dx = o.cuerpo.x - autor.cuerpo.x;
      const dz = o.cuerpo.z - autor.cuerpo.z;
      const d = Math.hypot(dx, dz);
      if (d > alcance + RADIO_PERSONA || Math.abs(o.cuerpo.y - autor.cuerpo.y) > 1.2) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.4) continue;
      if (d < mejorD) {
        mejorD = d;
        mejor = o;
      }
    }
    const pos = autor.cuerpo;
    if (mejor) {
      this.danarPersona(mejor, dano, autor, 'golpe');
      mejor.kx += fx * 3;
      mejor.kz += fz * 3;
      this.eventos.golpe?.(Math.hypot(pos.x - this.posJugador().x, pos.z - this.posJugador().z));
      return;
    }
    // Golpe a un coche.
    for (const v of this.vehiculos) {
      const d = Math.hypot(v.x - (pos.x + fx * 1.2), v.z - (pos.z + fz * 1.2));
      if (d < VEHICULOS[v.tipo].largo / 2) {
        this.danarVehiculo(v, dano * 0.5, autor);
        this.eventos.golpe?.(0);
        return;
      }
    }
  }

  /** Daño a una persona: reacciones, delitos y muerte. */
  danarPersona(p: Persona, dano: number, autor: Persona | null, tipo: 'bala' | 'golpe' | 'coche' | 'explosion') {
    if (p.estado === 'muerto') return;
    const j = this.jugador;
    if (p === j) {
      if (this.fase !== 'jugando' || this.dios) return;
      let d = dano * this.modo.dano;
      if (j.chaleco > 0) {
        const a = Math.min(j.chaleco, d * 0.8);
        j.chaleco -= a;
        d -= a;
      }
      j.vida -= d;
      this.eventos.dano?.();
      if (tipo === 'golpe' && this.rng.azar(0.15)) this.tumbar(j, 0.8);
      if (j.vida <= 0) this.morirJugador();
      return;
    }
    p.vida -= dano;
    if (autor === j) {
      // Delitos según a quién y si lo ve la policía.
      const ve = this.policiaVe(p.cuerpo.x, p.cuerpo.y, p.cuerpo.z);
      if (p.tipo === 'policia') this.delito('golpearPolicia');
      else if (ve) this.delito(tipo === 'coche' ? 'atropellar' : 'golpear');
    }
    if (tipo === 'golpe' && this.rng.azar(autor?.arma === 'bate' ? 0.6 : 0.25)) this.tumbar(p, 1.2);
    if (tipo === 'explosion' || tipo === 'coche') this.tumbar(p, 2);
    if (p.vida <= 0) {
      this.morir(p, autor);
      return;
    }
    // Reacción.
    if (autor) {
      if (p.tipo === 'civil' && !(p.ia.valiente && tipo === 'golpe')) {
        p.ia.modo = 'huir';
        p.ia.t = 8;
        p.ia.amenaza = { x: autor.cuerpo.x, z: autor.cuerpo.z };
        p.manosArriba = false;
      } else if (autor !== p) {
        p.ia.modo = 'atacar';
        p.ia.enemigo = autor;
        p.ia.t = 20;
      }
    }
  }

  tumbar(p: Persona, t: number) {
    if (p.estado !== 'pie') return;
    p.estado = 'caido';
    p.caidoT = t;
    p.manosArriba = false;
  }

  private morir(p: Persona, autor: Persona | null) {
    p.estado = 'muerto';
    p.vida = 0;
    p.muerteT = 0;
    p.manosArriba = false;
    if (this.objetivo === p) this.objetivo = null;
    // Lo que suelta.
    const dinero = p.tipo === 'civil' ? this.rng.entero(5, 40) : p.tipo === 'policia' ? this.rng.entero(10, 30) : this.rng.entero(20, 80);
    this.soltar(p.cuerpo.x, p.cuerpo.z, 'dinero', dinero);
    if (p.tipo !== 'civil' && p.arma !== 'punos' && !ARMAS[p.arma].cuerpo && this.rng.azar(0.6)) this.soltar(p.cuerpo.x + 0.6, p.cuerpo.z, 'arma', Math.ceil(ARMAS[p.arma].paquete / 2), p.arma);
    if (autor === this.jugador) {
      this.sesion.bajas++;
      this.g.estadisticas.bajas++;
      if (p.tipo === 'policia') {
        this.g.estadisticas.policias++;
        this.delito('matarPolicia');
      } else if (p.tipo === 'rival') {
        this.ganarRespeto(PREMIOS.banda);
        if (this.policiaVe(p.cuerpo.x, p.cuerpo.y, p.cuerpo.z)) this.delito('matarCivil');
      } else {
        this.delito('matarCivil');
      }
    }
    this.ruido(p.cuerpo.x, p.cuerpo.z, 20, autor);
  }

  soltar(x: number, z: number, tipo: Recogible['tipo'], valor: number, arma?: IdArma) {
    this.recogibles.push({ id: this.siguienteId++, x, y: this.ciudad.alturaSuelo(x, z), z, tipo, valor, arma, t: 0 });
  }

  /** Disparos, explosiones y golpes asustan a los civiles cercanos y alertan a las bandas. */
  ruido(x: number, z: number, radio: number, fuente: Persona | null) {
    for (const p of this.personas) {
      if (p === fuente || p === this.jugador || p.estado === 'muerto' || p.estado === 'coche') continue;
      const d = Math.hypot(p.cuerpo.x - x, p.cuerpo.z - z);
      if (d > radio) continue;
      if (p.tipo === 'civil') {
        if (p.ia.modo !== 'atacar') {
          p.ia.modo = 'huir';
          p.ia.t = 6 + this.rng.siguiente() * 4;
          p.ia.amenaza = { x, z };
          p.manosArriba = false;
        }
      } else if (p.tipo === 'rival' && fuente === this.jugador && d < radio * 0.7) {
        p.ia.modo = 'atacar';
        p.ia.enemigo = fuente;
        p.ia.t = 20;
      }
    }
    // Los conductores cercanos se asustan y aceleran.
    for (const v of this.vehiculos) {
      if (!v.conductor || v.conductor === this.jugador || v.conductor.tipo === 'policia') continue;
      if (Math.hypot(v.x - x, v.z - z) < radio && v.ia.modo === 'carril') v.ia.velObjetivo = 18;
    }
  }

  private morirJugador() {
    const j = this.jugador;
    j.vida = 0;
    if (j.coche) this.bajar(j);
    j.estado = 'muerto';
    j.muerteT = 0;
    this.fase = 'muerto';
    this.faseT = 0;
    this.avisar('¡HAS MUERTO!', 4);
  }

  private arrestar() {
    const j = this.jugador;
    if (j.coche) {
      const v = j.coche;
      this.bajar(j);
      v.vx = v.vz = 0;
    }
    j.estado = 'pie';
    j.manosArriba = true;
    this.fase = 'arrestado';
    this.faseT = 0;
    this.avisar('¡TE HAN ARRESTADO!', 4);
  }

  /** Fin de la partida: aplica la pérdida y avisa a la interfaz. */
  private terminar(tipo: 'muerto' | 'arrestado') {
    const e = this.g.estadisticas;
    const est = this.persecucionMax;
    if (est > 0) anotarPersecucion(this.g, { nombre: this.nombreJugador, estrellas: est, segundos: Math.round(this.persecucionT), nivel: this.nivel });
    let perdida: string;
    const multa = Math.min(this.g.dinero, tipo === 'muerto' ? 100 : 100 + est * 50);
    this.g.dinero -= multa;
    if (tipo === 'muerto') {
      e.muertes++;
      perdida = `Hospital: -${multa} $`;
    } else {
      e.arrestos++;
      const armas = this.armasDisponibles().filter((a) => a !== 'punos');
      for (const a of armas) delete this.g.armas[a];
      perdida = `Multa: -${multa} $${armas.length ? ' · Te quitan las armas' : ''}`;
    }
    this.g.chaleco = 0;
    this.eventos.fin({
      tipo, tiempo: Math.round(this.tiempo - this.sesion.t0), dinero: this.sesion.dinero, coches: this.sesion.coches, bajas: this.sesion.bajas, estrellas: this.sesion.estrellas, perdida,
    });
  }

  nombreJugador = 'Jugador';
  /** Truco de vida infinita. */
  dios = false;

  /** Reaparecer en el hospital o la comisaría más cercanos (tras morir o ser arrestado). */
  reaparecer(lugar: 'hospital' | 'policia') {
    const j = this.jugador;
    const pos = this.posJugador();
    const e = this.ciudad.servicioCercano(lugar, pos.x, pos.z);
    // Fuera la policía y los coches de la persecución.
    this.personas = this.personas.filter((p) => p === j || (p.tipo !== 'policia' && Math.hypot(p.cuerpo.x - e.x, p.cuerpo.z - e.z) < 120));
    this.vehiculos = this.vehiculos.filter((v) => v.tipo !== 'patrulla' && Math.hypot(v.x - e.x, v.z - e.z) < 140);
    for (const v of this.vehiculos) if (v.conductor && !this.personas.includes(v.conductor)) v.conductor = null;
    this.helicoptero = null;
    borrarBuscado(this.buscado);
    j.estado = 'pie';
    j.coche = null;
    j.vida = j.vidaMax;
    j.chaleco = this.g.chaleco;
    j.manosArriba = false;
    j.cuerpo.x = e.x;
    j.cuerpo.z = e.z;
    j.cuerpo.y = 0;
    j.yaw = e.yaw;
    j.kx = j.kz = 0;
    this.camYaw = e.yaw;
    this.objetivo = null;
    this.fase = 'jugando';
    this.faseT = 0;
    this.persecucionT = 0;
    this.persecucionMax = 0;
    this.sesion = { dinero: 0, coches: 0, bajas: 0, estrellas: 0, t0: this.tiempo };
    this.equipar(this.mejorArma());
    this.tiendaBloqueada = { x: e.x, z: e.z };
    this.distanciaT = { x: e.x, z: e.z };
    this.rotular(SERVICIOS[lugar].nombre);
  }

  /* ---------- Coches ---------- */

  cocheCercano(): Vehiculo | null {
    const j = this.jugador;
    let mejor: Vehiculo | null = null;
    let mejorD = 3.2;
    for (const v of this.vehiculos) {
      if (v.destruido || v.ardiendo >= 0) continue;
      const d = VEHICULOS[v.tipo];
      // Distancia al costado del coche.
      const dx = j.cuerpo.x - v.x;
      const dz = j.cuerpo.z - v.z;
      const lz = Math.abs(dx * Math.sin(v.yaw) + dz * Math.cos(v.yaw)) - d.largo / 2;
      const lx = Math.abs(dx * Math.cos(v.yaw) - dz * Math.sin(v.yaw)) - d.ancho / 2;
      const dist = Math.hypot(Math.max(0, lx), Math.max(0, lz));
      if (dist < mejorD && Math.abs(j.cuerpo.y - v.y) < 1.5) {
        mejorD = dist;
        mejor = v;
      }
    }
    return mejor;
  }

  entrarEn(v: Vehiculo) {
    const j = this.jugador;
    const conductor = v.conductor;
    if (conductor) {
      // Robo: el conductor sale y huye (o pelea si es policía o pandillero).
      this.bajar(conductor);
      this.tumbar(conductor, 1.2);
      if (conductor.tipo === 'civil' && !conductor.ia.valiente) {
        conductor.ia.modo = 'huir';
        conductor.ia.t = 8;
        conductor.ia.amenaza = { x: v.x, z: v.z };
      } else {
        conductor.ia.modo = 'atacar';
        conductor.ia.enemigo = j;
        conductor.ia.t = 20;
      }
      if (v.tipo === 'patrulla' || this.policiaVe(v.x, v.y, v.z, 35)) this.delito('robarCoche');
    } else if (v.tipo === 'patrulla' && this.policiaVe(v.x, v.y, v.z, 35)) this.delito('robarCoche');
    this.subir(j, v);
    this.objetivo = null;
    v.sirena = false;
    if (!v.delJugador) {
      v.delJugador = true;
      this.sesion.coches++;
      this.g.estadisticas.cochesRobados++;
    }
    this.camYaw = v.yaw;
    this.eventos.puerta?.();
    this.rotular(VEHICULOS[v.tipo].nombre, 2.5);
  }

  private controlarCoche(c: Controles, dt: number) {
    const j = this.jugador;
    const v = j.coche!;
    this.pista = 'salir';
    v.mandos.acelerar = c.acelerar;
    v.mandos.frenar = c.frenar;
    v.mandos.giro = c.x;
    v.mandos.mano = c.mano;
    if (c.claxon && v.claxonT <= 0) {
      v.claxonT = 0.5;
      this.ruido(v.x, v.z, 15, j);
    }
    if (v.tipo === 'patrulla' && c.claxon) v.sirena = true;
    // Cámara detrás del coche (mirando hacia donde va al dar marcha atrás rápido).
    if (c.camaraAuto && this.camLibreT > 1) {
      const vf = velocidadAdelante(v);
      const yaw = vf < -4 ? v.yaw + Math.PI : v.yaw;
      this.camYaw += difAngulo(yaw, this.camYaw) * Math.min(1, dt * 3);
      this.camPitch += (0.2 - this.camPitch) * Math.min(1, dt * 2);
    }
    if (c.entrar) {
      const vel = Math.hypot(v.vx, v.vz);
      this.bajar(j);
      if (vel > 9) {
        // Saltar del coche en marcha.
        this.tumbar(j, 1);
        j.kx = v.vx * 0.5;
        j.kz = v.vz * 0.5;
        this.danarPersona(j, (vel - 9) * 2.5, null, 'golpe');
      }
      this.camYaw = j.yaw;
      this.eventos.puerta?.();
    }
    if (c.armaSiguiente) this.cambiarArma(1);
    if (c.armaAnterior) this.cambiarArma(-1);
    if (v.ardiendo >= 0 && this.tiempo % 1 < dt) this.avisar('¡El coche arde! Sal ya', 1);
  }

  danarVehiculo(v: Vehiculo, dano: number, autor: Persona | null) {
    if (v.destruido) return;
    v.vida -= dano;
    if (v.vida <= 0 && v.ardiendo < 0) {
      v.vida = 0;
      v.ardiendo = 0;
      // Los ocupantes de la IA salen corriendo.
      const c = v.conductor;
      if (c && c !== this.jugador) {
        this.bajar(c);
        c.ia.modo = 'huir';
        c.ia.t = 6;
        c.ia.amenaza = { x: v.x, z: v.z };
      }
      if (autor === this.jugador) {
        if (v.tipo === 'patrulla') this.delito('destruirPatrulla');
        else if (this.policiaVe(v.x, v.y, v.z)) this.delito('destruirCoche');
      }
    }
  }

  private explotarVehiculo(v: Vehiculo) {
    v.destruido = true;
    v.destruidoT = 0;
    v.vy = 6;
    v.enAire = true;
    v.w += (this.rng.siguiente() - 0.5) * 3;
    const c = v.conductor;
    if (c) {
      this.bajar(c);
      this.danarPersona(c, 200, null, 'explosion');
    }
    this.explotar(v.x, v.y + 0.8, v.z, 7, 120, null, v);
    this.g.estadisticas.cochesDestruidos++;
  }

  explotar(x: number, y: number, z: number, radio: number, dano: number, autor: Persona | null, excepto: Vehiculo | null = null) {
    this.explosiones.push({ x, y, z, t: 0 });
    const pj = this.posJugador();
    this.eventos.explosion?.(Math.hypot(pj.x - x, pj.z - z));
    for (const p of this.personas) {
      if (p.estado === 'muerto' || p.estado === 'coche') continue;
      const d = Math.hypot(p.cuerpo.x - x, p.cuerpo.y - y, p.cuerpo.z - z);
      if (d > radio) continue;
      const k = 1 - d / radio;
      this.danarPersona(p, dano * k, autor, 'explosion');
      p.kx += ((p.cuerpo.x - x) / (d || 1)) * 9 * k;
      p.kz += ((p.cuerpo.z - z) / (d || 1)) * 9 * k;
      p.cuerpo.vy = 5 * k;
    }
    for (const v of this.vehiculos) {
      if (v === excepto) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d > radio + 1) continue;
      const k = 1 - d / (radio + 1);
      this.danarVehiculo(v, dano * 3 * k, autor);
      v.vx += ((v.x - x) / (d || 1)) * 8 * k;
      v.vz += ((v.z - z) / (d || 1)) * 8 * k;
      v.vy = 5 * k;
      v.enAire = true;
    }
    const h = this.helicoptero;
    if (h && !h.destruido && Math.hypot(h.x - x, h.y - y, h.z - z) < radio + 2) this.danarHelicoptero(h, dano * 2, autor);
    this.ruido(x, z, 40, autor);
  }

  danarHelicoptero(h: Helicoptero, dano: number, autor: Persona | null) {
    if (h.destruido) return;
    h.vida -= dano;
    if (h.vida <= 0) {
      h.destruido = true;
      h.vy = 0;
      if (autor === this.jugador) this.delito('helicoptero');
    }
  }

  /** Física de todos los coches: paso, edificios, coches entre sí. */
  private fisicaVehiculos(dt: number) {
    const j = this.jugador;
    for (const v of this.vehiculos) {
      const d = VEHICULOS[v.tipo];
      if (v.claxonT > 0) v.claxonT -= dt;
      if (v.destruido) {
        v.destruidoT += dt;
        v.mandos = mandosVacios();
        v.mandos.mano = true;
      } else if (!v.conductor) {
        v.mandos.acelerar = v.mandos.frenar = 0;
        v.mandos.giro = 0;
        v.mandos.mano = Math.hypot(v.vx, v.vz) < 6;
      }
      const habil = v.conductor === j ? this.habilidad('conduccion') : 0.3;
      const antesAire = v.enAire;
      const vyAntes = v.vy;
      pasoVehiculo(v, d, v.mandos, dt, this.ciudad.alturaSuelo(v.x, v.z), habil);
      if (v.conductor === j) this.vigilarSalto(v, antesAire, vyAntes);
      this.chocarEdificios(v);
      if (v.ardiendo >= 0 && !v.destruido) {
        v.ardiendo += dt;
        if (v.ardiendo > 4) this.explotarVehiculo(v);
      }
    }
    // Coches entre sí.
    const vs = this.vehiculos;
    for (let a = 0; a < vs.length; a++) {
      for (let b = a + 1; b < vs.length; b++) this.chocarVehiculos(vs[a], vs[b]);
    }
  }

  private chocarEdificios(v: Vehiculo) {
    const d = VEHICULOS[v.tipo];
    let impacto = 0;
    for (const c of circulosVehiculo(v, d)) {
      for (const b of this.ciudad.bloquesEnArea(c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r, tmpBloques)) {
        if (b.tipo === 'poste' || b.tipo === 'banco') continue;
        if (v.y >= b.y1 - 0.2 || v.y + d.alto <= b.y0) continue;
        const px = Math.max(b.x - b.w / 2, Math.min(c.x, b.x + b.w / 2));
        const pz = Math.max(b.z - b.d / 2, Math.min(c.z, b.z + b.d / 2));
        let nx = c.x - px;
        let nz = c.z - pz;
        const dist2 = nx * nx + nz * nz;
        if (dist2 >= c.r * c.r) continue;
        let prof: number;
        if (dist2 > 1e-8) {
          const dist = Math.sqrt(dist2);
          nx /= dist;
          nz /= dist;
          prof = c.r - dist;
        } else {
          const sx = b.w / 2 - Math.abs(c.x - b.x);
          const sz = b.d / 2 - Math.abs(c.z - b.z);
          if (sx < sz) {
            nx = Math.sign(c.x - b.x || 1);
            nz = 0;
            prof = sx + c.r;
          } else {
            nx = 0;
            nz = Math.sign(c.z - b.z || 1);
            prof = sz + c.r;
          }
        }
        v.x += nx * prof;
        v.z += nz * prof;
        c.x += nx * prof;
        c.z += nz * prof;
        const vn = v.vx * nx + v.vz * nz;
        if (vn < 0) {
          v.vx -= 1.25 * vn * nx;
          v.vz -= 1.25 * vn * nz;
          // Giro por el golpe descentrado.
          const ox = c.x - v.x;
          const oz = c.z - v.z;
          v.w += (ox * nz - oz * nx) * vn * 0.04;
          impacto = Math.max(impacto, -vn);
        }
      }
    }
    if (impacto > 3) this.impactoVehiculo(v, impacto);
  }

  private impactoVehiculo(v: Vehiculo, impacto: number) {
    this.danarVehiculo(v, (impacto - 3) * 14, null);
    if (v.conductor === this.jugador) this.eventos.choque?.(impacto);
    else if (Math.hypot(v.x - this.posJugador().x, v.z - this.posJugador().z) < 30 && impacto > 6) this.eventos.choque?.(impacto * 0.4);
  }

  private chocarVehiculos(a: Vehiculo, b: Vehiculo) {
    const da = VEHICULOS[a.tipo];
    const db = VEHICULOS[b.tipo];
    const lim = (da.largo + db.largo) / 2 + 0.5;
    const ex = a.x - b.x;
    const ez = a.z - b.z;
    if (ex * ex + ez * ez > lim * lim || Math.abs(a.y - b.y) > 1.8) return;
    let mejor: { nx: number; nz: number; prof: number; ca: { x: number; z: number }; cb: { x: number; z: number } } | null = null;
    for (const ca of circulosVehiculo(a, da)) {
      for (const cb of circulosVehiculo(b, db)) {
        const dx = ca.x - cb.x;
        const dz = ca.z - cb.z;
        const dist = Math.hypot(dx, dz);
        const prof = ca.r + cb.r - dist;
        if (prof > 0 && (!mejor || prof > mejor.prof)) mejor = { nx: dist > 1e-6 ? dx / dist : 1, nz: dist > 1e-6 ? dz / dist : 0, prof, ca, cb };
      }
    }
    if (!mejor) return;
    const { nx, nz, prof } = mejor;
    const ma = a.destruido ? da.masa * 2 : da.masa;
    const mb = b.destruido ? db.masa * 2 : db.masa;
    const ia = 1 / ma;
    const ib = 1 / mb;
    a.x += nx * prof * (ia / (ia + ib));
    a.z += nz * prof * (ia / (ia + ib));
    b.x -= nx * prof * (ib / (ia + ib));
    b.z -= nz * prof * (ib / (ia + ib));
    const vrel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
    if (vrel >= 0) return;
    const jimp = (-(1 + 0.3) * vrel) / (ia + ib);
    a.vx += jimp * ia * nx;
    a.vz += jimp * ia * nz;
    b.vx -= jimp * ib * nx;
    b.vz -= jimp * ib * nz;
    a.w += ((mejor.ca.x - a.x) * nz - (mejor.ca.z - a.z) * nx) * jimp * ia * 0.15;
    b.w -= ((mejor.cb.x - b.x) * nz - (mejor.cb.z - b.z) * nx) * jimp * ib * 0.15;
    const fuerza = -vrel;
    if (fuerza > 3) {
      this.impactoVehiculo(a, fuerza * (mb / (ma + mb)) * 1.6);
      this.impactoVehiculo(b, fuerza * (ma / (ma + mb)) * 1.6);
      const j = this.jugador;
      // Embestir a la policía es delito; los conductores se enfadan.
      if (j.coche === a || j.coche === b) {
        const otro = j.coche === a ? b : a;
        if (otro.tipo === 'patrulla' && fuerza > 5) this.delito('golpear');
        if (otro.conductor && otro.conductor.tipo === 'civil' && otro.ia.modo === 'carril') otro.claxonT = 0;
      }
    }
  }

  /** Saltos con el coche: cuentan si despegas de una rampa. */
  private vigilarSalto(v: Vehiculo, antesAire: boolean, vyAntes: number) {
    if (!antesAire && v.enAire) {
      const ra = this.ciudad.celdaEn(v.x, v.z).rampa;
      const rampa = ra && Math.hypot(ra.x - v.x, ra.z - v.z) < ra.largo ? ra.id : null;
      this.saltoInicio = { x: v.x, z: v.z, alto: v.y, rampa };
    } else if (antesAire && v.enAire && this.saltoInicio) {
      this.saltoInicio.alto = Math.max(this.saltoInicio.alto, v.y);
    } else if (antesAire && !v.enAire && this.saltoInicio) {
      const s = this.saltoInicio;
      this.saltoInicio = null;
      const dist = Math.hypot(v.x - s.x, v.z - s.z);
      if (vyAntes < -14) this.danarVehiculo(v, (-vyAntes - 14) * 10, null);
      if (!s.rampa || dist < 12) return;
      const premio = Math.round(dist * 8 + s.alto * 40);
      if (!this.g.saltos.includes(s.rampa)) {
        this.g.saltos.push(s.rampa);
        this.avisar(`¡SALTO ÚNICO! ${Math.round(dist)} m · +${Math.round(premio * this.modo.dinero)} $`, 3.5);
        this.ganarDinero(premio);
        this.ganarRespeto(PREMIOS.salto);
      } else {
        this.avisar(`Salto: ${Math.round(dist)} m, altura ${s.alto.toFixed(1)} m`, 2.5);
        this.ganarDinero(Math.round(dist));
      }
    }
  }

  /* ---------- Personas ---------- */

  private fisicaPersonas(dt: number) {
    const ciudad = this.ciudad;
    for (const p of this.personas) {
      if (p.estado === 'coche') {
        const v = p.coche!;
        p.cuerpo.x = v.x;
        p.cuerpo.z = v.z;
        p.cuerpo.y = v.y;
        continue;
      }
      if (p.estado === 'muerto') {
        p.muerteT += dt;
        p.vx = p.vz = 0;
      }
      if (p.estado === 'caido') p.vx = p.vz = 0;
      p.cd = Math.max(-1, p.cd - (p === this.jugador ? 0 : dt));
      if (p !== this.jugador) p.ataqueT += dt;
      // Lejos del jugador se simplifica: sin colisiones con los edificios.
      const k = Math.exp(-6 * dt);
      p.kx *= k;
      p.kz *= k;
      const mx = (p.vx + p.kx) * dt;
      const mz = (p.vz + p.kz) * dt;
      if (p.estado === 'muerto' && Math.abs(p.kx) + Math.abs(p.kz) < 0.05 && p.cuerpo.enSuelo) continue;
      moverCuerpo(p.cuerpo, mx, mz, dt, ciudad, 22);
    }
    // Personas contra coches.
    for (const v of this.vehiculos) {
      const d = VEHICULOS[v.tipo];
      const vel = Math.hypot(v.vx, v.vz);
      for (const p of this.personas) {
        if (p.estado === 'coche' || p.estado === 'muerto' && vel < 3) continue;
        const ex = p.cuerpo.x - v.x;
        const ez = p.cuerpo.z - v.z;
        if (ex * ex + ez * ez > (d.largo / 2 + 1) ** 2) continue;
        if (p.cuerpo.y > v.y + d.alto - 0.2) continue;
        for (const c of circulosVehiculo(v, d)) {
          const dx = p.cuerpo.x - c.x;
          const dz = p.cuerpo.z - c.z;
          const dist = Math.hypot(dx, dz);
          const lim = c.r + RADIO_PERSONA;
          if (dist >= lim) continue;
          const nx = dist > 1e-6 ? dx / dist : 1;
          const nz = dist > 1e-6 ? dz / dist : 0;
          p.cuerpo.x += nx * (lim - dist);
          p.cuerpo.z += nz * (lim - dist);
          const vrel = -(v.vx * nx + v.vz * nz);
          if (vel > 4 && vrel < -3 && p.estado !== 'muerto') {
            // Atropello.
            const fuerza = vel;
            this.tumbar(p, 2);
            p.kx = v.vx * 0.8 + nx * 2;
            p.kz = v.vz * 0.8 + nz * 2;
            p.cuerpo.vy = Math.min(7, fuerza * 0.3);
            p.cuerpo.enSuelo = false;
            const autor = v.conductor;
            this.danarPersona(p, (fuerza - 3) * 6, autor, 'coche');
            v.vx *= 0.92;
            v.vz *= 0.92;
            if (autor === this.jugador) this.eventos.golpe?.(0);
          }
          break;
        }
      }
    }
    // Separación entre personas cercanas.
    const ps = this.personas;
    for (let a = 0; a < ps.length; a++) {
      const pa = ps[a];
      if (pa.estado === 'coche' || pa.estado === 'muerto') continue;
      for (let b = a + 1; b < ps.length; b++) {
        const pb = ps[b];
        if (pb.estado === 'coche' || pb.estado === 'muerto') continue;
        const dx = pa.cuerpo.x - pb.cuerpo.x;
        const dz = pa.cuerpo.z - pb.cuerpo.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.49 || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const s = (0.7 - d) / 2;
        pa.cuerpo.x += (dx / d) * s;
        pa.cuerpo.z += (dz / d) * s;
        pb.cuerpo.x -= (dx / d) * s;
        pb.cuerpo.z -= (dz / d) * s;
      }
    }
  }

  /* ---------- Proyectiles y efectos ---------- */

  private actualizarProyectiles(dt: number) {
    for (const c of this.cohetes) {
      c.t += dt;
      const l = Math.hypot(c.vx, c.vy, c.vz);
      const paso = l * dt;
      const dx = c.vx / l;
      const dy = c.vy / l;
      const dz = c.vz / l;
      let t = this.ciudad.rayo(c.x, c.y, c.z, dx, dy, dz, paso);
      for (const v of this.vehiculos) {
        const d = VEHICULOS[v.tipo];
        if (c.autor?.coche === v) continue;
        t = Math.min(t, rayoCajaGirada(c.x, c.y, c.z, dx, dy, dz, v.x, v.y, v.z, v.yaw, d.ancho / 2, d.alto, d.largo / 2));
      }
      for (const p of this.personas) {
        if (p === c.autor || p.estado === 'muerto' || p.estado === 'coche') continue;
        t = Math.min(t, rayoCilindro(c.x, c.y, c.z, dx, dy, dz, p.cuerpo.x, p.cuerpo.y, p.cuerpo.z, 0.5, ALTO_PERSONA));
      }
      const h = this.helicoptero;
      if (h && !h.destruido) t = Math.min(t, rayoCilindro(c.x, c.y, c.z, dx, dy, dz, h.x, h.y - 1.5, h.z, 2.5, 3));
      if (t < paso || c.t > 4) {
        const k = Math.min(t, paso);
        c.t = 99;
        this.explotar(c.x + dx * k, c.y + dy * k, c.z + dz * k, 7, 300, c.autor);
      } else {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
      }
    }
    this.cohetes = this.cohetes.filter((c) => c.t < 99);
  }

  private actualizarEfectos(dt: number) {
    for (const t of this.trazos) t.t -= dt;
    this.trazos = this.trazos.filter((t) => t.t > 0);
    for (const e of this.explosiones) e.t += dt;
    this.explosiones = this.explosiones.filter((e) => e.t < 1.2);
    for (const r of this.recogibles) r.t += dt;
    this.recogibles = this.recogibles.filter((r) => r.t < 40);
  }

  /* ---------- Estrellas y arresto ---------- */

  private comprobarBuscado(dt: number) {
    const e = this.estrellas;
    if (e > 0) this.persecucionT += dt;
    this.vistoT -= dt;
    if (this.vistoT <= 0) {
      this.vistoT = 0.3;
      const p = this.posJugador();
      this.visto = e > 0 && this.policiaVe(p.x, p.y, p.z, 60);
    }
    if (actualizarBuscado(this.buscado, dt, this.visto)) {
      const ahora = this.estrellas;
      this.cambioEstrellas(e, ahora);
      if (ahora === 0) {
        // Escapaste: respeto según las estrellas que llegaste a tener.
        const max = this.persecucionMax;
        this.ganarRespeto(PREMIOS.escapar(max));
        this.avisar(`¡Has escapado! +${PREMIOS.escapar(max)} de respeto`, 3);
        anotarPersecucion(this.g, { nombre: this.nombreJugador, estrellas: max, segundos: Math.round(this.persecucionT), nivel: this.nivel });
        this.persecucionMax = 0;
      }
    }
  }

  /** ¿Las estrellas parpadean (la policía no te ve)? */
  get estrellasParpadean(): boolean {
    return this.estrellas > 0 && this.buscado.sinVer > 1;
  }

  private comprobarArresto(dt: number) {
    const e = this.estrellas;
    const j = this.jugador;
    if (e === 0 || j.estado === 'muerto') {
      this.arresto = 0;
      return;
    }
    const pos = this.posJugador();
    const v = j.coche;
    const quieto = !v || Math.hypot(v.vx, v.vz) < 1.5;
    let cerca = false;
    if (quieto) {
      const lim = v ? VEHICULOS[v.tipo].ancho / 2 + 1.4 : 1.4;
      for (const p of this.personas) {
        if (p.tipo !== 'policia' || p.estado !== 'pie') continue;
        if (Math.hypot(p.cuerpo.x - pos.x, p.cuerpo.z - pos.z) < lim) {
          cerca = true;
          break;
        }
      }
    }
    // Más estrellas = la policía dispara más y arresta menos.
    const necesita = (v ? 1.6 : 1.1) + (e >= 3 && j.estado === 'pie' ? 1.2 : 0);
    this.arresto = cerca ? this.arresto + dt : Math.max(0, this.arresto - dt * 2);
    if (this.arresto > necesita) this.arrestar();
  }

  /** Progreso del arresto (0 a 1) para el HUD. */
  get progresoArresto(): number {
    return Math.min(1, this.arresto / 1.6);
  }

  /* ---------- Lugares, paquetes y recogibles ---------- */

  private comprobarLugares() {
    const j = this.jugador;
    const pos = this.posJugador();
    const celda = this.ciudad.celdaEn(pos.x, pos.z);
    // Nombre de la zona al cambiar.
    const zona = nombreZona(pos.x, pos.z);
    if (zona !== this.zona) {
      this.zona = zona;
      this.rotular(`${zona} · ${DISTRITOS[celda.distrito].nombre}`);
    }
    // Paquete oculto.
    const pq = celda.paquete;
    if (pq && !this.g.paquetes.includes(pq.id) && Math.hypot(pq.x - pos.x, pq.z - pos.z) < (j.coche ? 2.6 : 1.4)) {
      this.g.paquetes.push(pq.id);
      this.ganarDinero(500);
      this.ganarRespeto(PREMIOS.paquete);
      this.avisar(`¡Paquete oculto! (${this.g.paquetes.length}) +${Math.round(500 * this.modo.dinero)} $`, 3);
      this.eventos.recoger?.();
    }
    // Tiendas y taller.
    if (this.tiendaBloqueada && Math.hypot(this.tiendaBloqueada.x - pos.x, this.tiendaBloqueada.z - pos.z) > 3) this.tiendaBloqueada = null;
    const s = celda.servicio;
    const en = celda.entrada;
    if (!s || !en || this.tiendaBloqueada) return;
    const d = Math.hypot(en.x - pos.x, en.z - pos.z);
    if (s === 'taller') {
      if (j.coche && d < 3.2) {
        this.tiendaBloqueada = { x: en.x, z: en.z };
        this.pintar(j.coche);
      }
      return;
    }
    if ((s === 'armeria' || s === 'comida' || s === 'casa') && !j.coche && d < 1.3 && j.estado === 'pie') {
      this.tiendaBloqueada = { x: en.x, z: en.z };
      j.vx = j.vz = 0;
      this.eventos.tienda?.(s);
    }
  }

  /** Taller de pintura: borra las estrellas, repara y cambia el color por 100 $. */
  pintar(v: Vehiculo) {
    if (!this.gastar(100)) {
      this.avisar('Necesitas 100 $ para pintar el coche', 2.5);
      return;
    }
    const antes = this.estrellas;
    borrarBuscado(this.buscado);
    if (antes > 0) this.cambioEstrellas(antes, 0);
    this.persecucionMax = 0;
    v.vida = VEHICULOS[v.tipo].vida;
    v.ardiendo = -1;
    const colores = VEHICULOS[v.tipo].colores;
    v.color = colores.length > 1 ? colores[(colores.indexOf(v.color) + 1 + this.rng.entero(0, colores.length - 2)) % colores.length] : v.color;
    this.avisar('¡Coche nuevo y sin estrellas! -100 $', 2.5);
    this.eventos.pintura?.();
  }

  private comprobarRecogibles() {
    const pos = this.posJugador();
    const j = this.jugador;
    for (const r of this.recogibles) {
      const lim = j.coche ? 2.4 : 1.2;
      if (Math.abs(r.x - pos.x) > lim || Math.abs(r.z - pos.z) > lim || r.t < 0.4) continue;
      if (j.coche && r.tipo !== 'dinero') continue;
      r.t = 999;
      if (r.tipo === 'dinero') this.ganarDinero(r.valor);
      else if (r.tipo === 'arma' && r.arma) this.darArma(r.arma, r.valor);
      else if (r.tipo === 'vida') j.vida = Math.min(j.vidaMax, j.vida + r.valor);
      else if (r.tipo === 'chaleco') j.chaleco = Math.min(100, j.chaleco + r.valor);
      this.eventos.recoger?.();
    }
  }

  private contarDistancia() {
    const pos = this.posJugador();
    const d = Math.hypot(pos.x - this.distanciaT.x, pos.z - this.distanciaT.z);
    if (d < 5) return;
    this.distanciaT = { x: pos.x, z: pos.z };
    if (d > 50) return;
    const e = this.g.estadisticas;
    if (this.jugador.coche) {
      e.distanciaCoche += d;
      this.g.habilidades.conduccion = Math.min(100, this.g.habilidades.conduccion + d * 0.0025);
    } else e.distanciaPie += d;
  }

  /** Copia al guardado lo que vive en la partida (chaleco y hora). */
  sincronizar() {
    this.g.chaleco = Math.round(this.jugador.chaleco);
    this.g.hora = this.hora;
  }

  /* ---------- Población: peatones, tráfico y policía ---------- */

  /** ¿Un punto está fuera de la vista de la cámara (para aparecer sin que se note)? */
  private fueraDeVista(x: number, z: number, d: number): boolean {
    if (d > 85) return true;
    const ang = Math.abs(difAngulo(Math.atan2(x - this.posJugador().x, z - this.posJugador().z), this.camYaw));
    return ang > 1.0;
  }

  private gestionarPoblacion() {
    const pos = this.posJugador();
    const j = this.jugador;
    // Fuera los lejanos.
    this.personas = this.personas.filter((p) => {
      if (p === j) return true;
      if (p.estado === 'coche') return this.vehiculos.includes(p.coche!);
      const d = Math.hypot(p.cuerpo.x - pos.x, p.cuerpo.z - pos.z);
      if (p.estado === 'muerto') return d < 90 && p.muerteT < 40;
      return d < (p.tipo === 'policia' && this.estrellas > 0 ? 170 : 125);
    });
    if (this.objetivo && !this.personas.includes(this.objetivo)) this.objetivo = null;
    this.vehiculos = this.vehiculos.filter((v) => {
      if (v === j.coche) return true;
      const d = Math.hypot(v.x - pos.x, v.z - pos.z);
      const lejos = v.destruido ? 90 : v.conductor?.tipo === 'policia' && this.estrellas > 0 ? 220 : 170;
      if (d < lejos && !(v.ia.atascadoT > 25 && d > 50)) return true;
      if (v.conductor) v.conductor.coche = null;
      return false;
    });
    this.personas = this.personas.filter((p) => p.estado !== 'coche' || p.coche !== null);

    const celda = this.ciudad.celdaEn(pos.x, pos.z);
    const dist = DISTRITOS[celda.distrito];
    const noche = luzDelDia(this.hora) < 0.35 ? 0.55 : 1;
    const civiles = this.personas.filter((p) => p.tipo !== 'policia' && p.tipo !== 'jugador' && p.estado !== 'coche' && p.estado !== 'muerto').length;
    const objetivoCiv = Math.round(20 * this.densidad * dist.peatones * noche);
    if (civiles < objetivoCiv) this.aparecerPeaton(pos);
    const coches = this.vehiculos.filter((v) => !v.destruido && v.tipo !== 'patrulla').length;
    const objetivoCoches = Math.round(16 * this.densidad * dist.trafico * (noche < 1 ? 0.7 : 1));
    if (coches < objetivoCoches) this.aparecerCoche(pos, this.rng.azar(0.22));
  }

  private aparecerPeaton(pos: { x: number; z: number }) {
    for (let intento = 0; intento < 6; intento++) {
      const i = Math.floor(pos.x / CELDA) + this.rng.entero(-2, 2);
      const k = Math.floor(pos.z / CELDA) + this.rng.entero(-2, 2);
      const c = this.ciudad.celda(i, k);
      const lado = this.rng.entero(0, 3);
      const t = this.rng.siguiente();
      const a = 7.4;
      const ox = i * CELDA;
      const oz = k * CELDA;
      const largo = CELDA - 2 * a;
      const pt = [[ox + a + largo * t, oz + a], [ox + CELDA - a, oz + a + largo * t], [ox + CELDA - a - largo * t, oz + CELDA - a], [ox + a, oz + CELDA - a - largo * t]][lado];
      const d = Math.hypot(pt[0] - pos.x, pt[1] - pos.z);
      if (d < 35 || d > 100 || !this.fueraDeVista(pt[0], pt[1], d)) continue;
      // Bandas en los barrios: la familia (verde) cerca de casa y la rival más lejos.
      let tipo: Exclude<TipoPersona, 'jugador'> = 'civil';
      if (c.distrito === 'barrio' && this.rng.azar(0.45)) tipo = Math.hypot(i, k) < 6 ? 'banda' : 'rival';
      const n = tipo === 'civil' ? 1 : this.rng.entero(2, 3);
      for (let m = 0; m < n; m++) {
        const p = this.crearPersona(tipo, pt[0] + m * 0.8, pt[1] + m * 0.5);
        p.ia.modo = tipo === 'civil' ? 'pasear' : 'quieto';
        p.ia.esquina = this.rng.entero(0, 3);
        p.ia.sentido = this.rng.azar(0.5) ? 1 : -1;
        p.ia.celdaI = i;
        p.ia.celdaK = k;
      }
      return;
    }
  }

  /** Coloca un coche en un carril (o aparcado) fuera de la vista. */
  aparecerCoche(pos: { x: number; z: number }, aparcado: boolean, tipo?: IdVehiculo, conductor: Exclude<TipoPersona, 'jugador'> = 'civil', min = 55, max = 140): Vehiculo | null {
    for (let intento = 0; intento < 8; intento++) {
      const ni = Math.round(pos.x / CELDA) + this.rng.entero(-3, 3);
      const nk = Math.round(pos.z / CELDA) + this.rng.entero(-3, 3);
      const dir = this.rng.entero(0, 3);
      const [dx, dz] = DIRS[dir];
      const s = this.rng.rango(14, CELDA - 14);
      const lat = aparcado ? 4.3 : 2.6;
      const x = ni * CELDA + dx * s + -dz * lat;
      const z = nk * CELDA + dz * s + dx * lat;
      const d = Math.hypot(x - pos.x, z - pos.z);
      if (d < min || d > max || !this.fueraDeVista(x, z, d)) continue;
      if (this.vehiculos.some((v) => Math.hypot(v.x - x, v.z - z) < 9)) continue;
      const t = tipo ?? tipoTrafico(this.rng.siguiente());
      const v = this.crearVehiculo(t, x, z, Math.atan2(dx, dz));
      if (aparcado) {
        v.aparcado = true;
        return v;
      }
      const p = this.crearPersona(conductor, x, z);
      this.subir(p, v);
      asignarCarril(v);
      v.ia.velObjetivo = this.rng.rango(9, 13);
      const vel = v.ia.velObjetivo * 0.7;
      v.vx = Math.sin(v.yaw) * vel;
      v.vz = Math.cos(v.yaw) * vel;
      return v;
    }
    return null;
  }

  private gestionarPolicia() {
    const e = this.estrellas;
    const pos = this.posJugador();
    const patrullas = this.vehiculos.filter((v) => v.tipo === 'patrulla' && !v.destruido && v.conductor?.tipo === 'policia');
    // Patrullas de ronda (aunque no te busquen).
    const ronda = e === 0 && patrullas.length < Math.round(1 * this.densidad + 0.4);
    const unidades = e === 0 ? 0 : Math.min(7, Math.round([0, 1, 2, 3, 4, 5][e] * this.escala.unidades * this.modo.policia));
    if (!this.sinPolicia && (ronda || patrullas.length < unidades)) {
      const v = this.aparecerCoche(pos, false, 'patrulla', 'policia', e > 0 ? 60 : 70, e > 0 ? 120 : 150);
      if (v && e > 0) {
        v.ia.modo = 'persecucion';
        v.sirena = true;
      }
    }
    // Policías a pie con 1 estrella o más.
    const aPie = this.personas.filter((p) => p.tipo === 'policia' && p.estado !== 'coche' && p.estado !== 'muerto').length;
    if (!this.sinPolicia && e > 0 && aPie < Math.min(6, e + 1) && this.rng.azar(0.35)) {
      for (let intento = 0; intento < 5; intento++) {
        const ang = this.rng.rango(-Math.PI, Math.PI);
        const d = this.rng.rango(35, 60);
        const x = pos.x + Math.sin(ang) * d;
        const z = pos.z + Math.cos(ang) * d;
        if (!this.fueraDeVista(x, z, d)) continue;
        if (this.ciudad.bloquesEnArea(x - 0.5, z - 0.5, x + 0.5, z + 0.5, tmpBloques).some((b) => Math.abs(b.x - x) < b.w / 2 + 0.5 && Math.abs(b.z - z) < b.d / 2 + 0.5)) continue;
        const p = this.crearPersona('policia', x, z);
        p.ia.modo = 'atacar';
        p.ia.enemigo = this.jugador;
        p.ia.t = 30;
        break;
      }
    }
    // Las patrullas que te persiguen.
    for (const v of patrullas) {
      if (e > 0 && v.ia.modo !== 'persecucion' && Math.hypot(v.x - pos.x, v.z - pos.z) < 90) {
        v.ia.modo = 'persecucion';
        v.sirena = true;
      } else if (e === 0 && v.ia.modo === 'persecucion') {
        v.sirena = false;
        asignarCarril(v);
        v.ia.velObjetivo = 11;
      }
    }
    // Helicóptero con 4 estrellas.
    if (!this.sinPolicia && e >= 4 && (!this.helicoptero || (this.helicoptero.destruido && this.helicoptero.t > 25))) {
      const ang = this.rng.rango(-Math.PI, Math.PI);
      this.helicoptero = { x: pos.x + Math.sin(ang) * 120, y: 34, z: pos.z + Math.cos(ang) * 120, yaw: 0, vida: Math.round(700 * this.escala.vida), cd: 3, destruido: false, vy: 0, t: 0 };
    }
    if (this.helicoptero && !this.helicoptero.destruido && e < 3) {
      // Se va.
      const h = this.helicoptero;
      if (Math.hypot(h.x - pos.x, h.z - pos.z) > 160) this.helicoptero = null;
    }
    if (this.helicoptero?.destruido && this.helicoptero.t > 30) this.helicoptero = null;
  }

  /* ---------- Trucos ---------- */

  /** Trucos escritos en la pausa. Devuelve el mensaje o null si no existe. */
  truco(codigo: string): string | null {
    const c = codigo.toUpperCase().replace(/[^A-ZÑ]/g, '');
    const j = this.jugador;
    switch (c) {
      case 'SALUDYPLATA':
        j.vida = j.vidaMax;
        j.chaleco = 100;
        this.ganarDinero(250000, false);
        if (j.coche) j.coche.vida = VEHICULOS[j.coche.tipo].vida;
        return 'Vida, chaleco y 250 000 $';
      case 'SINPOLICIA': {
        this.sinPolicia = !this.sinPolicia;
        const antes = this.estrellas;
        borrarBuscado(this.buscado);
        if (antes) this.cambioEstrellas(antes, 0);
        return this.sinPolicia ? 'La policía ya no te busca' : 'La policía vuelve a buscarte';
      }
      case 'MASESTRELLAS': {
        const antes = this.estrellas;
        this.buscado.calor = UMBRALES[Math.min(5, antes + 2)];
        this.cambioEstrellas(antes, this.estrellas);
        return '¡Más estrellas!';
      }
      case 'ARSENAL':
        for (const a of ORDEN_ARMAS) if (a !== 'punos') this.darArma(a, ARMAS[a].paquete * 3);
        return 'Todas las armas';
      case 'DEPORTIVO': {
        const p = this.posJugador();
        const v = this.crearVehiculo('deportivo', p.x + Math.sin(this.camYaw) * 6, p.z + Math.cos(this.camYaw) * 6, this.camYaw);
        v.aparcado = true;
        return 'Un deportivo delante de ti';
      }
      case 'INMORTAL':
        this.dios = !this.dios;
        return this.dios ? 'Nada te hace daño' : 'Vuelves a ser mortal';
      case 'MEDIODIA':
        this.hora = 12;
        return 'Mediodía';
      case 'MEDIANOCHE':
        this.hora = 0;
        return 'Medianoche';
      default:
        return null;
    }
  }
}

