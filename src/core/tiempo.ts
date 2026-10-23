/** Ciclo de día y noche: la hora va de 0 a 24 (1 minuto del juego = 1 segundo real). */

export function avanzarHora(hora: number, dt: number): number {
  return (hora + dt / 60) % 24;
}

/** Luz del día de 0 (noche cerrada) a 1 (mediodía), con amanecer de 5 a 8 y atardecer de 18 a 21. */
export function luzDelDia(hora: number): number {
  if (hora >= 8 && hora <= 18) return 1;
  if (hora <= 5 || hora >= 21) return 0;
  const t = hora < 12 ? (hora - 5) / 3 : (21 - hora) / 3;
  return t * t * (3 - 2 * t);
}

/** ¿Es de noche (farolas y faros encendidos)? */
export const esDeNoche = (hora: number) => luzDelDia(hora) < 0.35;

export function textoHora(hora: number): string {
  const h = Math.floor(hora);
  const m = Math.floor((hora - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
