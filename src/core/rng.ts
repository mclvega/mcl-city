/** Generador pseudoaleatorio con semilla (mulberry32): la misma semilla da el mismo resultado. */
export function crearRng(semilla: number) {
  let s = semilla >>> 0;
  const siguiente = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    siguiente,
    rango: (min: number, max: number) => min + siguiente() * (max - min),
    entero: (min: number, max: number) => Math.floor(min + siguiente() * (max - min + 1)),
    elegir: <T>(lista: readonly T[]): T => lista[Math.floor(siguiente() * lista.length)],
    azar: (p: number) => siguiente() < p,
  };
}

export type Rng = ReturnType<typeof crearRng>;

/** Hash entero de dos coordenadas y una semilla (para generar el mundo por celdas). */
export function hash2(i: number, k: number, semilla = 0): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(k | 0, 0x165667b1) ^ Math.imul(semilla | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

const valor = (i: number, k: number, s: number) => hash2(i, k, s) / 4294967296;
const suave = (t: number) => t * t * (3 - 2 * t);

/** Ruido de valor 2D en [0, 1), continuo, para repartir distritos. */
export function ruido(x: number, z: number, semilla = 0): number {
  const i = Math.floor(x);
  const k = Math.floor(z);
  const fx = suave(x - i);
  const fz = suave(z - k);
  const a = valor(i, k, semilla);
  const b = valor(i + 1, k, semilla);
  const c = valor(i, k + 1, semilla);
  const d = valor(i + 1, k + 1, semilla);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
