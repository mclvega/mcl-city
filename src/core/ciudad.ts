import { bloque, rayoCaja, type Bloque, type Mapa } from './fisica';
import { crearRng, hash2, ruido, type Rng } from './rng';

/**
 * Ciudad infinita en cuadrícula. Las calles pasan por x = i·CELDA y z = k·CELDA.
 * La celda (i, k) es el cuadrado [i·CELDA, (i+1)·CELDA] × [k·CELDA, (k+1)·CELDA]: media calzada en cada borde,
 * la acera alrededor y el solar en el centro. Cada celda sale de una semilla de sus coordenadas (siempre es igual).
 */
export const CELDA = 60;
/** Media anchura de la calzada (un carril por sentido). */
export const MEDIA_CALZADA = 5.5;
/** Distancia del centro de la calle al borde del solar (calzada + acera). */
export const BORDE = 9;
/** Distancia del centro de la calle al centro de cada carril. */
export const CARRIL = 2.6;
/** Distancia del centro de la calle a la línea por la que andan los peatones. */
export const LINEA_ACERA = 7.4;
/** Celdas por lado de cada zona de servicios. */
export const ZONA = 5;

export type Distrito = 'centro' | 'comercial' | 'residencial' | 'barrio' | 'industrial' | 'parque' | 'campo' | 'desierto';
export type Servicio = 'hospital' | 'policia' | 'armeria' | 'comida' | 'taller' | 'casa';

export const DISTRITOS: Record<Distrito, { nombre: string; suelo: number; peatones: number; trafico: number }> = {
  centro: { nombre: 'Centro', suelo: 0x9a9a9a, peatones: 1.4, trafico: 1.3 },
  comercial: { nombre: 'Comercial', suelo: 0x6f6f72, peatones: 1.2, trafico: 1.2 },
  residencial: { nombre: 'Residencial', suelo: 0x6fb64a, peatones: 0.8, trafico: 0.8 },
  barrio: { nombre: 'Barrio', suelo: 0x95a05a, peatones: 0.9, trafico: 0.7 },
  industrial: { nombre: 'Industrial', suelo: 0x8f8a80, peatones: 0.4, trafico: 0.9 },
  parque: { nombre: 'Parque', suelo: 0x5fae45, peatones: 0.9, trafico: 0.6 },
  campo: { nombre: 'Campo', suelo: 0x88b04b, peatones: 0.2, trafico: 0.4 },
  desierto: { nombre: 'Desierto', suelo: 0xd9c28a, peatones: 0.1, trafico: 0.35 },
};

export const SERVICIOS: Record<Servicio, { nombre: string; icono: string; color: number; ancho: number; fondo: number; alto: number }> = {
  hospital: { nombre: 'Hospital', icono: '🏥', color: 0xf2f2f2, ancho: 28, fondo: 20, alto: 14 },
  policia: { nombre: 'Comisaría', icono: '🚓', color: 0x3f5f8f, ancho: 26, fondo: 18, alto: 10 },
  armeria: { nombre: 'Armería', icono: '🔫', color: 0x6b7a4a, ancho: 18, fondo: 14, alto: 6 },
  comida: { nombre: 'Pollo Feliz', icono: '🍗', color: 0xe8862e, ancho: 16, fondo: 14, alto: 6 },
  taller: { nombre: 'Pinta y Listo', icono: '🎨', color: 0x4a90c8, ancho: 18, fondo: 14, alto: 7 },
  casa: { nombre: 'Tu casa', icono: '🏠', color: 0xf0e0c0, ancho: 12, fondo: 10, alto: 6 },
};

export type TipoArbol = 'redondo' | 'pino' | 'palmera' | 'cactus';

export interface Arbol {
  x: number;
  z: number;
  tipo: TipoArbol;
  escala: number;
}

export interface Rampa {
  x: number;
  z: number;
  /** Hacia dónde sube: adelante = (sin yaw, cos yaw). */
  yaw: number;
  largo: number;
  ancho: number;
  alto: number;
  id: string;
}

export interface Entrada {
  x: number;
  z: number;
  /** Mira hacia la calle. */
  yaw: number;
}

export interface Celda {
  i: number;
  k: number;
  distrito: Distrito;
  bloques: Bloque[];
  arboles: Arbol[];
  farolas: Array<{ x: number; z: number }>;
  servicio: Servicio | null;
  entrada: Entrada | null;
  edificioServicio: Bloque | null;
  rampa: Rampa | null;
  paquete: { x: number; z: number; id: string } | null;
}

const SEMILLA = 1337;

/** Distrito de una celda: desierto y campo lejos del origen; en la ciudad, centro, comercial, barrios, parques e industria. */
export function distritoDe(i: number, k: number): Distrito {
  const dist = Math.hypot(i, k);
  const b = ruido(i / 26, k / 26, 11) + Math.max(0, 1 - dist / 10) * 0.6;
  if (b < 0.25) return 'desierto';
  if (b < 0.37) return 'campo';
  const d = ruido(i / 7, k / 7, 23) + Math.max(0, 1 - Math.hypot(i - 4, k + 3) / 5) * 0.45;
  if (d > 0.72) return 'centro';
  if (d > 0.6) return 'comercial';
  const n = ruido(i / 4.5, k / 4.5, 37);
  if (n < 0.2) return 'parque';
  if (n > 0.82) return 'industrial';
  return ruido(i / 5, k / 5, 41) + Math.max(0, 1 - dist / 4) * 0.35 > 0.62 ? 'barrio' : 'residencial';
}

const PREFIJOS = ['Villa', 'Barrio', 'Colonia', 'San', 'Santa', 'Los', 'Las', 'Puerto', 'Monte', 'Valle', 'Lomas de', 'Jardines de', 'Paseo', 'Alto'];
const NUCLEOS = ['Esperanza', 'Robles', 'Pinos', 'Rosas', 'Palmeras', 'Sol', 'Luna', 'Cruz', 'Lucía', 'Marina', 'Olivos', 'Fuentes', 'Arenal', 'Cerezos', 'Molinos', 'Girasoles', 'Naranjos', 'Faro', 'Prado', 'Encinas'];
const SUFIJOS = ['', '', '', ' Norte', ' Sur', ' Este', ' Oeste', ' Viejo', ' Nuevo', ' Alto', ' Bajo'];

/** Nombre del barrio (zonas de 4 × 4 celdas). */
export function nombreZona(x: number, z: number): string {
  const zi = Math.floor(x / CELDA / 4);
  const zk = Math.floor(z / CELDA / 4);
  const r = crearRng(hash2(zi, zk, 991));
  return `${r.elegir(PREFIJOS)} ${r.elegir(NUCLEOS)}${r.elegir(SUFIJOS)}`;
}

/** Servicios de una zona de ZONA × ZONA celdas: índice local (li + lk·ZONA) → servicio. */
export function serviciosDeZona(si: number, sk: number): Map<number, Servicio> {
  const r = crearRng(hash2(si, sk, 77));
  const libres = Array.from({ length: ZONA * ZONA }, (_, n) => n).filter((n) => !(si === 0 && sk === 0 && n === 0));
  const m = new Map<number, Servicio>();
  for (const s of ['hospital', 'policia', 'armeria', 'comida', 'taller'] as const) {
    const idx = Math.floor(r.siguiente() * libres.length);
    m.set(libres[idx], s);
    libres.splice(idx, 1);
  }
  if (si === 0 && sk === 0) m.set(0, 'casa');
  return m;
}

/** Celda de la zona con rampa (o -1) y celda con paquete oculto. */
function extrasDeZona(si: number, sk: number): { rampas: number[]; paquete: number } {
  const r = crearRng(hash2(si, sk, 313));
  return { rampas: [r.entero(0, 24), r.entero(0, 24), r.entero(0, 24)], paquete: r.entero(0, 24) };
}

const PAREDES_PISO = [0xc9b79c, 0xa86b52, 0xd8d0c0, 0x9aa8b5, 0xc48f6a, 0xe0c9a6, 0x8f7a6a];
const PAREDES_TORRE = [0x7fa7c9, 0x9fb6c8, 0x6d8aa8, 0xb8c4cc, 0x8fa39a, 0xc8b9a0];
const PAREDES_CASA = [0xf2e2c4, 0xbcd7e8, 0xf2c4c4, 0xd9e8c4, 0xe8d0a0, 0xffffff, 0xc9a27a];
const TECHOS = [0x9c4a2f, 0x37586e, 0x7b3f61, 0x5d4632, 0x6b2a20, 0x5c636c];
const NAVES = [0x9aa3ab, 0x7d8a96, 0xb0a28a, 0x8c6f5a];

/** Genera el contenido de una celda. */
export function generarCelda(i: number, k: number): Celda {
  const r = crearRng(hash2(i, k, SEMILLA));
  const si = Math.floor(i / ZONA);
  const sk = Math.floor(k / ZONA);
  const local = i - si * ZONA + (k - sk * ZONA) * ZONA;
  const servicio = serviciosDeZona(si, sk).get(local) ?? null;
  const extras = extrasDeZona(si, sk);
  const distrito = distritoDe(i, k);
  const c: Celda = { i, k, distrito, bloques: [], arboles: [], farolas: [], servicio, entrada: null, edificioServicio: null, rampa: null, paquete: null };
  const ox = i * CELDA;
  const oz = k * CELDA;
  const x0 = ox + BORDE;
  const x1 = ox + CELDA - BORDE;
  const z0 = oz + BORDE;
  const z1 = oz + CELDA - BORDE;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const lado = x1 - x0;

  // Rampa para saltos (solo en solares abiertos).
  const abierto = distrito === 'parque' || distrito === 'campo' || distrito === 'desierto';
  const rampaIdx = extras.rampas.indexOf(local);
  if (!servicio && abierto && rampaIdx !== -1) {
    const yaw = r.entero(0, 3) * (Math.PI / 2);
    c.rampa = { x: cx, z: cz, yaw, largo: 9, ancho: 5, alto: 2.2, id: `${si}:${sk}:${rampaIdx}` };
  }
  /** ¿El punto está en el pasillo de la rampa (hay que dejarlo libre)? */
  const enPasillo = (x: number, z: number, margen: number) => {
    const ra = c.rampa;
    if (!ra) return false;
    const fx = Math.sin(ra.yaw);
    const fz = Math.cos(ra.yaw);
    const lat = Math.abs((x - ra.x) * fz - (z - ra.z) * fx);
    return lat < 5 + margen;
  };
  const poner = (b: Bloque) => {
    if (enPasillo(b.x, b.z, Math.max(b.w, b.d) / 2)) return;
    c.bloques.push(b);
  };
  const arbol = (x: number, z: number, tipo: TipoArbol, escala = r.rango(0.8, 1.25)) => {
    if (enPasillo(x, z, 1)) return;
    c.arboles.push({ x, z, tipo, escala });
    if (tipo !== 'cactus') c.bloques.push(bloque('tronco', x, z, 0.5 * escala, 0.5 * escala, 3 * escala));
    else c.bloques.push(bloque('tronco', x, z, 0.6 * escala, 0.6 * escala, 2.4 * escala));
  };

  if (servicio) {
    const s = SERVICIOS[servicio];
    // Fachada hacia una calle al azar; delante queda la entrada.
    const ori = r.entero(0, 3);
    const yaw = [Math.PI, -Math.PI / 2, 0, Math.PI / 2][ori];
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const w = Math.abs(fx) > 0.5 ? s.fondo : s.ancho;
    const d = Math.abs(fx) > 0.5 ? s.ancho : s.fondo;
    // La fachada queda a 8 m del borde del solar que da a la calle.
    const retiro = lado / 2 - 8 - (Math.abs(fx) > 0.5 ? w : d) / 2;
    const bx = cx + fx * retiro;
    const bz = cz + fz * retiro;
    const b = bloque('servicio', bx, bz, w, d, s.alto, s.color);
    if (servicio === 'casa') {
      b.tipo = 'casa';
      b.techo = 0x9c4a2f;
    }
    c.bloques.push(b);
    c.edificioServicio = b;
    const fondoFrente = (Math.abs(fx) > 0.5 ? w : d) / 2;
    c.entrada = { x: bx + fx * (fondoFrente + 3.5), z: bz + fz * (fondoFrente + 3.5), yaw };
    // Árboles en las esquinas traseras.
    for (const [ax, az] of [[x0 + 3, z0 + 3], [x1 - 3, z0 + 3], [x0 + 3, z1 - 3], [x1 - 3, z1 - 3]]) {
      if (Math.abs(ax - bx) > w / 2 + 2 || Math.abs(az - bz) > d / 2 + 2) {
        if (Math.hypot(ax - c.entrada.x, az - c.entrada.z) > 8) arbol(ax, az, distrito === 'desierto' ? 'palmera' : 'redondo');
      }
    }
  } else {
    generarSolar(c, r, distrito, x0, z0, x1, z1, poner, arbol);
  }

  // Farolas junto al bordillo (en campo y desierto, menos).
  const p = MEDIA_CALZADA + 0.6;
  const puntos = abierto && distrito !== 'parque'
    ? [[CELDA / 2, p], [CELDA / 2, CELDA - p]]
    : [[p, p], [CELDA - p, p], [p, CELDA - p], [CELDA - p, CELDA - p], [CELDA / 2, p], [CELDA / 2, CELDA - p], [p, CELDA / 2], [CELDA - p, CELDA / 2]];
  for (const [fx, fz] of puntos) {
    c.farolas.push({ x: ox + fx, z: oz + fz });
    c.bloques.push(bloque('poste', ox + fx, oz + fz, 0.3, 0.3, 6.5));
  }
  // Árboles en la acera de las zonas residenciales.
  if (distrito === 'residencial' || distrito === 'comercial') {
    for (const t of [0.3, 0.7]) {
      arbol(ox + CELDA * t, oz + BORDE - 1, 'redondo', 0.9);
      arbol(ox + CELDA * t, oz + CELDA - BORDE + 1, 'redondo', 0.9);
    }
  }

  // Paquete oculto en la acera.
  if (extras.paquete === local && !(i === 0 && k === 0)) {
    const t = r.rango(0.25, 0.75);
    const lado2 = r.entero(0, 3);
    const a = LINEA_ACERA + 0.6;
    const pos = [[CELDA * t, a], [CELDA - a, CELDA * t], [CELDA * t, CELDA - a], [a, CELDA * t]][lado2];
    c.paquete = { x: ox + pos[0], z: oz + pos[1], id: `${si}:${sk}` };
  }
  return c;
}

function generarSolar(
  c: Celda, r: Rng, distrito: Distrito, x0: number, z0: number, x1: number, z1: number,
  poner: (b: Bloque) => void, arbol: (x: number, z: number, tipo: TipoArbol, escala?: number) => void,
) {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const lado = x1 - x0;
  switch (distrito) {
    case 'centro': {
      if (r.azar(0.15)) {
        // Plaza con fuente y árboles.
        poner(bloque('muro', cx, cz, 5, 5, 0.8, 0xbdbdbd));
        for (let a = 0; a < 8; a++) arbol(cx + Math.cos((a / 8) * Math.PI * 2) * 13, cz + Math.sin((a / 8) * Math.PI * 2) * 13, 'redondo');
        break;
      }
      const cerca = Math.max(0, 1 - Math.hypot(c.i - 4, c.k + 3) / 7);
      const partes = r.elegir([1, 2, 2, 4]);
      const m = 2;
      const g = 4;
      const rects: Array<[number, number, number, number]> =
        partes === 1 ? [[x0 + m, z0 + m, x1 - m, z1 - m]]
          : partes === 2 ? (r.azar(0.5) ? [[x0 + m, z0 + m, cx - g / 2, z1 - m], [cx + g / 2, z0 + m, x1 - m, z1 - m]] : [[x0 + m, z0 + m, x1 - m, cz - g / 2], [x0 + m, cz + g / 2, x1 - m, z1 - m]])
            : [[x0 + m, z0 + m, cx - g / 2, cz - g / 2], [cx + g / 2, z0 + m, x1 - m, cz - g / 2], [x0 + m, cz + g / 2, cx - g / 2, z1 - m], [cx + g / 2, cz + g / 2, x1 - m, z1 - m]];
      for (const [a, b, e, f] of rects) {
        const h = r.rango(22, 50) + cerca * r.rango(10, 45);
        poner(bloque('torre', (a + e) / 2, (b + f) / 2, e - a, f - b, h, r.elegir(PAREDES_TORRE)));
      }
      break;
    }
    case 'comercial': {
      // Edificios a lo largo de dos lados y un aparcamiento.
      const lados = r.azar(0.5) ? [0, 2] : [1, 3];
      for (const l of lados) {
        const n = r.entero(1, 2);
        const largo = (lado - 4 - (n - 1) * 3) / n;
        for (let j = 0; j < n; j++) {
          const fondo = r.rango(12, 16);
          const t = x0 + 2 + j * (largo + 3) + largo / 2;
          const h = r.rango(8, 22);
          const color = r.elegir(PAREDES_PISO);
          if (l === 0) poner(bloque('piso', t, z0 + 2 + fondo / 2, largo, fondo, h, color));
          if (l === 2) poner(bloque('piso', t, z1 - 2 - fondo / 2, largo, fondo, h, color));
          if (l === 1) poner(bloque('piso', x1 - 2 - fondo / 2, z0 + 2 + j * (largo + 3) + largo / 2, fondo, largo, h, color));
          if (l === 3) poner(bloque('piso', x0 + 2 + fondo / 2, z0 + 2 + j * (largo + 3) + largo / 2, fondo, largo, h, color));
        }
      }
      break;
    }
    case 'residencial':
    case 'barrio': {
      const n = distrito === 'barrio' ? 3 : 2;
      const paso = lado / n;
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
          const px = x0 + paso * (a + 0.5);
          const pz = z0 + paso * (b + 0.5);
          if (r.azar(0.12)) {
            arbol(px, pz, 'redondo');
            continue;
          }
          const w = distrito === 'barrio' ? r.rango(7, 9) : r.rango(9, 12);
          const d = distrito === 'barrio' ? r.rango(7, 9) : r.rango(8, 11);
          const h = distrito === 'barrio' ? r.rango(3.2, 4.5) : r.rango(4, 6.5);
          const casa = bloque('casa', px + r.rango(-1, 1), pz + r.rango(-1, 1), w, d, h, r.elegir(PAREDES_CASA));
          casa.techo = r.elegir(TECHOS);
          poner(casa);
          if (r.azar(0.6)) arbol(px + (paso / 2 - 2) * (r.azar(0.5) ? 1 : -1), pz + (paso / 2 - 2) * (r.azar(0.5) ? 1 : -1), r.azar(0.8) ? 'redondo' : 'pino');
        }
      }
      if (distrito === 'barrio') {
        // Muros bajos con grafitis entre las casas.
        poner(bloque('muro', cx, z0 + 0.5, lado * 0.6, 0.4, 1.6, 0xb08060));
      }
      break;
    }
    case 'industrial': {
      const w = r.rango(24, 32);
      const d = r.rango(16, 24);
      const nx = x0 + 2 + w / 2;
      const nz = r.azar(0.5) ? z0 + 2 + d / 2 : z1 - 2 - d / 2;
      poner(bloque('nave', nx, nz, w, d, r.rango(8, 12), r.elegir(NAVES)));
      // Contenedores apilados.
      const colores = [0xc0392b, 0x2e86c1, 0x27ae60, 0xd68910, 0x7d3c98];
      for (let j = 0; j < 4; j++) {
        const px = x1 - 5 - r.rango(0, 6);
        const pz = z0 + 4 + j * 8.5;
        const pisos = r.entero(1, 2);
        for (let p = 0; p < pisos; p++) poner(bloque('contenedor', px, pz, 2.5, 6.2, 2.6, r.elegir(colores), p * 2.6));
      }
      break;
    }
    case 'parque': {
      const n = r.entero(10, 18);
      for (let j = 0; j < n; j++) {
        const px = r.rango(x0 + 2, x1 - 2);
        const pz = r.rango(z0 + 2, z1 - 2);
        if (Math.abs(px - cx) < 3 || Math.abs(pz - cz) < 3) continue;
        arbol(px, pz, r.azar(0.75) ? 'redondo' : 'pino');
      }
      for (let j = 0; j < 4; j++) poner(bloque('banco', cx + [6, -6, 0, 0][j], cz + [0, 0, 6, -6][j], j < 2 ? 0.6 : 2, j < 2 ? 2 : 0.6, 0.5, 0x8d6e4a));
      break;
    }
    case 'campo': {
      if (r.azar(0.5)) {
        const casa = bloque('casa', cx - 6, cz - 6, 10, 8, 5, r.elegir(PAREDES_CASA));
        casa.techo = r.elegir(TECHOS);
        poner(casa);
        poner(bloque('nave', cx + 8, cz + 8, 12, 14, 7, 0xa93226));
      }
      const n = r.entero(3, 8);
      for (let j = 0; j < n; j++) arbol(r.rango(x0 + 2, x1 - 2), r.rango(z0 + 2, z1 - 2), r.azar(0.5) ? 'redondo' : 'pino');
      break;
    }
    case 'desierto': {
      if (r.azar(0.3)) {
        const casa = bloque('casa', cx + r.rango(-8, 8), cz + r.rango(-8, 8), 6, 6, 3, 0xd7b98e);
        casa.techo = 0x8d6e4a;
        poner(casa);
      }
      const n = r.entero(4, 9);
      for (let j = 0; j < n; j++) {
        const px = r.rango(x0 + 2, x1 - 2);
        const pz = r.rango(z0 + 2, z1 - 2);
        if (r.azar(0.25)) poner(bloque('muro', px, pz, r.rango(1, 2.5), r.rango(1, 2.5), r.rango(0.6, 1.4), 0xa1887f));
        else arbol(px, pz, r.azar(0.7) ? 'cactus' : 'palmera');
      }
      break;
    }
  }
}

const clave = (i: number, k: number) => (i + 32768) * 65536 + (k + 32768);

/** Ciudad con caché de celdas: implementa el mapa de la física. */
export class Ciudad implements Mapa {
  private celdas = new Map<number, Celda>();

  celda(i: number, k: number): Celda {
    const ck = clave(i, k);
    let c = this.celdas.get(ck);
    if (!c) {
      if (this.celdas.size > 900) {
        // Se olvidan las más antiguas (se pueden volver a generar iguales).
        let n = 0;
        for (const ck2 of this.celdas.keys()) {
          this.celdas.delete(ck2);
          if (++n >= 300) break;
        }
      }
      c = generarCelda(i, k);
      this.celdas.set(ck, c);
    }
    return c;
  }

  celdaEn(x: number, z: number): Celda {
    return this.celda(Math.floor(x / CELDA), Math.floor(z / CELDA));
  }

  bloquesEnArea(minX: number, minZ: number, maxX: number, maxZ: number, salida: Bloque[]): Bloque[] {
    salida.length = 0;
    const i0 = Math.floor(minX / CELDA);
    const i1 = Math.floor(maxX / CELDA);
    const k0 = Math.floor(minZ / CELDA);
    const k1 = Math.floor(maxZ / CELDA);
    for (let i = i0; i <= i1; i++) {
      for (let k = k0; k <= k1; k++) {
        for (const b of this.celda(i, k).bloques) {
          if (b.x + b.w / 2 < minX || b.x - b.w / 2 > maxX || b.z + b.d / 2 < minZ || b.z - b.d / 2 > maxZ) continue;
          salida.push(b);
        }
      }
    }
    return salida;
  }

  alturaSuelo(x: number, z: number): number {
    const ra = this.celdaEn(x, z).rampa;
    return ra ? alturaRampa(ra, x, z) : 0;
  }

  /** Distancia hasta el primer edificio o el suelo que cruza el rayo (recorre las celdas en orden). */
  rayo(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max = 150): number {
    let mejor = dy < 0 ? Math.min(max, -oy / dy) : max;
    let ci = Math.floor(ox / CELDA);
    let ck = Math.floor(oz / CELDA);
    const pasoI = dx > 0 ? 1 : -1;
    const pasoK = dz > 0 ? 1 : -1;
    const deltaI = Math.abs(dx) > 1e-9 ? CELDA / Math.abs(dx) : Infinity;
    const deltaK = Math.abs(dz) > 1e-9 ? CELDA / Math.abs(dz) : Infinity;
    let tI = Math.abs(dx) > 1e-9 ? ((ci + (dx > 0 ? 1 : 0)) * CELDA - ox) / dx : Infinity;
    let tK = Math.abs(dz) > 1e-9 ? ((ck + (dz > 0 ? 1 : 0)) * CELDA - oz) / dz : Infinity;
    for (let n = 0; n < 12; n++) {
      for (const b of this.celda(ci, ck).bloques) {
        const t = rayoCaja(ox, oy, oz, dx, dy, dz, b.x - b.w / 2, b.y0, b.z - b.d / 2, b.x + b.w / 2, b.y1, b.z + b.d / 2);
        if (t < mejor) mejor = t;
      }
      const salida = Math.min(tI, tK);
      if (mejor <= salida || salida > max) break;
      if (tI < tK) {
        ci += pasoI;
        tI += deltaI;
      } else {
        ck += pasoK;
        tK += deltaK;
      }
    }
    return mejor;
  }

  /** ¿Se ven dos puntos (sin edificios en medio)? */
  seVen(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-6) return true;
    return this.rayo(ax, ay, az, dx / l, dy / l, dz / l, l) >= l - 0.1;
  }

  /** Entrada del servicio más cercano de un tipo (busca en las zonas de alrededor). */
  servicioCercano(tipo: Servicio, x: number, z: number): Entrada & { distancia: number } {
    const si = Math.floor(x / CELDA / ZONA);
    const sk = Math.floor(z / CELDA / ZONA);
    let mejor: (Entrada & { distancia: number }) | null = null;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        for (const [idx, s] of serviciosDeZona(si + a, sk + b)) {
          if (s !== tipo) continue;
          const c = this.celda((si + a) * ZONA + (idx % ZONA), (sk + b) * ZONA + Math.floor(idx / ZONA));
          const e = c.entrada!;
          const dist = Math.hypot(e.x - x, e.z - z);
          if (!mejor || dist < mejor.distancia) mejor = { ...e, distancia: dist };
        }
      }
    }
    return mejor!;
  }
}

/** Altura de una rampa en un punto (0 fuera). */
export function alturaRampa(ra: Rampa, x: number, z: number): number {
  const fx = Math.sin(ra.yaw);
  const fz = Math.cos(ra.yaw);
  const dx = x - ra.x;
  const dz = z - ra.z;
  const u = dx * fx + dz * fz + ra.largo / 2;
  const v = dx * fz - dz * fx;
  if (u < 0 || u > ra.largo || Math.abs(v) > ra.ancho / 2) return 0;
  return (ra.alto * u) / ra.largo;
}

/** Punto de la línea de acera de una celda: lado 0..3 (sur, este, norte, oeste) y t en [0, 1]. */
export function puntoAcera(i: number, k: number, lado: number, t: number): { x: number; z: number } {
  const ox = i * CELDA;
  const oz = k * CELDA;
  const a = LINEA_ACERA;
  const largo = CELDA - 2 * a;
  switch (lado & 3) {
    case 0: return { x: ox + a + largo * t, z: oz + a };
    case 1: return { x: ox + CELDA - a, z: oz + a + largo * t };
    case 2: return { x: ox + CELDA - a - largo * t, z: oz + CELDA - a };
    default: return { x: ox + a, z: oz + CELDA - a - largo * t };
  }
}

/** Esquinas de la línea de acera de una celda (en orden, para pasear alrededor de la manzana). */
export function esquinaAcera(i: number, k: number, n: number): { x: number; z: number } {
  const a = LINEA_ACERA;
  const ox = i * CELDA;
  const oz = k * CELDA;
  switch (((n % 4) + 4) % 4) {
    case 0: return { x: ox + a, z: oz + a };
    case 1: return { x: ox + CELDA - a, z: oz + a };
    case 2: return { x: ox + CELDA - a, z: oz + CELDA - a };
    default: return { x: ox + a, z: oz + CELDA - a };
  }
}

/** Dirección de un carril: 0 = +x, 1 = +z, 2 = -x, 3 = -z. */
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;

/** Desplazamiento lateral del carril (se circula por la derecha). Derecha de (fx, fz) = (-fz, fx). */
export function desplazamientoCarril(dir: number): { x: number; z: number } {
  const [fx, fz] = DIRS[dir & 3];
  return { x: -fz * CARRIL, z: fx * CARRIL };
}
