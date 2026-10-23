import { ARMAS } from '../core/armas';
import { CARRIL, CELDA, DIRS, esquinaAcera } from '../core/ciudad';
import { VEHICULOS, velocidadAdelante } from '../core/vehiculos';
import type { Helicoptero, Partida, Persona, Vehiculo } from './logica';

/** IA de peatones, policía, bandas, conductores y helicóptero. */

export interface IaPersona {
  modo: 'pasear' | 'huir' | 'atacar' | 'quieto' | 'manos';
  t: number;
  enemigo: Persona | null;
  amenaza: { x: number; z: number } | null;
  /** Paseo alrededor de la manzana: celda, esquina a la que va y sentido. */
  celdaI: number;
  celdaK: number;
  esquina: number;
  sentido: 1 | -1;
  /** Cruzando la calle hacia este punto. */
  cruce: { x: number; z: number } | null;
  valiente: boolean;
  pensarT: number;
  /** Policía o pandillero que ya ve al jugador. */
  alerta: boolean;
}

export const iaPersona = (): IaPersona => ({
  modo: 'pasear', t: 0, enemigo: null, amenaza: null, celdaI: 0, celdaK: 0, esquina: 0, sentido: 1, cruce: null, valiente: false, pensarT: 0, alerta: false,
});

export interface IaCoche {
  modo: 'carril' | 'persecucion' | 'parado';
  /** Dirección del carril (0 +x, 1 +z, 2 -x, 3 -z) y siguiente cruce. */
  dir: number;
  ni: number;
  nk: number;
  /** Dirección que tomará en el cruce. */
  giro: number;
  atascadoT: number;
  reversaT: number;
  velObjetivo: number;
}

const difAngulo = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/* ---------- Personas ---------- */

/** Mueve a la persona hacia un punto a una velocidad; devuelve la distancia que queda. */
function irHacia(p: Persona, x: number, z: number, vel: number, dt: number): number {
  const dx = x - p.cuerpo.x;
  const dz = z - p.cuerpo.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) {
    p.vx = p.vz = 0;
    p.moviendose = false;
    return d;
  }
  p.vx = (dx / d) * vel;
  p.vz = (dz / d) * vel;
  const yaw = Math.atan2(dx, dz);
  p.yaw += difAngulo(yaw, p.yaw) * Math.min(1, dt * 10);
  p.moviendose = true;
  p.corriendo = vel > 3;
  return d;
}

function quieto(p: Persona) {
  p.vx = p.vz = 0;
  p.moviendose = false;
  p.corriendo = false;
}

/** Esquina de acera más cercana a un punto. */
function esquinaCercana(x: number, z: number) {
  const i = Math.floor(x / CELDA);
  const k = Math.floor(z / CELDA);
  const lx = x - i * CELDA < CELDA / 2;
  const lz = z - k * CELDA < CELDA / 2;
  return { i, k, n: lx ? (lz ? 0 : 3) : lz ? 1 : 2 };
}

function pasear(p: Persona, dt: number, vel: number) {
  const ia = p.ia;
  if (ia.cruce) {
    if (irHacia(p, ia.cruce.x, ia.cruce.z, vel * 1.2, dt) < 0.8) {
      const e = esquinaCercana(ia.cruce.x, ia.cruce.z);
      ia.celdaI = e.i;
      ia.celdaK = e.k;
      ia.esquina = e.n + ia.sentido;
      ia.cruce = null;
    }
    return;
  }
  const obj = esquinaAcera(ia.celdaI, ia.celdaK, ia.esquina);
  if (irHacia(p, obj.x, obj.z, vel, dt) < 0.8) {
    // En la esquina: seguir por la manzana o cruzar la calle.
    if (Math.random() < 0.3) {
      const ox = Math.round(obj.x / CELDA) * CELDA;
      const oz = Math.round(obj.z / CELDA) * CELDA;
      ia.cruce = Math.random() < 0.5 ? { x: 2 * ox - obj.x, z: obj.z } : { x: obj.x, z: 2 * oz - obj.z };
    } else ia.esquina += ia.sentido;
  }
}

function volverAPasear(p: Persona) {
  const e = esquinaCercana(p.cuerpo.x, p.cuerpo.z);
  p.ia.modo = 'pasear';
  p.ia.celdaI = e.i;
  p.ia.celdaK = e.k;
  p.ia.esquina = e.n;
  p.ia.cruce = null;
  p.ia.enemigo = null;
  p.manosArriba = false;
}

export function actualizarPersonaIa(par: Partida, p: Persona, dt: number) {
  if (p.estado === 'muerto' || p.estado === 'coche') return;
  if (p.estado === 'caido') {
    p.caidoT -= dt;
    quieto(p);
    if (p.caidoT <= 0) p.estado = 'pie';
    return;
  }
  const ia = p.ia;
  const j = par.jugador;
  ia.t -= dt;
  ia.pensarT -= dt;

  // Policía y bandas: ¿van a por el jugador?
  if (ia.pensarT <= 0) {
    ia.pensarT = 0.4 + Math.random() * 0.3;
    pensar(par, p);
  }

  switch (ia.modo) {
    case 'pasear':
      pasear(p, dt, p.tipo === 'policia' ? 1.6 : 1.4);
      break;
    case 'quieto':
      quieto(p);
      // Los pandilleros miran a su alrededor y a veces pasean.
      if (ia.t <= 0) {
        ia.t = 3 + Math.random() * 4;
        p.yaw += (Math.random() - 0.5) * 2;
        if (Math.random() < 0.2) volverAPasear(p);
      }
      break;
    case 'manos':
      quieto(p);
      p.manosArriba = true;
      if (ia.t <= 0) {
        p.manosArriba = false;
        ia.modo = 'huir';
        ia.t = 6;
        ia.amenaza = { x: j.cuerpo.x, z: j.cuerpo.z };
      }
      break;
    case 'huir': {
      const a = ia.amenaza ?? { x: j.cuerpo.x, z: j.cuerpo.z };
      const dx = p.cuerpo.x - a.x;
      const dz = p.cuerpo.z - a.z;
      const d = Math.hypot(dx, dz) || 1;
      irHacia(p, p.cuerpo.x + (dx / d) * 5, p.cuerpo.z + (dz / d) * 5, 4.6, dt);
      if (ia.t <= 0) volverAPasear(p);
      break;
    }
    case 'atacar':
      atacar(par, p, dt);
      break;
  }
}

/** Decide si la policía o las bandas atacan al jugador. */
function pensar(par: Partida, p: Persona) {
  const ia = p.ia;
  const j = par.jugador;
  const pos = par.posJugador();
  const d = Math.hypot(pos.x - p.cuerpo.x, pos.z - p.cuerpo.z);
  if (p.tipo === 'policia') {
    const e = par.estrellas;
    if (e > 0 && j.estado !== 'muerto') {
      if (ia.modo !== 'atacar') {
        ia.modo = 'atacar';
        ia.enemigo = j;
      }
      ia.t = 10;
    } else if (ia.modo === 'atacar' && ia.enemigo === j && e === 0) volverAPasear(p);
  } else if (p.tipo === 'rival') {
    if (par.escala.bandaHostil && d < 18 && j.estado !== 'muerto' && ia.modo !== 'atacar' && par.ciudad.seVen(p.cuerpo.x, 1.6, p.cuerpo.z, pos.x, pos.y + 1.2, pos.z)) {
      ia.modo = 'atacar';
      ia.enemigo = j;
      ia.t = 20;
    }
  } else if (p.tipo === 'banda') {
    // La familia defiende al jugador de la banda rival y de quien le ataque.
    if (ia.modo !== 'atacar' && d < 25) {
      const rival = par.personas.find((o) => o.tipo === 'rival' && o.estado === 'pie' && o.ia.enemigo === j && Math.hypot(o.cuerpo.x - p.cuerpo.x, o.cuerpo.z - p.cuerpo.z) < 25);
      if (rival) {
        ia.modo = 'atacar';
        ia.enemigo = rival;
        ia.t = 15;
      }
    }
  }
  if (ia.modo === 'atacar' && (!ia.enemigo || ia.enemigo.estado === 'muerto' || ia.t <= 0)) volverAPasear(p);
}

function atacar(par: Partida, p: Persona, dt: number) {
  const ia = p.ia;
  const o = ia.enemigo;
  if (!o || o.estado === 'muerto') {
    volverAPasear(p);
    return;
  }
  const v = o.coche;
  const ox = v ? v.x : o.cuerpo.x;
  const oz = v ? v.z : o.cuerpo.z;
  const oy = v ? v.y + 0.6 : o.cuerpo.y;
  const dx = ox - p.cuerpo.x;
  const dz = oz - p.cuerpo.z;
  const d = Math.hypot(dx, dz);
  if (d > 110) {
    volverAPasear(p);
    return;
  }
  const arma = ARMAS[p.arma];
  const j = par.jugador;
  const policia = p.tipo === 'policia';
  // Con 1 estrella la policía no dispara: intenta arrestarte.
  const dispara = !arma.cuerpo && (!policia || par.estrellas >= 2 || o !== j);
  const alcance = dispara ? Math.min(arma.alcance, 30) : (v ? VEHICULOS[v.tipo].ancho / 2 + 0.9 : 1.1);
  const ve = d < alcance + 5 && par.ciudad.seVen(p.cuerpo.x, p.cuerpo.y + 1.5, p.cuerpo.z, ox, oy + 1.2, oz);
  if (d > alcance * (dispara ? 0.8 : 1) || !ve) {
    irHacia(p, ox, oz, policia ? 5.4 : 5, dt);
    return;
  }
  quieto(p);
  p.yaw = Math.atan2(dx, dz);
  if (p.cd > 0) return;
  if (!dispara) {
    if (!policia || o !== j) {
      // Golpe cuerpo a cuerpo.
      p.cd = arma.cadencia * 1.6;
      p.ataqueT = 0;
      if (arma.cuerpo) par.golpear(p, arma.dano * (p.tipo === 'civil' ? 0.6 : 1), arma.alcance + 0.3);
    }
    return;
  }
  // Disparo: probabilidad de acierto según puntería, distancia y si el objetivo va en coche.
  p.cd = arma.cadencia * (arma.automatica ? 2.5 : 1.8) + Math.random() * 0.4;
  p.ataqueT = 0;
  const base = o === j ? par.escala.punteria * par.modo.punteria : 0.5;
  const mov = v ? Math.min(1, Math.hypot(v.vx, v.vz) / 25) : Math.hypot(o.vx, o.vz) > 5 ? 0.4 : 0;
  const prob = base * (1 - (d / arma.alcance) * 0.5) * (1 - mov * 0.5);
  const acierta = Math.random() < prob;
  const sx = p.cuerpo.x + Math.sin(p.yaw) * 0.5;
  const sy = p.cuerpo.y + 1.35;
  const sz = p.cuerpo.z + Math.cos(p.yaw) * 0.5;
  const fallo = acierta ? 0 : 1.2 + Math.random() * 1.5;
  const ang = Math.random() * Math.PI * 2;
  par.trazos.push({ x0: sx, y0: sy, z0: sz, x1: ox + Math.cos(ang) * fallo, y1: oy + 1.1 + (Math.random() - 0.5) * fallo, z1: oz + Math.sin(ang) * fallo, t: 0.07 });
  const pj = par.posJugador();
  par.eventos.disparo?.(p.arma, Math.hypot(pj.x - p.cuerpo.x, pj.z - p.cuerpo.z));
  if (acierta) {
    const dano = arma.dano * arma.perdigones * 0.55 * (o === j ? 1 : 1.5);
    if (v) {
      par.danarVehiculo(v, dano * 1.2, p);
      if (o === j && Math.random() < 0.3) par.danarPersona(o, dano * 0.5, p, 'bala');
    } else par.danarPersona(o, dano, p, 'bala');
  }
  par.ruido(p.cuerpo.x, p.cuerpo.z, 25, p);
}

/* ---------- Conductores ---------- */

/** Coloca el coche en el carril más cercano según hacia dónde mira. */
export function asignarCarril(v: Vehiculo) {
  const ni = Math.round(v.x / CELDA);
  const nk = Math.round(v.z / CELDA);
  const enX = Math.abs(v.z - nk * CELDA) < Math.abs(v.x - ni * CELDA);
  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  let dir: number;
  if (enX) dir = fx >= 0 ? 0 : 2;
  else dir = fz >= 0 ? 1 : 3;
  const [dx, dz] = DIRS[dir];
  // Siguiente cruce por delante.
  const ia = v.ia;
  ia.modo = 'carril';
  ia.dir = dir;
  if (dx !== 0) {
    ia.ni = dx > 0 ? Math.floor(v.x / CELDA) + 1 : Math.ceil(v.x / CELDA) - 1;
    ia.nk = nk;
  } else {
    ia.ni = ni;
    ia.nk = dz > 0 ? Math.floor(v.z / CELDA) + 1 : Math.ceil(v.z / CELDA) - 1;
  }
  ia.giro = elegirGiro(dir);
  ia.atascadoT = 0;
}

function elegirGiro(dir: number): number {
  const r = Math.random();
  return r < 0.5 ? dir : r < 0.75 ? (dir + 1) & 3 : (dir + 3) & 3;
}

/** Desplazamiento a la derecha del carril de la dirección d. */
function lateral(d: number) {
  const [fx, fz] = DIRS[d];
  return { x: -fz * CARRIL, z: fx * CARRIL };
}

/** Distancia libre por delante (coches, personas y el jugador en un pasillo estrecho). */
function libreDelante(par: Partida, v: Vehiculo, alcance: number): number {
  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  const d = VEHICULOS[v.tipo];
  let libre = alcance;
  const mirar = (x: number, z: number, ancho: number) => {
    const ex = x - v.x;
    const ez = z - v.z;
    const a = ex * fx + ez * fz - d.largo / 2;
    if (a < -0.5 || a > libre) return;
    const l = Math.abs(ex * fz - ez * fx);
    if (l < 1.4 + ancho) libre = Math.max(0, a);
  };
  for (const o of par.vehiculos) if (o !== v) mirar(o.x, o.z, VEHICULOS[o.tipo].ancho / 2);
  for (const p of par.personas) if (p.estado !== 'coche' && p.estado !== 'muerto') mirar(p.cuerpo.x, p.cuerpo.z, 0.3);
  return libre;
}

export function actualizarConductor(par: Partida, v: Vehiculo, dt: number) {
  const ia = v.ia;
  const m = v.mandos;
  const d = VEHICULOS[v.tipo];
  const vf = velocidadAdelante(v);
  const p = v.conductor!;
  if (v.ardiendo >= 0) return;
  let tx: number;
  let tz: number;
  let velObj: number;

  if (ia.modo === 'persecucion') {
    const pos = par.posJugador();
    const j = par.jugador;
    const jv = j.coche;
    // Apunta un poco por delante de donde vas.
    tx = pos.x + (jv ? jv.vx * 0.6 : 0);
    tz = pos.z + (jv ? jv.vz * 0.6 : 0);
    const dist = Math.hypot(tx - v.x, tz - v.z);
    velObj = Math.min(d.velMax, 10 + dist * 0.6);
    if (!jv && dist < 14) {
      // A pie: frena y bajan los agentes.
      velObj = 0;
      if (Math.abs(vf) < 1.5 && j.estado !== 'muerto') {
        par.bajar(p);
        p.ia.modo = 'atacar';
        p.ia.enemigo = j;
        p.ia.t = 20;
        const comp = par.crearPersona('policia', v.x - Math.cos(v.yaw) * 1.6, v.z + Math.sin(v.yaw) * 1.6);
        comp.ia.modo = 'atacar';
        comp.ia.enemigo = j;
        comp.ia.t = 20;
        ia.modo = 'parado';
        return;
      }
    }
  } else if (ia.modo === 'carril') {
    // Sigue el carril; en los cruces gira por la esquina (punto donde se cortan los dos carriles).
    const [dx, dz] = DIRS[ia.dir];
    const nx = ia.ni * CELDA;
    const nz = ia.nk * CELDA;
    const look = 6 + Math.abs(vf) * 0.35;
    const off = lateral(ia.dir);
    let cx: number;
    let cz: number;
    if (ia.giro === ia.dir) {
      cx = nx + off.x;
      cz = nz + off.z;
    } else {
      const off2 = lateral(ia.giro);
      cx = nx + off.x + off2.x;
      cz = nz + off.z + off2.z;
    }
    const s = (v.x - cx) * dx + (v.z - cz) * dz;
    const [gx, gz] = DIRS[ia.giro];
    const s2 = (v.x - cx) * gx + (v.z - cz) * gz;
    // Cruce pasado: ya avanza por la calle nueva (solo cuenta cerca de la esquina) o la ha rebasado.
    if ((ia.giro !== ia.dir && s > -8 && s2 > 0.5) || s > 1.5) {
      // Pasó el cruce: nuevo tramo.
      ia.dir = ia.giro;
      ia.ni += DIRS[ia.dir][0];
      ia.nk += DIRS[ia.dir][1];
      ia.giro = elegirGiro(ia.dir);
      return;
    }
    const resto = -s;
    if (look < resto) {
      tx = cx - dx * (resto - look);
      tz = cz - dz * (resto - look);
    } else {
      tx = cx + gx * (look - resto);
      tz = cz + gz * (look - resto);
    }
    // Corrige hacia la línea del carril.
    const lat = (v.x - cx) * -dz + (v.z - cz) * dx;
    tx -= -dz * lat * 0.3;
    tz -= dx * lat * 0.3;
    velObj = ia.velObjetivo;
    if (ia.giro !== ia.dir && resto < 18) velObj = Math.min(velObj, 6.5);
    const libre = libreDelante(par, v, 4 + Math.abs(vf) * 1.4);
    if (libre < 3 + Math.abs(vf) * 0.9) {
      velObj = libre < 2.5 ? 0 : velObj * (libre / (3 + Math.abs(vf)));
      ia.atascadoT += dt;
      if (ia.atascadoT > 3 && v.claxonT <= 0 && Math.random() < 0.02) v.claxonT = 0.6;
    } else ia.atascadoT = Math.max(0, ia.atascadoT - dt);
    // Se le pasa el susto poco a poco.
    if (ia.velObjetivo > 13) ia.velObjetivo -= dt * 0.5;
  } else {
    m.acelerar = 0;
    m.frenar = Math.abs(vf) > 0.3 ? 1 : 0;
    m.giro = 0;
    m.mano = true;
    return;
  }

  // Marcha atrás si se queda atascado contra algo.
  if (ia.reversaT > 0) {
    ia.reversaT -= dt;
    m.acelerar = 0;
    m.frenar = 1;
    m.giro = -m.giro;
    m.mano = false;
    return;
  }
  const yawObj = Math.atan2(tx - v.x, tz - v.z);
  const ang = difAngulo(yawObj, v.yaw);
  // Ángulo positivo = el objetivo está a la izquierda (el yaw crece hacia la izquierda).
  m.giro = Math.max(-1, Math.min(1, -ang * 2.2));
  const error = velObj - vf;
  m.acelerar = error > 0.5 ? Math.min(1, error / 4) : 0;
  m.frenar = error < -1 ? Math.min(1, -error / 5) : 0;
  m.mano = ia.modo === 'persecucion' && Math.abs(ang) > 1.2 && vf > 12;
  if (ia.modo === 'persecucion' && m.acelerar > 0.5 && Math.abs(vf) < 1) {
    ia.atascadoT += dt;
    if (ia.atascadoT > 1.5) {
      ia.reversaT = 1.2;
      ia.atascadoT = 0;
    }
  }
}

/* ---------- Helicóptero ---------- */

export function actualizarHelicoptero(par: Partida, h: Helicoptero, dt: number) {
  h.t += dt;
  if (h.destruido) {
    // Cae dando vueltas y explota al tocar el suelo.
    h.vy -= 12 * dt;
    h.y += h.vy * dt;
    h.yaw += dt * 4;
    if (h.y <= 0.5 && h.vy < 0) {
      h.y = 0.5;
      if (h.vy < -1) par.explotar(h.x, 1, h.z, 9, 200, null);
      h.vy = 0;
    }
    return;
  }
  const pos = par.posJugador();
  // Vuela en círculos alrededor del jugador, a unos 25 m.
  const ang = h.t * 0.25;
  const ox = pos.x + Math.sin(ang) * 22;
  const oz = pos.z + Math.cos(ang) * 22;
  const dx = ox - h.x;
  const dz = oz - h.z;
  const d = Math.hypot(dx, dz);
  const vel = Math.min(22, d * 0.8);
  if (d > 0.1) {
    h.x += (dx / d) * vel * dt;
    h.z += (dz / d) * vel * dt;
  }
  h.y += (26 - h.y) * Math.min(1, dt);
  h.yaw += difAngulo(Math.atan2(pos.x - h.x, pos.z - h.z), h.yaw) * Math.min(1, dt * 2);
  h.cd -= dt;
  if (h.cd <= 0 && par.estrellas >= 3) {
    h.cd = 0.25;
    // Ráfagas cortas desde la puerta.
    const j = par.jugador;
    if (j.estado === 'muerto') return;
    const visible = par.ciudad.seVen(h.x, h.y - 1, h.z, pos.x, pos.y + 1, pos.z);
    if (!visible) return;
    if (Math.floor(h.t / 2) % 2 === 1) return;
    const acierta = Math.random() < 0.18 * par.modo.punteria * (j.coche ? 0.7 : 1);
    const err = acierta ? 0 : 2;
    par.trazos.push({ x0: h.x, y0: h.y - 1.2, z0: h.z, x1: pos.x + (Math.random() - 0.5) * err * 2, y1: pos.y + 1, z1: pos.z + (Math.random() - 0.5) * err * 2, t: 0.07 });
    par.eventos.disparo?.('subfusil', Math.hypot(pos.x - h.x, pos.z - h.z));
    if (acierta) {
      if (j.coche) par.danarVehiculo(j.coche, 18, null);
      else par.danarPersona(j, 9, null, 'bala');
    }
  }
}
