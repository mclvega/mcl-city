/**
 * Física sencilla de la ciudad: cuerpos cilíndricos contra bloques alineados a los ejes.
 * El mapa da los bloques cercanos por celdas. Unidades en metros; el suelo está en y = 0 (las rampas lo levantan).
 */

export type TipoBloque = 'torre' | 'piso' | 'casa' | 'nave' | 'servicio' | 'poste' | 'tronco' | 'contenedor' | 'muro' | 'banco';

export interface Bloque {
  /** Centro en el plano y medidas. */
  x: number;
  z: number;
  w: number;
  d: number;
  /** Altura de la base y de la cima. */
  y0: number;
  y1: number;
  tipo: TipoBloque;
  /** Color o estilo (para el dibujo). */
  color: number;
  /** Color del tejado a dos aguas (casas). */
  techo?: number;
}

export function bloque(tipo: TipoBloque, x: number, z: number, w: number, d: number, h: number, color = 0xffffff, y0 = 0): Bloque {
  return { tipo, x, z, w, d, y0, y1: y0 + h, color };
}

export interface Mapa {
  /** Rellena `salida` con los bloques que tocan el rectángulo y la devuelve. */
  bloquesEnArea(minX: number, minZ: number, maxX: number, maxZ: number, salida: Bloque[]): Bloque[];
  /** Altura del suelo (rampas) en un punto. */
  alturaSuelo(x: number, z: number): number;
}

export interface Cuerpo {
  x: number;
  y: number;
  z: number;
  vy: number;
  radio: number;
  alto: number;
  enSuelo: boolean;
}

const PASO_MAXIMO = 0.5;
const tmp: Bloque[] = [];

/** Mueve un cuerpo cilíndrico por el plano y lo saca de los bloques; sube solo escalones bajos. Devuelve si chocó. */
export function moverCuerpo(c: Cuerpo, dx: number, dz: number, dt: number, mapa: Mapa, gravedad = 22): boolean {
  const px0 = c.x;
  const pz0 = c.z;
  c.x += dx;
  c.z += dz;
  let choco = false;
  const r = c.radio;
  const bloques = mapa.bloquesEnArea(c.x - r - 0.5, c.z - r - 0.5, c.x + r + 0.5, c.z + r + 0.5, tmp);
  for (const bl of bloques) {
    if (c.y >= bl.y1 - 0.01 || c.y + c.alto <= bl.y0) continue;
    const px = Math.max(bl.x - bl.w / 2, Math.min(c.x, bl.x + bl.w / 2));
    const pz = Math.max(bl.z - bl.d / 2, Math.min(c.z, bl.z + bl.d / 2));
    const ex = c.x - px;
    const ez = c.z - pz;
    const dist2 = ex * ex + ez * ez;
    if (dist2 >= r * r) continue;
    if (bl.y1 - c.y <= PASO_MAXIMO && c.enSuelo) {
      c.y = bl.y1;
      continue;
    }
    choco = true;
    if (dist2 > 1e-8) {
      const dist = Math.sqrt(dist2);
      c.x = px + (ex / dist) * r;
      c.z = pz + (ez / dist) * r;
    } else {
      // El centro quedó dentro: salir por el lado más cercano.
      const sx = bl.w / 2 - Math.abs(c.x - bl.x) + r;
      const sz = bl.d / 2 - Math.abs(c.z - bl.z) + r;
      if (sx < sz) c.x += Math.sign(c.x - bl.x || 1) * sx;
      else c.z += Math.sign(c.z - bl.z || 1) * sz;
    }
  }

  // Rampas: si el suelo sube de golpe más que un escalón, es una pared.
  let sueloRampa = mapa.alturaSuelo(c.x, c.z);
  if (sueloRampa > c.y + PASO_MAXIMO + 0.05 && c.vy <= 0.1) {
    c.x = px0;
    c.z = pz0;
    sueloRampa = mapa.alturaSuelo(c.x, c.z);
    choco = true;
  }

  // Gravedad y suelo: la cima más alta que hay debajo.
  c.vy -= gravedad * dt;
  let nuevaY = c.y + c.vy * dt;
  let suelo = sueloRampa;
  let techo = Infinity;
  for (const bl of mapa.bloquesEnArea(c.x - r, c.z - r, c.x + r, c.z + r, tmp)) {
    if (Math.abs(c.x - bl.x) > bl.w / 2 + r * 0.5 || Math.abs(c.z - bl.z) > bl.d / 2 + r * 0.5) continue;
    if (bl.y1 <= c.y + 0.01) suelo = Math.max(suelo, bl.y1);
    else if (bl.y0 >= c.y + c.alto - 0.01) techo = Math.min(techo, bl.y0);
  }
  if (nuevaY + c.alto > techo) {
    nuevaY = techo - c.alto;
    c.vy = Math.min(0, c.vy);
  }
  // Pegado al suelo al bajar una rampa andando (sin despegar por cada escalón).
  if (c.enSuelo && c.vy <= 0 && nuevaY > suelo && nuevaY - suelo < 0.35) nuevaY = suelo;
  c.enSuelo = nuevaY <= suelo;
  if (c.enSuelo) {
    nuevaY = suelo;
    c.vy = 0;
  }
  c.y = nuevaY;
  return choco;
}

let t0 = 0;
let t1 = Infinity;
/** Recorta el intervalo [t0, t1] del rayo con una franja de un eje. */
function eje(o: number, d: number, mn: number, mx: number): boolean {
  if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
  let a = (mn - o) / d;
  let b = (mx - o) / d;
  if (a > b) {
    const c = a;
    a = b;
    b = c;
  }
  if (a > t0) t0 = a;
  if (b < t1) t1 = b;
  return t0 <= t1;
}

/** Distancia a la que un rayo entra en una caja alineada con los ejes (o Infinity si no la toca). */
export function rayoCaja(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
): number {
  t0 = 0;
  t1 = Infinity;
  if (!eje(ox, dx, minX, maxX) || !eje(oy, dy, minY, maxY) || !eje(oz, dz, minZ, maxZ)) return Infinity;
  return t0;
}

/** Distancia a la que un rayo toca un cilindro vertical (personas). */
export function rayoCilindro(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, radio: number, alto: number): number {
  const fx = ox - cx;
  const fz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return Infinity;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radio * radio;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const raiz = Math.sqrt(disc);
  let t = (-b - raiz) / (2 * a);
  if (t < 0) t = (-b + raiz) / (2 * a);
  if (t < 0) return Infinity;
  const y = oy + dy * t;
  return y >= cy && y <= cy + alto ? t : Infinity;
}

/** Rayo contra una caja orientada (coches): se pasa al espacio local de la caja. */
export function rayoCajaGirada(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  cx: number, cy: number, cz: number, yaw: number, mitadAncho: number, alto: number, mitadLargo: number,
): number {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // Local: x = derecha del modelo (-cos, sin), z = adelante (sin, cos).
  const rx = ox - cx;
  const rz = oz - cz;
  const lx = rx * c - rz * s;
  const lz = rx * s + rz * c;
  const ldx = dx * c - dz * s;
  const ldz = dx * s + dz * c;
  return rayoCaja(lx, oy, lz, ldx, dy, ldz, -mitadAncho, cy, -mitadLargo, mitadAncho, cy + alto, mitadLargo);
}
