import { ORDEN_ARMAS, type IdArma } from './core/armas';
import { DEFAULT_LOOK, LOOK_OPTIONS, type Look } from './game/look';
import { configPorDefecto, normalizarConfig, type Configuracion } from './settings';

/** Mejores persecuciones: más estrellas y, a igualdad, más tiempo buscado. */
export interface Record_ {
  nombre: string;
  estrellas: number;
  segundos: number;
  nivel: number;
  fecha: string;
}

export interface Estadisticas {
  sesiones: number;
  cochesRobados: number;
  /** Metros recorridos en coche y a pie. */
  distanciaCoche: number;
  distanciaPie: number;
  bajas: number;
  policias: number;
  muertes: number;
  arrestos: number;
  estrellasMax: number;
  persecucionMax: number;
  dineroGanado: number;
  dineroMax: number;
  cochesDestruidos: number;
}

const estadisticasNuevas = (): Estadisticas => ({
  sesiones: 0, cochesRobados: 0, distanciaCoche: 0, distanciaPie: 0, bajas: 0, policias: 0, muertes: 0, arrestos: 0,
  estrellasMax: 0, persecucionMax: 0, dineroGanado: 0, dineroMax: 0, cochesDestruidos: 0,
});

/** Habilidades como en San Andreas (0 a 100): suben con la práctica. */
export interface Habilidades {
  aguante: number;
  conduccion: number;
  punteria: number;
}

export interface Guardado {
  v: 1;
  nombre: string | null;
  dinero: number;
  respeto: number;
  /** Munición de cada arma que tienes (los puños y el bate no gastan: 1). */
  armas: Partial<Record<IdArma, number>>;
  chaleco: number;
  habilidades: Habilidades;
  /** Paquetes ocultos encontrados y saltos únicos hechos (por su id). */
  paquetes: string[];
  saltos: string[];
  hora: number;
  records: Record_[];
  estadisticas: Estadisticas;
  /** Apariencia del personaje (mismo sistema de personajes que el Arcade). */
  look: Look;
  config: Configuracion;
}

export const CLAVE_GUARDADO = 'mcl-city:v1';
const MAX_RECORDS = 10;

export const guardadoNuevo = (): Guardado => ({
  v: 1, nombre: null, dinero: 300, respeto: 0, armas: { punos: 1 }, chaleco: 0,
  habilidades: { aguante: 0, conduccion: 0, punteria: 0 }, paquetes: [], saltos: [], hora: 10, records: [],
  estadisticas: estadisticasNuevas(),
  look: { ...DEFAULT_LOOK, shirt: 0xffffff, hair: 'short', hairColor: 0x2b1d14, skin: 0x8d5524, hat: 'none', bottomColor: 0x37474f, accessory: 'none' } as Look,
  config: configPorDefecto(),
});

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const entero = (v: unknown, min: number, max: number, porDefecto: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : porDefecto;
const numero = (v: unknown, min: number, max: number, porDefecto: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : porDefecto;

function normalizarRecord(v: unknown): Record_ | null {
  if (!esObjeto(v) || typeof v.nombre !== 'string' || typeof v.fecha !== 'string') return null;
  return { nombre: v.nombre.slice(0, 20), estrellas: entero(v.estrellas, 1, 5, 1), segundos: entero(v.segundos, 0, 1e7, 0), nivel: entero(v.nivel, 1, 1e6, 1), fecha: v.fecha };
}

const comparar = (a: Record_, b: Record_) => b.estrellas - a.estrellas || b.segundos - a.segundos;

function normalizarEstadisticas(v: unknown): Estadisticas {
  const e = estadisticasNuevas();
  if (!esObjeto(v)) return e;
  for (const k of Object.keys(e) as Array<keyof Estadisticas>) e[k] = entero(v[k], 0, 1e12, 0);
  return e;
}

function normalizarArmas(v: unknown): Partial<Record<IdArma, number>> {
  const a: Partial<Record<IdArma, number>> = { punos: 1 };
  if (!esObjeto(v)) return a;
  for (const id of ORDEN_ARMAS) {
    const n = entero(v[id], 0, 99999, -1);
    if (n >= 0 && id !== 'punos') a[id] = n;
  }
  return a;
}

const listaTextos = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 30)))].slice(0, 5000) : []);

/** Cada rasgo debe ser una de las opciones conocidas; si no, se usa el de por defecto. */
export function normalizarLook(entrada: unknown, porDefecto: Look): Look {
  if (!esObjeto(entrada)) return { ...porDefecto };
  const look = { ...porDefecto } as Record<string, unknown>;
  for (const [clave, opciones] of Object.entries(LOOK_OPTIONS)) {
    const valor = entrada[clave];
    const validos = (opciones as readonly unknown[]).map((o) => (typeof o === 'object' && o ? (o as { id: string }).id : o));
    if (validos.includes(valor)) look[clave] = valor;
  }
  return look as unknown as Look;
}

/** Valida datos guardados: cualquier campo dañado vuelve a su valor por defecto. */
export function normalizarGuardado(entrada: unknown): Guardado {
  const base = guardadoNuevo();
  if (!esObjeto(entrada)) return base;
  const h = esObjeto(entrada.habilidades) ? entrada.habilidades : {};
  return {
    v: 1,
    nombre: typeof entrada.nombre === 'string' ? limpiarNombre(entrada.nombre) : null,
    dinero: entero(entrada.dinero, 0, 999999999, base.dinero),
    respeto: entero(entrada.respeto, 0, 1e9, 0),
    armas: normalizarArmas(entrada.armas),
    chaleco: entero(entrada.chaleco, 0, 100, 0),
    habilidades: { aguante: numero(h.aguante, 0, 100, 0), conduccion: numero(h.conduccion, 0, 100, 0), punteria: numero(h.punteria, 0, 100, 0) },
    paquetes: listaTextos(entrada.paquetes),
    saltos: listaTextos(entrada.saltos),
    hora: numero(entrada.hora, 0, 23.99, base.hora),
    records: Array.isArray(entrada.records)
      ? entrada.records.map(normalizarRecord).filter((r): r is Record_ => r !== null).sort(comparar).slice(0, MAX_RECORDS)
      : [],
    estadisticas: normalizarEstadisticas(entrada.estadisticas),
    look: normalizarLook(entrada.look, base.look),
    config: normalizarConfig(entrada.config),
  };
}

/** Anota una persecución (al perder las estrellas, morir o ser arrestado). Devuelve si entra en la tabla. */
export function anotarPersecucion(g: Guardado, r: Omit<Record_, 'fecha'>): boolean {
  if (r.estrellas < 1 || r.segundos < 5) return false;
  const e = g.estadisticas;
  e.estrellasMax = Math.max(e.estrellasMax, r.estrellas);
  e.persecucionMax = Math.max(e.persecucionMax, r.segundos);
  const rec: Record_ = { ...r, fecha: new Date().toISOString().slice(0, 10) };
  g.records.push(rec);
  g.records.sort(comparar);
  g.records = g.records.slice(0, MAX_RECORDS);
  return g.records.includes(rec);
}

/** Nombre del jugador: 1 a 20 caracteres; letras, espacios, punto, apóstrofo y guion. */
export function limpiarNombre(texto: string): string | null {
  const limpio = texto.replace(/\s+/g, ' ').trim().slice(0, 20);
  return /^[\p{L}\p{M}\d .'-]{1,20}$/u.test(limpio) ? limpio : null;
}

function almacenSeguro(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function cargar(almacen: Pick<Storage, 'getItem'> | null = almacenSeguro()): Guardado {
  try {
    const texto = almacen?.getItem(CLAVE_GUARDADO);
    return texto ? normalizarGuardado(JSON.parse(texto)) : guardadoNuevo();
  } catch {
    return guardadoNuevo();
  }
}

export function guardar(g: Guardado, almacen: Pick<Storage, 'setItem'> | null = almacenSeguro()): void {
  try {
    almacen?.setItem(CLAVE_GUARDADO, JSON.stringify(g));
  } catch {
    // Sin almacenamiento (ventana privada o bloqueado): el juego sigue en memoria.
  }
}
