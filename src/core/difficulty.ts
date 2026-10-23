export type Dificultad = 'muyFacil' | 'facil' | 'normal' | 'desafio';

export interface Modo {
  nombre: string;
  /** Multiplicador del daño que recibes. */
  dano: number;
  /** Multiplicador del calor de los delitos (estrellas). */
  calor: number;
  /** Multiplicador de la puntería de la policía y las bandas. */
  punteria: number;
  /** Multiplicador de las unidades de policía. */
  policia: number;
  /** Multiplicador del dinero que ganas. */
  dinero: number;
}

export const MODOS: Record<Dificultad, Modo> = {
  muyFacil: { nombre: 'Muy fácil', dano: 0.4, calor: 0.5, punteria: 0.5, policia: 0.6, dinero: 1.5 },
  facil: { nombre: 'Fácil', dano: 0.7, calor: 0.75, punteria: 0.75, policia: 0.8, dinero: 1.2 },
  normal: { nombre: 'Normal', dano: 1, calor: 1, punteria: 1, policia: 1, dinero: 1 },
  desafio: { nombre: 'Desafío', dano: 1.4, calor: 1.3, punteria: 1.25, policia: 1.3, dinero: 0.85 },
};

export const DIFICULTADES = Object.keys(MODOS) as Dificultad[];
