/** Armas: cuerpo a cuerpo y de fuego. La armería las desbloquea según el nivel de respeto. */

export type IdArma = 'punos' | 'bate' | 'pistola' | 'escopeta' | 'subfusil' | 'fusil' | 'lanzacohetes';

export interface DatosArma {
  nombre: string;
  icono: string;
  cuerpo: boolean;
  dano: number;
  /** Segundos entre ataques. */
  cadencia: number;
  alcance: number;
  /** Dispersión en radianes. */
  dispersion: number;
  perdigones: number;
  cargador: number;
  recarga: number;
  automatica: boolean;
  precio: number;
  precioMunicion: number;
  paquete: number;
  /** Nivel de respeto con el que aparece en la armería. */
  nivel: number;
}

export const ARMAS: Record<IdArma, DatosArma> = {
  punos: { nombre: 'Puños', icono: '👊', cuerpo: true, dano: 9, cadencia: 0.38, alcance: 1.6, dispersion: 0, perdigones: 1, cargador: 0, recarga: 0, automatica: false, precio: 0, precioMunicion: 0, paquete: 0, nivel: 1 },
  bate: { nombre: 'Bate', icono: '🏏', cuerpo: true, dano: 24, cadencia: 0.6, alcance: 2.1, dispersion: 0, perdigones: 1, cargador: 0, recarga: 0, automatica: false, precio: 60, precioMunicion: 0, paquete: 0, nivel: 1 },
  pistola: { nombre: 'Pistola', icono: '🔫', cuerpo: false, dano: 22, cadencia: 0.3, alcance: 55, dispersion: 0.035, perdigones: 1, cargador: 17, recarga: 1.2, automatica: false, precio: 250, precioMunicion: 60, paquete: 34, nivel: 1 },
  escopeta: { nombre: 'Escopeta', icono: '💥', cuerpo: false, dano: 11, cadencia: 0.9, alcance: 28, dispersion: 0.09, perdigones: 8, cargador: 6, recarga: 2.2, automatica: false, precio: 700, precioMunicion: 90, paquete: 18, nivel: 2 },
  subfusil: { nombre: 'Subfusil', icono: '🔫', cuerpo: false, dano: 15, cadencia: 0.085, alcance: 45, dispersion: 0.06, perdigones: 1, cargador: 50, recarga: 1.6, automatica: true, precio: 1200, precioMunicion: 120, paquete: 100, nivel: 3 },
  fusil: { nombre: 'Fusil', icono: '🎯', cuerpo: false, dano: 30, cadencia: 0.14, alcance: 90, dispersion: 0.025, perdigones: 1, cargador: 30, recarga: 2, automatica: true, precio: 3000, precioMunicion: 200, paquete: 90, nivel: 5 },
  lanzacohetes: { nombre: 'Lanzacohetes', icono: '🚀', cuerpo: false, dano: 300, cadencia: 1.4, alcance: 120, dispersion: 0.01, perdigones: 1, cargador: 1, recarga: 1.6, automatica: false, precio: 9000, precioMunicion: 800, paquete: 4, nivel: 8 },
};

export const ORDEN_ARMAS = Object.keys(ARMAS) as IdArma[];

/** Dispersión real según la puntería (0 a 1): con práctica se apunta mejor. */
export const dispersionCon = (arma: IdArma, punteria: number) => ARMAS[arma].dispersion * (1 - punteria * 0.5);
