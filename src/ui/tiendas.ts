import { app } from '../app';
import { audio } from '../audio';
import { ARMAS, ORDEN_ARMAS } from '../core/armas';
import type { Partida } from '../game/logica';
import { boton, h, mostrarPanel } from './dom';

/** Paneles de las tiendas: armería, comida rápida y tu casa. El juego queda en pausa mientras están abiertos. */

const fila = (texto: string, detalle: string, accion: HTMLElement) =>
  h('div', { class: 'mejora' }, h('div', { class: 'mejora-texto' }, h('strong', { text: texto }), h('small', { text: detalle })), accion);

function compra(p: Partida, precio: number, hacer: () => void, repintar: () => void, texto = `${precio} $`): HTMLButtonElement {
  const b = boton(texto, () => {
    if (!p.gastar(precio)) return;
    hacer();
    audio.efecto('recoger');
    app.guardar();
    repintar();
  }, { variante: p.g.dinero >= precio ? 'primario' : 'suave' });
  b.disabled = p.g.dinero < precio;
  return b;
}

export function panelArmeria(p: Partida, cerrar: () => void) {
  const pintar = () => {
    const filas = ORDEN_ARMAS.filter((a) => a !== 'punos').map((a) => {
      const d = ARMAS[a];
      const tiene = p.g.armas[a] !== undefined && (d.cuerpo || (p.g.armas[a] ?? 0) > 0);
      if (d.nivel > p.nivel) return fila(`${d.icono} ${d.nombre}`, `Se desbloquea con respeto ${d.nivel}`, h('span', { class: 'texto-suave', text: '🔒' }));
      if (!tiene) return fila(`${d.icono} ${d.nombre}`, d.cuerpo ? 'Cuerpo a cuerpo' : `Daño ${d.dano * d.perdigones} · ${d.paquete} balas`, compra(p, d.precio, () => p.darArma(a, d.paquete), pintar));
      if (d.cuerpo) return fila(`${d.icono} ${d.nombre}`, 'Ya lo tienes', h('span', { class: 'texto-suave', text: '✔' }));
      return fila(`${d.icono} ${d.nombre}`, `Tienes ${p.g.armas[a]} balas`, compra(p, d.precioMunicion, () => p.darArma(a, d.paquete), pintar, `+${d.paquete} · ${d.precioMunicion} $`));
    });
    const j = p.jugador;
    mostrarPanel(
      h('div', { class: 'tarjeta ancha' },
        h('div', { class: 'cabecera' }, boton('Salir', cerrar, { icono: '←' }), h('h2', { text: '🔫 Armería' })),
        h('p', { class: 'texto-suave', text: `Tienes ${p.g.dinero} $ · Respeto ${p.nivel}` }),
        fila('🦺 Chaleco antibalas', `Ahora: ${Math.round(j.chaleco)} %`, compra(p, 200, () => (j.chaleco = 100), pintar)),
        ...filas,
      ),
    );
  };
  pintar();
}

export function panelComida(p: Partida, cerrar: () => void, atracar: () => void) {
  const pintar = () => {
    const j = p.jugador;
    const comer = (n: number) => () => (j.vida = Math.min(j.vidaMax, j.vida + n));
    const armado = !ARMAS[p.armaActual].cuerpo;
    mostrarPanel(
      h('div', { class: 'tarjeta' },
        h('div', { class: 'cabecera' }, boton('Salir', cerrar, { icono: '←' }), h('h2', { text: '🍗 Pollo Feliz' })),
        h('p', { class: 'texto-suave', text: `Tienes ${p.g.dinero} $ · ❤️ ${Math.ceil(j.vida)}/${j.vidaMax}` }),
        fila('🍟 Menú pequeño', '+25 de vida', compra(p, 5, comer(25), pintar)),
        fila('🍔 Menú mediano', '+50 de vida', compra(p, 10, comer(50), pintar)),
        fila('🍗 Cubo familiar', 'Vida llena', compra(p, 20, comer(999), pintar)),
        armado
          ? boton('Atracar la tienda (★★)', atracar, { icono: '🔫', variante: 'suave' })
          : h('p', { class: 'ayuda-texto', text: 'Con un arma de fuego en la mano podrías atracar la tienda…' }),
      ),
    );
  };
  pintar();
}

export function panelCasa(p: Partida, cerrar: () => void, armario: () => void) {
  const j = p.jugador;
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('div', { class: 'cabecera' }, boton('Salir', cerrar, { icono: '←' }), h('h2', { text: '🏠 Tu casa' })),
      h('p', { class: 'texto-suave', text: 'Aquí estás a salvo. La partida se guarda sola.' }),
      boton('Descansar (vida llena, pasan 6 horas)', () => {
        j.vida = j.vidaMax;
        p.hora = (p.hora + 6) % 24;
        p.sincronizar();
        app.guardar();
        audio.efecto('nivel');
        cerrar();
      }, { variante: 'primario', icono: '😴' }),
      boton('Armario (cambiar de ropa)', armario, { icono: '👕' }),
    ),
  );
}
