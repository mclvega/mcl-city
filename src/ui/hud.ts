import { ARMAS } from '../core/armas';
import { CELDA, DISTRITOS, SERVICIOS, ZONA, serviciosDeZona, type Servicio } from '../core/ciudad';
import { MAX_ESTRELLAS } from '../core/buscado';
import { textoHora } from '../core/tiempo';
import type { Partida } from '../game/logica';

/** HUD del juego en el lienzo 2D: estado arriba a la derecha, radar, mensajes y mira. */

export interface OpcionesHud {
  tactil: boolean;
  /** 0 a 1: destello rojo al recibir daño. */
  dano: number;
  radio: string;
  radioT: number;
  proyectar: ((x: number, y: number, z: number) => { x: number; y: number; visible: boolean }) | null;
}

const FUENTE = '"Arial Black", "Segoe UI Black", system-ui, sans-serif';

function texto(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, color: string, tam: number, alin: CanvasTextAlign = 'left', borde = 4) {
  ctx.font = `900 ${tam}px ${FUENTE}`;
  ctx.textAlign = alin;
  ctx.lineJoin = 'round';
  ctx.lineWidth = borde;
  ctx.strokeStyle = '#000';
  ctx.strokeText(t, x, y);
  ctx.fillStyle = color;
  ctx.fillText(t, x, y);
}

function barra(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, valor: number, color: string, fondo: string) {
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = fondo;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, valor)), h);
}

function estrella(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, llena: boolean) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000';
  ctx.stroke();
  ctx.fillStyle = llena ? '#f2c94c' : 'rgba(40,40,40,0.75)';
  ctx.fill();
}

const COLOR_SERVICIO: Record<Servicio, string> = { hospital: '#e53935', policia: '#1e63d6', armeria: '#7cb342', comida: '#fb8c00', taller: '#ec407a', casa: '#43a047' };

/** Radar circular orientado con la cámara. */
function radar(ctx: CanvasRenderingContext2D, p: Partida, cx: number, cy: number, r: number) {
  const pos = p.posJugador();
  const enCoche = !!p.jugador.coche;
  const metros = enCoche ? 170 : 115;
  const k = r / metros;
  const cos = Math.cos(p.camYaw);
  const sin = Math.sin(p.camYaw);
  const aPantalla = (x: number, z: number) => {
    const dx = x - pos.x;
    const dz = z - pos.z;
    return { x: cx + k * (-cos * dx + sin * dz), y: cy + k * (-sin * dx - cos * dz) };
  };
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,24,20,0.82)';
  ctx.fill();
  ctx.clip();
  // Mapa en coordenadas del mundo, girado con la cámara.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.transform(-k * cos, -k * sin, k * sin, -k * cos, 0, 0);
  ctx.translate(-pos.x, -pos.z);
  const i0 = Math.floor((pos.x - metros * 1.5) / CELDA);
  const i1 = Math.floor((pos.x + metros * 1.5) / CELDA);
  const k0 = Math.floor((pos.z - metros * 1.5) / CELDA);
  const k1 = Math.floor((pos.z + metros * 1.5) / CELDA);
  ctx.fillStyle = '#4a4a4f';
  ctx.fillRect(i0 * CELDA, k0 * CELDA, (i1 - i0 + 1) * CELDA, (k1 - k0 + 1) * CELDA);
  for (let i = i0; i <= i1; i++) {
    for (let kk = k0; kk <= k1; kk++) {
      const c = p.ciudad.celda(i, kk);
      const suelo = DISTRITOS[c.distrito].suelo;
      ctx.fillStyle = `#${suelo.toString(16).padStart(6, '0')}`;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(i * CELDA + 6, kk * CELDA + 6, CELDA - 12, CELDA - 12);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (const b of c.bloques) {
        if (b.y1 < 2.5 || b.tipo === 'poste' || b.tipo === 'tronco') continue;
        ctx.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d);
      }
    }
  }
  ctx.restore();

  // Iconos de servicios (los de casa, hospital y comisaría quedan en el borde si están lejos).
  const si = Math.floor(pos.x / CELDA / ZONA);
  const sk = Math.floor(pos.z / CELDA / ZONA);
  const iconos: Array<{ x: number; y: number; s: Servicio; borde: boolean }> = [];
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      for (const [idx, s] of serviciosDeZona(si + a, sk + b)) {
        const c = p.ciudad.celda((si + a) * ZONA + (idx % ZONA), (sk + b) * ZONA + Math.floor(idx / ZONA));
        const e = c.entrada;
        if (!e) continue;
        const pt = aPantalla(e.x, e.z);
        const d = Math.hypot(pt.x - cx, pt.y - cy);
        if (d > r - 8) {
          if (s !== 'casa') continue;
          pt.x = cx + ((pt.x - cx) / d) * (r - 9);
          pt.y = cy + ((pt.y - cy) / d) * (r - 9);
        }
        iconos.push({ ...pt, s, borde: d > r - 8 });
      }
    }
  }
  ctx.restore();
  ctx.save();
  for (const ic of iconos) {
    ctx.beginPath();
    ctx.arc(ic.x, ic.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_SERVICIO[ic.s];
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(SERVICIOS[ic.s].icono, ic.x, ic.y + 0.5);
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  // Policía, helicóptero, bandas rivales y paquetes cercanos.
  const destello = Math.floor(p.tiempo * 4) % 2 === 0;
  const punto = (x: number, z: number, color: string, tam = 3.5) => {
    const pt = aPantalla(x, z);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, tam, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    ctx.stroke();
  };
  for (const v of p.vehiculos) if (v.tipo === 'patrulla' && !v.destruido && v.conductor?.tipo === 'policia') punto(v.x, v.z, destello ? '#ff3b3b' : '#3b7bff', 4);
  for (const o of p.personas) {
    if (o.estado === 'muerto' || o.estado === 'coche') continue;
    if (o.tipo === 'policia' && p.estrellas > 0) punto(o.cuerpo.x, o.cuerpo.z, '#7fb0ff', 2.5);
    else if (o.tipo === 'rival' && o.ia.modo === 'atacar') punto(o.cuerpo.x, o.cuerpo.z, '#c45bff', 2.5);
    else if (o.tipo === 'banda') punto(o.cuerpo.x, o.cuerpo.z, '#4fd06a', 2.5);
  }
  const h = p.helicoptero;
  if (h && !h.destruido) punto(h.x, h.z, destello ? '#ffffff' : '#3b7bff', 5);
  const celda = p.ciudad.celdaEn(pos.x, pos.z);
  const pq = celda.paquete;
  if (pq && !p.g.paquetes.includes(pq.id) && Math.hypot(pq.x - pos.x, pq.z - pos.z) < 45) punto(pq.x, pq.z, '#2ecc71', 3.5);
  ctx.restore();

  // Jugador: flecha en el centro.
  const yaw = p.jugador.coche ? p.jugador.coche.yaw : p.jugador.yaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const ang = Math.atan2(-sin * fx - cos * fz, -cos * fx + sin * fz);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(6, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-6, 6);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#000';
  ctx.stroke();
  ctx.restore();
  // Norte.
  const n = aPantalla(pos.x, pos.z - 1e5);
  const dn = Math.hypot(n.x - cx, n.y - cy) || 1;
  texto(ctx, 'N', cx + ((n.x - cx) / dn) * (r - 2), cy + ((n.y - cy) / dn) * (r - 2) + 5, '#fff', 12, 'center', 3);
  // Borde.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000';
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.stroke();
}

export function dibujarHud(ctx: CanvasRenderingContext2D, p: Partida, ancho: number, alto: number, op: OpcionesHud) {
  ctx.clearRect(0, 0, ancho, alto);
  ctx.textBaseline = 'alphabetic';
  const j = p.jugador;

  // Destello de daño y vida baja.
  if (op.dano > 0 || j.vida < 25) {
    const g = ctx.createRadialGradient(ancho / 2, alto / 2, Math.min(ancho, alto) * 0.3, ancho / 2, alto / 2, Math.max(ancho, alto) * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(200,0,0,${Math.max(op.dano * 0.6, j.vida < 25 ? 0.3 : 0)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ancho, alto);
  }
  if (p.fase === 'muerto' || p.fase === 'arrestado' || p.fase === 'fin') {
    ctx.fillStyle = p.fase === 'muerto' ? 'rgba(120,0,0,0.25)' : 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, ancho, alto);
  }

  // Bloque de estado (arriba a la derecha).
  const der = ancho - (op.tactil ? 14 : 70);
  let y = op.tactil ? 90 : 40;
  const escala = Math.min(1, ancho / 700);
  const t = (n: number) => Math.round(n * (0.75 + 0.25 * escala));
  texto(ctx, textoHora(p.hora), der, y, '#fff', t(26), 'right', 5);
  // Arma y munición.
  const arma = ARMAS[p.armaActual];
  const icx = der - t(160) - 26;
  ctx.beginPath();
  ctx.arc(icx, y - 10, 24, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.font = '22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(arma.icono, icx, y - 2);
  if (!arma.cuerpo) {
    const total = p.g.armas[p.armaActual] ?? 0;
    texto(ctx, p.recargando > 0 ? '···' : `${p.cargador}-${Math.max(0, total - p.cargador)}`, icx, y + 26, '#fff', 11, 'center', 3);
  }
  y += 14;
  const bw = t(140);
  barra(ctx, der - bw, y, bw, 9, j.vida / j.vidaMax, j.vida > 25 || Math.floor(p.tiempo * 3) % 2 ? '#b4191d' : '#ff5050', '#3a0808');
  y += 14;
  if (j.chaleco > 0) {
    barra(ctx, der - bw, y, bw, 7, j.chaleco / 100, '#e0e0e0', '#333');
    y += 12;
  }
  if (p.aguante < 0.99 && !j.coche) {
    barra(ctx, der - bw * 0.6, y, bw * 0.6, 4, p.aguante, '#5ab0ff', '#0c2340');
    y += 9;
  }
  y += 24;
  texto(ctx, `$${String(Math.min(99999999, p.g.dinero)).padStart(8, '0')}`, der, y, '#2f8f3a', t(24), 'right', 5);
  y += 26;
  // Estrellas.
  const e = p.estrellas;
  const parpadea = p.estrellasParpadean && Math.floor(p.tiempo * 4) % 2 === 0;
  for (let i = 0; i < MAX_ESTRELLAS; i++) estrella(ctx, der - 11 - i * 25, y, 11, i < e && !parpadea);
  y += 26;
  texto(ctx, `Respeto ${p.nivel}`, der, y, '#ddd', 12, 'right', 3);

  // Radar.
  const rr = op.tactil ? Math.min(56, alto * 0.13) : Math.min(80, alto * 0.13);
  if (op.tactil) radar(ctx, p, 16 + rr, 62 + rr, rr);
  else radar(ctx, p, 22 + rr, alto - 22 - rr, rr);

  // Objetivo fijado.
  if (p.objetivo && op.proyectar) {
    const o = p.objetivo;
    const pt = op.proyectar(o.cuerpo.x, o.cuerpo.y + 2.15, o.cuerpo.z);
    if (pt.visible) {
      const k = o.vida / o.vidaMax;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y + 8);
      ctx.lineTo(pt.x - 8, pt.y - 4);
      ctx.lineTo(pt.x + 8, pt.y - 4);
      ctx.closePath();
      ctx.fillStyle = k > 0.6 ? '#4caf50' : k > 0.3 ? '#ffb300' : '#e53935';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
  }
  // Mira al apuntar con armas de fuego (en el ordenador, siempre).
  if (!j.coche && !arma.cuerpo && !p.objetivo && j.estado === 'pie' && (!op.tactil)) {
    const cx = ancho / 2;
    const cy = alto / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * 4, cy + dy * 4);
      ctx.lineTo(cx + dx * 10, cy + dy * 10);
      ctx.stroke();
    }
  }

  // Rótulos abajo a la derecha (zona, coche y emisora).
  const abajo = op.tactil ? alto - 210 : alto - 30;
  if (p.rotuloT > 0) {
    ctx.globalAlpha = Math.min(1, p.rotuloT);
    texto(ctx, p.rotulo, op.tactil ? ancho / 2 : der, op.tactil ? 40 : abajo, '#e8e8e8', t(22), op.tactil ? 'center' : 'right', 5);
    ctx.globalAlpha = 1;
  }
  if (op.radioT > 0 && j.coche) {
    ctx.globalAlpha = Math.min(1, op.radioT);
    texto(ctx, op.radio, ancho / 2, op.tactil ? 66 : 50, '#ffb347', t(20), 'center', 4);
    ctx.globalAlpha = 1;
  }

  // Mensaje grande del centro.
  if (p.mensajeT > 0) {
    ctx.globalAlpha = Math.min(1, p.mensajeT * 2);
    const rojo = p.fase === 'muerto';
    texto(ctx, p.mensaje, ancho / 2, alto * 0.32, rojo ? '#ff4040' : p.fase === 'arrestado' ? '#7fb0ff' : '#ffd23f', p.fase === 'jugando' ? t(26) : t(40), 'center', 6);
    ctx.globalAlpha = 1;
  }
  // Arresto en curso.
  if (p.progresoArresto > 0.05 && p.fase === 'jugando') {
    const w = 180;
    barra(ctx, ancho / 2 - w / 2, alto * 0.4, w, 8, p.progresoArresto, '#7fb0ff', '#102040');
    texto(ctx, '¡Te están arrestando! Muévete', ancho / 2, alto * 0.4 - 8, '#fff', 13, 'center', 3);
  }
  // Pista contextual (arriba a la izquierda, como en San Andreas).
  const pista = p.fase === 'jugando' ? textoPista(p, op.tactil) : '';
  if (pista) {
    ctx.font = '600 14px system-ui, sans-serif';
    const w = ctx.measureText(pista).width + 20;
    const x = op.tactil ? 16 + rr * 2 + 14 : 18;
    const yy = op.tactil ? 62 : 18;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(x, yy, w, 30);
    ctx.strokeStyle = '#222';
    ctx.strokeRect(x, yy, w, 30);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(pista, x + 10, yy + 20);
  }
}

function textoPista(p: Partida, tactil: boolean): string {
  switch (p.pista) {
    case 'entrar': return tactil ? '△ Subir al coche' : 'F: subir al coche';
    case 'robar': return tactil ? '△ Robar el coche' : 'F: robar el coche';
    case 'salir': return p.jugador.coche?.ardiendo !== undefined && p.jugador.coche.ardiendo >= 0 ? (tactil ? '△ ¡Sal del coche!' : 'F: ¡sal del coche!') : '';
    default: return '';
  }
}
