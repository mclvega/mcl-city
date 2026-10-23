import { describe, expect, it } from 'vitest';
import { ARMAS } from '../src/core/armas';
import { actualizarBuscado, buscadoNuevo, estrellasDe, sumarDelito, tiempoParaPerder } from '../src/core/buscado';
import { alturaRampa, BORDE, CARRIL, CELDA, Ciudad, DIRS, distritoDe, generarCelda, serviciosDeZona, ZONA } from '../src/core/ciudad';
import { MODOS } from '../src/core/difficulty';
import { moverCuerpo, rayoCajaGirada, rayoCilindro } from '../src/core/fisica';
import { PASO } from '../src/core/loop';
import { escalaNivel, nivelDe, progresoNivel, respetoParaNivel } from '../src/core/respeto';
import { hash2, ruido } from '../src/core/rng';
import { luzDelDia, textoHora } from '../src/core/tiempo';
import { circulosVehiculo, mandosVacios, pasoVehiculo, VEHICULOS, velocidadAdelante, type EstadoVehiculo } from '../src/core/vehiculos';
import { controlesVacios, Partida } from '../src/game/logica';
import { normalizarConfig } from '../src/settings';
import { anotarPersecucion, guardadoNuevo, normalizarGuardado } from '../src/storage';

const coche = (): EstadoVehiculo => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, w: 0, ruedas: 0, enAire: false });

describe('ciudad', () => {
  it('la misma celda se genera igual y los edificios quedan dentro del solar', () => {
    for (let i = -6; i < 6; i++) {
      for (let k = -6; k < 6; k++) {
        const a = generarCelda(i, k);
        const b = generarCelda(i, k);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        for (const bl of a.bloques) {
          if (bl.tipo === 'poste' || bl.tipo === 'tronco') continue;
          expect(bl.x - bl.w / 2).toBeGreaterThanOrEqual(i * CELDA + BORDE - 0.01);
          expect(bl.x + bl.w / 2).toBeLessThanOrEqual((i + 1) * CELDA - BORDE + 0.01);
          expect(bl.z - bl.d / 2).toBeGreaterThanOrEqual(k * CELDA + BORDE - 0.01);
          expect(bl.z + bl.d / 2).toBeLessThanOrEqual((k + 1) * CELDA - BORDE + 0.01);
        }
      }
    }
  });

  it('cada zona tiene los cinco servicios y tu casa está en el origen', () => {
    for (let s = -3; s < 3; s++) {
      const m = serviciosDeZona(s, -s);
      const tipos = [...m.values()];
      for (const t of ['hospital', 'policia', 'armeria', 'comida', 'taller']) expect(tipos).toContain(t);
      expect(new Set(m.keys()).size).toBe(m.size);
    }
    expect(generarCelda(0, 0).servicio).toBe('casa');
    const c = new Ciudad();
    const h = c.servicioCercano('hospital', 100, 100);
    expect(h.distancia).toBeLessThan(CELDA * ZONA * 1.5);
  });

  it('hay variedad de distritos y el ruido es continuo', () => {
    const vistos = new Set<string>();
    for (let i = -40; i < 40; i += 2) for (let k = -40; k < 40; k += 2) vistos.add(distritoDe(i, k));
    expect(vistos.size).toBeGreaterThanOrEqual(6);
    expect(Math.abs(ruido(3.5, 2.1) - ruido(3.501, 2.1))).toBeLessThan(0.01);
    expect(hash2(1, 2)).not.toBe(hash2(2, 1));
  });

  it('rayos contra edificios y suelo; las calles están libres', () => {
    const c = new Ciudad();
    // Por el centro de una calle no hay nada en 100 m.
    expect(c.rayo(5 * CELDA + 1, 1.5, 0, 1, 0, 0, 100)).toBe(100);
    expect(c.rayo(0, 10, 0, 0, -1, 0, 50)).toBeCloseTo(10);
    const celda = c.celda(2, 2);
    const ed = celda.bloques.find((b) => b.tipo !== 'poste' && b.tipo !== 'tronco' && b.y1 > 3);
    if (ed) {
      const t = c.rayo(ed.x, 1, 2 * CELDA + 0.5, 0, 0, 1, 200);
      expect(t).toBeLessThan(ed.z - 2 * CELDA);
    }
  });

  it('las rampas suben de 0 a su altura', () => {
    const ra = { x: 0, z: 0, yaw: 0, largo: 10, ancho: 4, alto: 2, id: 'r' };
    expect(alturaRampa(ra, 0, -5)).toBeCloseTo(0);
    expect(alturaRampa(ra, 0, 0)).toBeCloseTo(1);
    expect(alturaRampa(ra, 0, 4.9)).toBeCloseTo(1.98, 1);
    expect(alturaRampa(ra, 3, 0)).toBe(0);
  });
});

describe('física', () => {
  it('un cuerpo no atraviesa un edificio', () => {
    const c = new Ciudad();
    const celda = c.celda(1, 1);
    const ed = celda.bloques.find((b) => b.w > 6 && b.y1 > 3)!;
    expect(ed).toBeTruthy();
    const cuerpo = { x: ed.x - ed.w / 2 - 2, y: 0, z: ed.z, vy: 0, radio: 0.35, alto: 1.8, enSuelo: true };
    for (let n = 0; n < 120; n++) moverCuerpo(cuerpo, 0.1, 0, PASO, c);
    expect(cuerpo.x).toBeLessThanOrEqual(ed.x - ed.w / 2 - 0.34);
  });

  it('rayos contra personas y cajas giradas', () => {
    expect(rayoCilindro(0, 1, -5, 0, 0, 1, 0, 0, 0, 0.5, 1.8)).toBeCloseTo(4.5);
    expect(rayoCilindro(0, 3, -5, 0, 0, 1, 0, 0, 0, 0.5, 1.8)).toBe(Infinity);
    expect(rayoCajaGirada(-5, 0.5, 0, 1, 0, 0, 0, 0, 0, Math.PI / 2, 1, 1.5, 2)).toBeCloseTo(3);
  });
});

describe('coches', () => {
  it('acelera, frena y no pasa de la velocidad máxima', () => {
    const d = VEHICULOS.sedan;
    const v = coche();
    const m = { ...mandosVacios(), acelerar: 1 };
    for (let n = 0; n < 60 * 30; n++) pasoVehiculo(v, d, m, PASO);
    expect(velocidadAdelante(v)).toBeGreaterThan(d.velMax * 0.8);
    expect(velocidadAdelante(v)).toBeLessThanOrEqual(d.velMax + 0.01);
    expect(v.z).toBeGreaterThan(100);
    const f = { ...mandosVacios(), frenar: 1 };
    for (let n = 0; n < 60 * 4; n++) pasoVehiculo(v, d, f, PASO);
    expect(velocidadAdelante(v)).toBeLessThan(1);
  });

  it('gira a la derecha con giro positivo y derrapa con el freno de mano', () => {
    const d = VEHICULOS.deportivo;
    const v = coche();
    v.vz = 20;
    for (let n = 0; n < 30; n++) pasoVehiculo(v, d, { acelerar: 0.5, frenar: 0, giro: 1, mano: false }, PASO);
    // Mirando a +z, la derecha es -x.
    expect(v.x).toBeLessThan(0);
    const a = coche();
    a.vz = 25;
    const b = coche();
    b.vz = 25;
    for (let n = 0; n < 30; n++) {
      pasoVehiculo(a, d, { acelerar: 0, frenar: 0, giro: 1, mano: false }, PASO);
      pasoVehiculo(b, d, { acelerar: 0, frenar: 0, giro: 1, mano: true }, PASO);
    }
    const lateral = (v: EstadoVehiculo) => Math.abs(v.vx * -Math.cos(v.yaw) + v.vz * Math.sin(v.yaw));
    expect(lateral(b)).toBeGreaterThan(lateral(a));
  });

  it('salta al salir de una rampa', () => {
    const d = VEHICULOS.sedan;
    const v = coche();
    v.vz = 25;
    const ra = { x: 0, z: 10, yaw: 0, largo: 9, ancho: 5, alto: 2.2, id: 'r' };
    let maxY = 0;
    for (let n = 0; n < 200; n++) {
      pasoVehiculo(v, d, mandosVacios(), PASO, alturaRampa(ra, v.x, v.z));
      maxY = Math.max(maxY, v.y);
    }
    expect(maxY).toBeGreaterThan(3);
    expect(v.enAire).toBe(false);
    expect(circulosVehiculo(v, d)).toHaveLength(3);
  });
});

describe('estrellas, respeto y tiempo', () => {
  it('los delitos suben estrellas y se pierden sin ser visto', () => {
    const b = buscadoNuevo();
    expect(sumarDelito(b, 'robarCoche')).toBe(1);
    expect(sumarDelito(b, 'matarPolicia')).toBe(2);
    expect(estrellasDe(5000)).toBe(5);
    expect(actualizarBuscado(b, 1, true)).toBe(false);
    let perdida = false;
    for (let t = 0; t < tiempoParaPerder(2) + 1 && !perdida; t += 0.5) perdida = actualizarBuscado(b, 0.5, false);
    expect(perdida).toBe(true);
    expect(estrellasDe(b.calor)).toBe(1);
  });

  it('el respeto no tiene tope y la ciudad se endurece', () => {
    expect(nivelDe(0)).toBe(1);
    expect(nivelDe(respetoParaNivel(10))).toBe(10);
    expect(nivelDe(respetoParaNivel(10) - 1)).toBe(9);
    expect(progresoNivel(respetoParaNivel(3) + 1).fraccion).toBeGreaterThan(0);
    expect(nivelDe(1e8)).toBeGreaterThan(100);
    expect(escalaNivel(10).punteria).toBeGreaterThan(escalaNivel(1).punteria);
    expect(MODOS.muyFacil.dano).toBeLessThan(MODOS.desafio.dano);
  });

  it('día y noche', () => {
    expect(luzDelDia(12)).toBe(1);
    expect(luzDelDia(2)).toBe(0);
    expect(luzDelDia(19)).toBeGreaterThan(0);
    expect(textoHora(7.5)).toBe('07:30');
  });
});

describe('guardado', () => {
  it('normaliza datos dañados y anota persecuciones', () => {
    const g = normalizarGuardado({ dinero: -5, armas: { pistola: 20, patata: 3 }, habilidades: { aguante: 500 }, paquetes: ['a', 'a', 3], config: { dificultad: 'x' } });
    expect(g.dinero).toBe(0);
    expect(g.armas.pistola).toBe(20);
    expect(g.armas.punos).toBe(1);
    expect(g.habilidades.aguante).toBe(100);
    expect(g.paquetes).toEqual(['a']);
    expect(g.config.dificultad).toBe('normal');
    expect(normalizarConfig(null).pantallaCompleta).toBe(true);
    expect(anotarPersecucion(g, { nombre: 'Ana', estrellas: 3, segundos: 60, nivel: 2 })).toBe(true);
    expect(g.estadisticas.estrellasMax).toBe(3);
    expect(Object.keys(ARMAS)).toContain('lanzacohetes');
  });
});

describe('partida', () => {
  const nueva = () => {
    const g = guardadoNuevo();
    const p = new Partida(g, MODOS.normal, 42);
    return { g, p };
  };

  it('aparece en casa, se llena de tráfico y peatones y avanza sin errores', () => {
    const { p } = nueva();
    const c = controlesVacios();
    c.z = -1;
    for (let n = 0; n < 60 * 20; n++) p.actualizar(PASO, c);
    expect(p.personas.length).toBeGreaterThan(5);
    expect(p.vehiculos.length).toBeGreaterThan(3);
    for (const v of p.vehiculos) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.z)).toBe(true);
    }
    expect(p.fase).toBe('jugando');
  });

  it('el jugador anda en las cuatro direcciones', () => {
    for (const [x, z] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
      const { p } = nueva();
      const j = p.jugador;
      expect(p.personas).toContain(j);
      const c = controlesVacios();
      c.x = x;
      c.z = z;
      const x0 = j.cuerpo.x;
      const z0 = j.cuerpo.z;
      for (let n = 0; n < 60; n++) p.actualizar(PASO, c);
      expect(Math.hypot(j.cuerpo.x - x0, j.cuerpo.z - z0)).toBeGreaterThan(1.5);
    }
  });

  it('robar un coche, conducirlo y bajarse', () => {
    const { p, g } = nueva();
    const j = p.jugador;
    const v = p.crearVehiculo('sedan', j.cuerpo.x + 2, j.cuerpo.z, 0);
    const c = controlesVacios();
    c.entrar = true;
    p.actualizar(PASO, c);
    expect(j.estado).toBe('coche');
    expect(j.coche).toBe(v);
    expect(g.estadisticas.cochesRobados).toBe(1);
    const x0 = v.x;
    const z0 = v.z;
    const a = controlesVacios();
    a.acelerar = 1;
    for (let n = 0; n < 90; n++) p.actualizar(PASO, a);
    expect(Math.hypot(v.x - x0, v.z - z0)).toBeGreaterThan(1);
    p.actualizar(PASO, c);
    expect(j.estado).not.toBe('coche');
  });

  it('matar a un civil da estrellas y llega la policía', () => {
    const { p } = nueva();
    const j = p.jugador;
    const civil = p.crearPersona('civil', j.cuerpo.x + 1, j.cuerpo.z);
    p.danarPersona(civil, 999, j, 'bala');
    expect(civil.estado).toBe('muerto');
    expect(p.estrellas).toBeGreaterThanOrEqual(1);
    const c = controlesVacios();
    for (let n = 0; n < 60 * 6; n++) p.actualizar(PASO, c);
    expect(p.personas.some((o) => o.tipo === 'policia')).toBe(true);
  });

  it('disparar con la pistola gasta munición y hiere al objetivo fijado', () => {
    const { p, g } = nueva();
    const j = p.jugador;
    p.darArma('pistola', 30);
    expect(p.armaActual).toBe('pistola');
    // En mitad de una calle (sin farolas ni árboles en la línea de tiro).
    j.cuerpo.x = 5 * CELDA;
    j.cuerpo.z = 20;
    p.camYaw = 0;
    p.personas = [j];
    const o = p.crearPersona('rival', j.cuerpo.x, j.cuerpo.z + 6);
    o.ia.modo = 'quieto';
    const c = controlesVacios();
    c.apuntar = true;
    c.disparar = true;
    c.dispararPulsado = true;
    const vida = o.vida;
    for (let n = 0; n < 5; n++) p.actualizar(PASO, c);
    expect(g.armas.pistola).toBe(29);
    expect(o.vida).toBeLessThan(vida);
  });

  it('el taller borra las estrellas y cobra 100 $', () => {
    const { p, g } = nueva();
    const v = p.crearVehiculo('compacto', 0, 0, 0);
    p.delito('robarCoche');
    expect(p.estrellas).toBe(1);
    const dinero = g.dinero;
    p.pintar(v);
    expect(p.estrellas).toBe(0);
    expect(g.dinero).toBe(dinero - 100);
  });

  it('morir lleva al resumen y se reaparece en el hospital', () => {
    const { p } = nueva();
    let fin: string | null = null;
    p.eventos.fin = (r) => (fin = r.tipo);
    p.danarPersona(p.jugador, 999, null, 'bala');
    for (let n = 0; n < 60 * 4; n++) p.actualizar(PASO, controlesVacios());
    expect(fin).toBe('muerto');
    p.reaparecer('hospital');
    expect(p.jugador.vida).toBe(100);
    expect(p.fase).toBe('jugando');
  });

  it('el tráfico sigue sus carriles sin chocar', () => {
    for (let semilla = 1; semilla <= 3; semilla++) {
      const { p } = nueva();
      const c = controlesVacios();
      let peor = 0;
      for (let n = 0; n < 60 * 40; n++) {
        p.actualizar(PASO, c);
        for (const v of p.vehiculos) {
          if (!v.conductor || v.conductor === p.jugador || v.ia.modo !== 'carril') continue;
          const [dx, dz] = DIRS[v.ia.dir];
          const lat = dx !== 0 ? v.z - (v.ia.nk * CELDA + dx * CARRIL) : v.x - (v.ia.ni * CELDA - dz * CARRIL);
          peor = Math.max(peor, Math.abs(lat));
        }
      }
      expect(peor).toBeLessThan(7);
      expect(p.vehiculos.filter((v) => v.conductor && v.vida < VEHICULOS[v.tipo].vida * 0.5).length).toBeLessThanOrEqual(1);
    }
  });

  it('trucos', () => {
    const { p, g } = nueva();
    expect(p.truco('saludyplata')).toBeTruthy();
    expect(g.dinero).toBeGreaterThan(250000);
    expect(p.truco('nada')).toBeNull();
  });
});
