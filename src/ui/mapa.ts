import { CELDA, DISTRITOS, SERVICIOS, ZONA, nombreZona, serviciosDeZona } from '../core/ciudad';
import type { Partida } from '../game/logica';
import { boton, h, mostrarPanel } from './dom';

/** Mapa de la zona (norte arriba) con los servicios cercanos. */
export function panelMapa(p: Partida, volver: () => void) {
  const lienzo = h('canvas', { class: 'mapa-lienzo', 'aria-label': 'Mapa de la ciudad' }) as HTMLCanvasElement;
  let metros = 420;
  const pos = p.posJugador();
  const pintar = () => {
    const lado = Math.min(560, innerWidth - 64, innerHeight - 190);
    const dpr = Math.min(2, devicePixelRatio || 1);
    lienzo.width = lado * dpr;
    lienzo.height = lado * dpr;
    lienzo.style.width = `${lado}px`;
    lienzo.style.height = `${lado}px`;
    const ctx = lienzo.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const k = lado / (metros * 2);
    const aX = (x: number) => (x - pos.x) * k + lado / 2;
    const aY = (z: number) => (z - pos.z) * k + lado / 2;
    ctx.fillStyle = '#4a4a4f';
    ctx.fillRect(0, 0, lado, lado);
    const i0 = Math.floor((pos.x - metros) / CELDA);
    const i1 = Math.floor((pos.x + metros) / CELDA);
    const k0 = Math.floor((pos.z - metros) / CELDA);
    const k1 = Math.floor((pos.z + metros) / CELDA);
    for (let i = i0; i <= i1; i++) {
      for (let kk = k0; kk <= k1; kk++) {
        const c = p.ciudad.celda(i, kk);
        ctx.fillStyle = `#${DISTRITOS[c.distrito].suelo.toString(16).padStart(6, '0')}`;
        ctx.fillRect(aX(i * CELDA + 6), aY(kk * CELDA + 6), (CELDA - 12) * k, (CELDA - 12) * k);
        if (c.paquete && !p.g.paquetes.includes(c.paquete.id) && Math.hypot(c.paquete.x - pos.x, c.paquete.z - pos.z) < 60) {
          ctx.fillStyle = '#2ecc71';
          ctx.fillRect(aX(c.paquete.x) - 3, aY(c.paquete.z) - 3, 6, 6);
        }
      }
    }
    // Servicios.
    const si0 = Math.floor((pos.x - metros) / CELDA / ZONA);
    const si1 = Math.floor((pos.x + metros) / CELDA / ZONA);
    const sk0 = Math.floor((pos.z - metros) / CELDA / ZONA);
    const sk1 = Math.floor((pos.z + metros) / CELDA / ZONA);
    ctx.font = `${Math.max(12, Math.min(20, 9000 / metros))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let si = si0; si <= si1; si++) {
      for (let sk = sk0; sk <= sk1; sk++) {
        for (const [idx, s] of serviciosDeZona(si, sk)) {
          const e = p.ciudad.celda(si * ZONA + (idx % ZONA), sk * ZONA + Math.floor(idx / ZONA)).entrada;
          if (e) ctx.fillText(SERVICIOS[s].icono, aX(e.x), aY(e.z));
        }
      }
    }
    // Tú.
    const yaw = p.jugador.coche ? p.jugador.coche.yaw : p.jugador.yaw;
    ctx.save();
    ctx.translate(lado / 2, lado / 2);
    ctx.rotate(Math.atan2(Math.cos(yaw), Math.sin(yaw)) + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 7);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  };
  const leyenda = (Object.keys(SERVICIOS) as Array<keyof typeof SERVICIOS>).map((s) => `${SERVICIOS[s].icono} ${SERVICIOS[s].nombre}`).join(' · ');
  mostrarPanel(
    h('div', { class: 'tarjeta ancha' },
      h('div', { class: 'cabecera' }, boton('Volver', volver, { icono: '←' }), h('h2', { text: '🗺️ Mapa' })),
      h('p', { class: 'texto-suave', text: `Estás en ${nombreZona(pos.x, pos.z)}` }),
      h('div', { class: 'mapa-caja' }, lienzo),
      h('div', { class: 'fila' },
        boton('Alejar', () => {
          metros = Math.min(1200, metros * 1.5);
          pintar();
        }, { icono: '➖' }),
        boton('Acercar', () => {
          metros = Math.max(150, metros / 1.5);
          pintar();
        }, { icono: '➕' }),
      ),
      h('p', { class: 'ayuda-texto', text: leyenda }),
    ),
  );
  pintar();
}
