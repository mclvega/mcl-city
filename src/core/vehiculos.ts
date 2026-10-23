/** Tipos de coche y física arcade (sin three.js: se puede probar). Adelante = (sin yaw, cos yaw); derecha = (-cos yaw, sin yaw). */

export type IdVehiculo = 'compacto' | 'sedan' | 'deportivo' | 'todoterreno' | 'taxi' | 'furgoneta' | 'patrulla';

export interface DatosVehiculo {
  nombre: string;
  largo: number;
  ancho: number;
  alto: number;
  /** Velocidad máxima en m/s. */
  velMax: number;
  /** Aceleración en m/s². */
  acel: number;
  freno: number;
  /** Giro máximo en rad/s. */
  giro: number;
  /** Agarre lateral (más = derrapa menos). */
  agarre: number;
  masa: number;
  vida: number;
  colores: number[];
  /** Peso al elegir el tráfico al azar. */
  frecuencia: number;
}

export const VEHICULOS: Record<IdVehiculo, DatosVehiculo> = {
  compacto: { nombre: 'Compacto', largo: 3.8, ancho: 1.75, alto: 1.45, velMax: 34, acel: 7.5, freno: 18, giro: 2.3, agarre: 9, masa: 900, vida: 700, colores: [0xe53935, 0x43a047, 0xfdd835, 0x1e88e5, 0xffffff, 0xff7043, 0x8e24aa], frecuencia: 3 },
  sedan: { nombre: 'Sedán', largo: 4.6, ancho: 1.9, alto: 1.45, velMax: 40, acel: 8.5, freno: 18, giro: 2.0, agarre: 8.5, masa: 1300, vida: 850, colores: [0x37474f, 0x90a4ae, 0x1a237e, 0x6d4c41, 0xffffff, 0x212121, 0x880e4f], frecuencia: 4 },
  deportivo: { nombre: 'Deportivo', largo: 4.4, ancho: 1.95, alto: 1.15, velMax: 58, acel: 14, freno: 24, giro: 2.2, agarre: 10, masa: 1200, vida: 650, colores: [0xd50000, 0xffd600, 0x212121, 0x2962ff, 0xff6d00, 0xffffff], frecuencia: 1 },
  todoterreno: { nombre: 'Todoterreno', largo: 4.8, ancho: 2.05, alto: 1.9, velMax: 38, acel: 8, freno: 16, giro: 1.8, agarre: 8, masa: 2000, vida: 1200, colores: [0x2e7d32, 0x5d4037, 0x263238, 0xbdbdbd, 0xb71c1c, 0x0d47a1], frecuencia: 2 },
  taxi: { nombre: 'Taxi', largo: 4.6, ancho: 1.9, alto: 1.5, velMax: 40, acel: 8.5, freno: 18, giro: 2.0, agarre: 8.5, masa: 1300, vida: 850, colores: [0xffc107], frecuencia: 1.5 },
  furgoneta: { nombre: 'Furgoneta', largo: 5.2, ancho: 2.1, alto: 2.3, velMax: 30, acel: 5.5, freno: 14, giro: 1.6, agarre: 7.5, masa: 2400, vida: 1300, colores: [0xffffff, 0x90a4ae, 0x1565c0, 0x795548, 0xc62828], frecuencia: 1.5 },
  patrulla: { nombre: 'Patrulla', largo: 4.7, ancho: 1.95, alto: 1.5, velMax: 48, acel: 11, freno: 22, giro: 2.1, agarre: 9.5, masa: 1500, vida: 1100, colores: [0x111111], frecuencia: 0 },
};

export const IDS_VEHICULO = Object.keys(VEHICULOS) as IdVehiculo[];

export interface EstadoVehiculo {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  /** Velocidad de giro (rad/s). */
  w: number;
  /** Ángulo de las ruedas delanteras (para el dibujo). */
  ruedas: number;
  enAire: boolean;
}

export interface MandosVehiculo {
  acelerar: number;
  frenar: number;
  /** -1 izquierda, +1 derecha. */
  giro: number;
  mano: boolean;
}

export const mandosVacios = (): MandosVehiculo => ({ acelerar: 0, frenar: 0, giro: 0, mano: false });

export const GRAVEDAD = 15;

/** Velocidad hacia delante (negativa marcha atrás). */
export function velocidadAdelante(v: EstadoVehiculo): number {
  return v.vx * Math.sin(v.yaw) + v.vz * Math.cos(v.yaw);
}

/**
 * Un paso de la física del coche. `habilidad` (0 a 1) es la habilidad de conducción: más giro y agarre.
 * `suelo` es la altura del suelo bajo el coche (rampas).
 */
export function pasoVehiculo(v: EstadoVehiculo, d: DatosVehiculo, m: MandosVehiculo, dt: number, suelo = 0, habilidad = 0): void {
  if (!v.enAire) {
    const fx0 = Math.sin(v.yaw);
    const fz0 = Math.cos(v.yaw);
    const vf0 = v.vx * fx0 + v.vz * fz0;
    // Giro: depende de la velocidad (parado no gira; muy rápido gira menos) y del sentido de la marcha.
    const factor = Math.min(1, Math.abs(vf0) / 5) * (1 - 0.45 * Math.min(1, Math.abs(vf0) / d.velMax));
    const objetivo = -m.giro * d.giro * (1 + habilidad * 0.15) * factor * Math.sign(vf0 || 1) * (m.mano ? 1.4 : 1);
    v.w += (objetivo - v.w) * Math.min(1, dt * 10);
    v.yaw += v.w * dt;
  } else {
    v.w *= 1 - Math.min(1, dt * 0.5);
    v.yaw += v.w * dt;
  }
  v.ruedas += (m.giro * 0.5 - v.ruedas) * Math.min(1, dt * 12);

  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  const rx = -fz;
  const rz = fx;
  let vf = v.vx * fx + v.vz * fz;
  let vl = v.vx * rx + v.vz * rz;

  if (!v.enAire) {
    if (m.acelerar > 0) {
      if (vf < -0.5) vf += d.freno * m.acelerar * dt;
      else vf += d.acel * m.acelerar * Math.max(0, 1 - (vf / d.velMax) ** 2) * dt;
    }
    if (m.frenar > 0) {
      if (vf > 0.5) vf -= d.freno * m.frenar * dt;
      else vf = Math.max(-d.velMax * 0.3, vf - d.acel * 0.6 * m.frenar * dt);
    }
    // Rozamiento: casi nada acelerando (la curva de aceleración ya limita) y más al soltar.
    vf -= vf * (m.acelerar > 0 ? 0.01 : 0.12 + Math.abs(vf) * 0.002) * dt;
    if (m.acelerar === 0 && m.frenar === 0 && Math.abs(vf) < 0.4) vf = 0;
    if (m.mano) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 7 * dt);
    const agarre = d.agarre * (1 + habilidad * 0.2) * (m.mano ? 0.18 : 1);
    vl *= Math.exp(-agarre * dt);
  } else {
    vf -= vf * 0.02 * dt;
  }
  v.vx = fx * vf + rx * vl;
  v.vz = fz * vf + rz * vl;
  v.x += v.vx * dt;
  v.z += v.vz * dt;

  // Altura: sigue el suelo (las rampas dan velocidad vertical) y despega si el suelo cae de golpe.
  if (!v.enAire) {
    if (suelo >= v.y - 0.3) {
      v.vy = (suelo - v.y) / dt;
      v.y = suelo;
      if (suelo <= 0.001) v.vy = 0;
    } else {
      v.enAire = true;
    }
  }
  if (v.enAire) {
    v.vy -= GRAVEDAD * dt;
    v.y += v.vy * dt;
    if (v.y <= suelo) {
      v.y = suelo;
      v.vy = 0;
      v.enAire = false;
    }
  }
}

/** Círculos que aproximan la forma del coche para los choques (delante, centro y detrás). */
export function circulosVehiculo(v: { x: number; z: number; yaw: number }, d: DatosVehiculo): Array<{ x: number; z: number; r: number }> {
  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  const r = d.ancho / 2;
  const o = d.largo / 2 - r;
  return [
    { x: v.x + fx * o, z: v.z + fz * o, r },
    { x: v.x, z: v.z, r },
    { x: v.x - fx * o, z: v.z - fz * o, r },
  ];
}

/** Elige un tipo de coche del tráfico al azar según su frecuencia. */
export function tipoTrafico(aleatorio: number): IdVehiculo {
  const total = IDS_VEHICULO.reduce((s, id) => s + VEHICULOS[id].frecuencia, 0);
  let x = aleatorio * total;
  for (const id of IDS_VEHICULO) {
    x -= VEHICULOS[id].frecuencia;
    if (x < 0) return id;
  }
  return 'sedan';
}
