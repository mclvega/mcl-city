/** Nivel de búsqueda: los delitos suman «calor» y el calor da las estrellas (0 a 5). */

export type Delito =
  | 'robarCoche' | 'golpear' | 'atropellar' | 'matarCivil' | 'disparar' | 'golpearPolicia'
  | 'matarPolicia' | 'destruirCoche' | 'destruirPatrulla' | 'atraco' | 'helicoptero';

export const DELITOS: Record<Delito, number> = {
  robarCoche: 25, golpear: 12, atropellar: 25, matarCivil: 45, disparar: 4, golpearPolicia: 60,
  matarPolicia: 140, destruirCoche: 30, destruirPatrulla: 180, atraco: 90, helicoptero: 450,
};

/** Calor mínimo para cada número de estrellas. */
export const UMBRALES = [0, 1, 80, 220, 480, 950];
export const MAX_ESTRELLAS = 5;

export interface Buscado {
  calor: number;
  /** Segundos sin que la policía te vea. */
  sinVer: number;
}

export const buscadoNuevo = (): Buscado => ({ calor: 0, sinVer: 0 });

export function estrellasDe(calor: number): number {
  let e = 0;
  for (let i = 1; i < UMBRALES.length; i++) if (calor >= UMBRALES[i]) e = i;
  return e;
}

/** Suma un delito (con el multiplicador de la dificultad). Devuelve las estrellas nuevas. */
export function sumarDelito(b: Buscado, delito: Delito, mult = 1): number {
  b.calor = Math.min(UMBRALES[MAX_ESTRELLAS] + 400, b.calor + DELITOS[delito] * mult);
  b.sinVer = 0;
  return estrellasDe(b.calor);
}

/** Segundos sin ser visto para perder una estrella. */
export const tiempoParaPerder = (estrellas: number) => 8 + estrellas * 4;

/** Avanza el tiempo: si nadie te ve el rato suficiente, pierdes una estrella. Devuelve true si se perdió. */
export function actualizarBuscado(b: Buscado, dt: number, visto: boolean): boolean {
  const e = estrellasDe(b.calor);
  if (e === 0) {
    b.sinVer = 0;
    return false;
  }
  b.sinVer = visto ? 0 : b.sinVer + dt;
  if (b.sinVer < tiempoParaPerder(e)) return false;
  b.calor = e > 1 ? UMBRALES[e - 1] : 0;
  b.sinVer = 0;
  return true;
}

export function borrarBuscado(b: Buscado): void {
  b.calor = 0;
  b.sinVer = 0;
}
