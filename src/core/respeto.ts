/** Nivel de respeto: no tiene tope. Cada nivel endurece la ciudad y desbloquea armas. */

/** Respeto total para llegar al nivel n (el nivel 1 es el inicial). */
export function respetoParaNivel(n: number): number {
  const m = Math.max(0, n - 1);
  return Math.round(120 * m + 40 * m * m);
}

export function nivelDe(respeto: number): number {
  let n = 1;
  while (respetoParaNivel(n + 1) <= respeto) n++;
  return n;
}

export function progresoNivel(respeto: number): { nivel: number; fraccion: number; falta: number } {
  const nivel = nivelDe(respeto);
  const a = respetoParaNivel(nivel);
  const b = respetoParaNivel(nivel + 1);
  return { nivel, fraccion: (respeto - a) / (b - a), falta: b - respeto };
}

/** Cómo se endurece la ciudad con el nivel. */
export function escalaNivel(n: number) {
  const m = Math.max(0, n - 1);
  return {
    /** Vida de policías y bandas. */
    vida: 1 + m * 0.1,
    /** Probabilidad base de acierto de la policía. */
    punteria: Math.min(0.85, 0.3 + m * 0.035),
    /** Unidades de policía por estrella. */
    unidades: 1 + Math.min(1.5, m * 0.08),
    /** La banda rival ataca nada más verte. */
    bandaHostil: n >= 3,
  };
}

/** Respeto por cada hazaña. */
export const PREMIOS = {
  escapar: (estrellas: number) => Math.round(25 * estrellas ** 1.6),
  paquete: 60,
  salto: 40,
  banda: 10,
  /** Dinero de regalo al subir de nivel. */
  dineroNivel: (n: number) => 200 * n,
};
