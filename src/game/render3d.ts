import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { IdArma } from '../core/armas';
import { BORDE, CELDA, DISTRITOS, type Celda, type Servicio, SERVICIOS, type TipoArbol } from '../core/ciudad';
import { luzDelDia } from '../core/tiempo';
import { IDS_VEHICULO, VEHICULOS, type IdVehiculo } from '../core/vehiculos';
import { liberar } from '../rendimiento';
import { animateWalk, createAvatar, DEFAULT_LOOK, randomLook, type Look } from './characters';
import { Partida, type Persona, type Vehiculo } from './logica';

/* ---------- Utilidades ---------- */

const cacheMat = new Map<string, THREE.Material>();
function mat(color: number, basico = false, opacidad = 1, aditivo = false): THREE.Material {
  const clave = `${color}|${basico}|${opacidad}|${aditivo}`;
  let m = cacheMat.get(clave);
  if (!m) {
    const o = { color, transparent: opacidad < 1 || aditivo, opacity: opacidad, depthWrite: opacidad >= 1 && !aditivo, blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending };
    m = basico ? new THREE.MeshBasicMaterial(o) : new THREE.MeshLambertMaterial(o);
    cacheMat.set(clave, m);
  }
  return m;
}

/** Textura generada en un lienzo (sin archivos de imagen). */
function textura(ancho: number, alto: number, pintar: (c: CanvasRenderingContext2D) => void, nitida = false): THREE.CanvasTexture {
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  pintar(lienzo.getContext('2d')!);
  const t = new THREE.CanvasTexture(lienzo);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  if (nitida) t.magFilter = THREE.NearestFilter;
  return t;
}

const pseudo = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Instancias sin recorte por cámara (se mueven por todo el mundo). */
function instancias(geo: THREE.BufferGeometry, material: THREE.Material, max: number, sombra = true, color = false): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, material, max);
  m.count = 0;
  m.frustumCulled = false;
  m.castShadow = sombra;
  m.receiveShadow = true;
  if (color) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  return m;
}

/** Une geometrías con un color por vértice (para dibujar piezas de varios colores en una sola llamada). */
function unirColoreadas(partes: Array<{ geo: THREE.BufferGeometry; color: number; matriz?: THREE.Matrix4 }>): THREE.BufferGeometry {
  const c = new THREE.Color();
  const geos = partes.map(({ geo, color, matriz }) => {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matriz) g.applyMatrix4(matriz);
    g.deleteAttribute('uv');
    c.set(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g = g.attributes.normal ? g : (g.computeVertexNormals(), g);
    return g;
  });
  const u = mergeGeometries(geos)!;
  for (const g of geos) g.dispose();
  return u;
}

const caja = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/* ---------- Materiales de la ciudad ---------- */

/** Fachada con las UV en coordenadas del mundo (las ventanas no se estiran) y ventanas que brillan de noche. */
function materialFachada(mapa: THREE.Texture, emisivo: THREE.Texture | null, metros: number): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map: mapa, emissiveMap: emisivo, emissive: emisivo ? 0xffd9a0 : 0x000000, emissiveIntensity: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uEscala = { value: 1 / metros };
    sh.vertexShader = `uniform float uEscala;\nvarying float vTecho;\n${sh.vertexShader}`.replace('#include <uv_vertex>', `#include <uv_vertex>
      {
        vec4 wpU = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          wpU = instanceMatrix * wpU;
        #endif
        wpU = modelMatrix * wpU;
        vec2 fuv = abs(normal.x) > 0.5 ? wpU.zy : wpU.xy;
        vTecho = step(0.5, normal.y);
        fuv = mix(fuv * uEscala, vec2(0.004, 0.004), vTecho);
        #ifdef USE_MAP
          vMapUv = fuv;
        #endif
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = fuv;
        #endif
      }`);
    sh.fragmentShader = `varying float vTecho;\n${sh.fragmentShader}`
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= mix(1.0, 0.6, vTecho);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= (1.0 - vTecho);');
  };
  return m;
}

/** Tile de fachada: `bahias` ventanas a lo ancho y `pisos` a lo alto, con ventanas encendidas al azar. */
function texturasFachada(bahias: number, pisos: number, ventana: [number, number, number, number], cristal: string, base = '#e8e8e8', semilla = 1) {
  const L = 32;
  const W = bahias * L;
  const H = pisos * L;
  const pintar = (emisivo: boolean) => (c: CanvasRenderingContext2D) => {
    c.fillStyle = emisivo ? '#000' : base;
    c.fillRect(0, 0, W, H);
    if (!emisivo) {
      c.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = 0; y < H; y += L) c.fillRect(0, y + L - 2, W, 2);
    }
    const [x0, y0, x1, y1] = ventana;
    for (let b = 0; b < bahias; b++) {
      for (let p = 0; p < pisos; p++) {
        const r = pseudo(b * 13 + p * 7 + semilla * 31);
        if (emisivo) {
          if (r > 0.55) continue;
          c.fillStyle = r < 0.15 ? '#ffe7b8' : r < 0.35 ? '#ffd27a' : '#c9a050';
        } else {
          c.fillStyle = cristal;
          c.globalAlpha = 0.85 + r * 0.15;
        }
        c.fillRect(b * L + x0, p * L + y0, x1 - x0, y1 - y0);
        c.globalAlpha = 1;
        if (!emisivo) {
          c.fillStyle = 'rgba(255,255,255,0.18)';
          c.fillRect(b * L + x0, p * L + y0, (x1 - x0) * 0.35, y1 - y0);
        }
      }
    }
  };
  const mapa = textura(W, H, pintar(false));
  const emi = textura(W, H, pintar(true));
  // Volteado vertical: la v del lienzo crece hacia abajo.
  mapa.flipY = emi.flipY = true;
  return { mapa, emi };
}

/** Textura del suelo de una celda: calzada, aceras, líneas y pasos de cebra. */
function texturaCalles(): THREE.CanvasTexture {
  const N = 1024;
  const m = N / CELDA;
  const t = textura(N, N, (c) => {
    c.fillStyle = '#3b3c40';
    c.fillRect(0, 0, N, N);
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = i % 2 ? '#35363a' : '#434448';
      c.fillRect(Math.random() * N, Math.random() * N, 2, 2);
    }
    // Aceras: el anillo entre la calzada y el solar.
    const a0 = 5.5 * m;
    const a1 = (CELDA - 5.5) * m;
    c.fillStyle = '#a7a7a4';
    c.fillRect(a0, a0, a1 - a0, a1 - a0);
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    c.lineWidth = 1;
    for (let x = a0; x < a1; x += 1.5 * m) {
      c.beginPath();
      c.moveTo(x, a0);
      c.lineTo(x, a1);
      c.stroke();
      c.beginPath();
      c.moveTo(a0, x);
      c.lineTo(a1, x);
      c.stroke();
    }
    c.fillStyle = '#d0d0cc';
    c.lineWidth = 0;
    // Bordillo.
    c.strokeStyle = '#e2e2dc';
    c.lineWidth = 0.25 * m;
    c.strokeRect(a0, a0, a1 - a0, a1 - a0);
    // Línea central discontinua en los bordes del tile (media línea a cada lado).
    c.fillStyle = '#e8c547';
    const g = 0.12 * m;
    for (let s = 6.5; s < CELDA - 7; s += 4) {
      c.fillRect(s * m, 0, 2.2 * m, g);
      c.fillRect(s * m, N - g, 2.2 * m, g);
      c.fillRect(0, s * m, g, 2.2 * m);
      c.fillRect(N - g, s * m, g, 2.2 * m);
    }
    // Línea blanca del arcén.
    c.fillStyle = 'rgba(240,240,240,0.7)';
    const e = 0.12 * m;
    c.fillRect(a0, 5.0 * m, a1 - a0, e);
    c.fillRect(a0, (CELDA - 5.0) * m - e, a1 - a0, e);
    c.fillRect(5.0 * m, a0, e, a1 - a0);
    c.fillRect((CELDA - 5.0) * m - e, a0, e, a1 - a0);
    // Pasos de cebra junto a cada cruce.
    c.fillStyle = '#ececec';
    for (const ex of [0, 1]) {
      for (const ez of [0, 1]) {
        for (let s = 0.4; s < 5.4; s += 0.9) {
          const v = ez ? N - (s + 0.5) * m : s * m;
          const u0 = ex ? N - 9 * m : 6 * m;
          c.fillRect(u0, v, 3 * m, 0.5 * m);
          const u = ex ? N - (s + 0.5) * m : s * m;
          const v0 = ez ? N - 9 * m : 6 * m;
          c.fillRect(u, v0, 0.5 * m, 3 * m);
        }
      }
    }
  });
  t.anisotropy = 8;
  return t;
}

/* ---------- Modelos ---------- */

/** Arma en la mano. */
function modeloArma(arma: IdArma): THREE.Group {
  const g = new THREE.Group();
  const metal = mat(0x2b2b2b);
  const madera = mat(0x7a4a24);
  const add = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    me.position.set(x, y, z);
    me.castShadow = true;
    g.add(me);
  };
  switch (arma) {
    case 'bate':
      add(0.06, 0.06, 0.8, madera, 0, 0, 0.3);
      break;
    case 'pistola':
      add(0.05, 0.07, 0.22, metal, 0, 0, 0.06);
      add(0.045, 0.12, 0.05, metal, 0, -0.08, -0.02);
      break;
    case 'subfusil':
      add(0.06, 0.09, 0.4, metal, 0, 0, 0.08);
      add(0.035, 0.16, 0.05, metal, 0, -0.1, 0.1);
      break;
    case 'fusil':
      add(0.06, 0.09, 0.62, metal, 0, 0, 0.12);
      add(0.055, 0.11, 0.2, madera, 0, -0.01, -0.24);
      add(0.04, 0.15, 0.06, metal, 0, -0.1, 0.08);
      break;
    case 'escopeta':
      add(0.06, 0.07, 0.7, metal, 0, 0.02, 0.18);
      add(0.06, 0.12, 0.24, madera, 0, -0.03, -0.22);
      break;
    case 'lanzacohetes':
      add(0.13, 0.13, 1.0, mat(0x4e5b31), 0, 0.08, 0.1);
      add(0.04, 0.14, 0.06, metal, 0, -0.06, 0.0);
      break;
    case 'punos':
      break;
  }
  return g;
}

interface ModeloCoche {
  pintura: THREE.InstancedMesh;
  detalles: THREE.InstancedMesh;
}

/** Geometrías de un coche: pintura (se tiñe por instancia) y detalles (colores por vértice). */
function geometriasCoche(id: IdVehiculo): { pintura: THREE.BufferGeometry; detalles: THREE.BufferGeometry } {
  const d = VEHICULOS[id];
  const L = d.largo;
  const W = d.ancho;
  const H = d.alto;
  const suelo = 0.28;
  const furgo = id === 'furgoneta';
  const cintura = furgo ? H * 0.55 : id === 'deportivo' ? 0.72 : id === 'todoterreno' ? 1.15 : 0.92;
  const cabLargo = furgo ? 0.82 : id === 'deportivo' ? 0.38 : id === 'todoterreno' ? 0.6 : 0.48;
  const cabZ = furgo ? -0.06 : id === 'deportivo' ? -0.08 : id === 'todoterreno' ? -0.08 : -0.04;
  const pintura: THREE.BufferGeometry[] = [];
  pintura.push(caja(W, cintura - suelo, L, 0, (cintura + suelo) / 2, 0));
  // Techo y pilares.
  pintura.push(caja(W * 0.86, 0.08, L * cabLargo, 0, H - 0.04, L * cabZ));
  if (furgo) pintura.push(caja(W * 0.98, H - cintura - 0.08, L * 0.62, 0, (H + cintura) / 2 - 0.04, -L * 0.17));
  if (id !== 'deportivo' && id !== 'furgoneta') {
    // Capó un poco más bajo que la cintura.
    pintura.push(caja(W * 0.96, 0.06, L * 0.28, 0, cintura + 0.02, L * 0.34));
  }
  const p = mergeGeometries(pintura.map((g) => g.toNonIndexed()))!;
  const det: Array<{ geo: THREE.BufferGeometry; color: number }> = [];
  const cristal = 0x1d2a36;
  const altoCab = H - cintura - 0.08;
  if (furgo) det.push({ geo: caja(W * 0.9, altoCab * 0.85, L * 0.2, 0, cintura + altoCab * 0.45, L * 0.3), color: cristal });
  else {
    det.push({ geo: caja(W * 0.84, altoCab, L * cabLargo, 0, cintura + altoCab / 2, L * cabZ), color: cristal });
  }
  det.push({ geo: caja(W * 1.01, 0.16, 0.16, 0, suelo + 0.12, L / 2), color: 0x2a2a2a });
  det.push({ geo: caja(W * 1.01, 0.16, 0.16, 0, suelo + 0.12, -L / 2), color: 0x2a2a2a });
  det.push({ geo: caja(W * 0.4, 0.14, 0.04, 0, cintura - 0.2, L / 2 + 0.01), color: 0x151515 });
  if (id === 'patrulla') {
    for (const s of [-1, 1]) det.push({ geo: caja(0.03, (cintura - suelo) * 0.7, L * 0.42, s * (W / 2 + 0.01), (cintura + suelo) / 2, 0), color: 0xffffff });
    det.push({ geo: caja(W * 0.6, 0.08, 0.3, 0, H + 0.03, L * cabZ), color: 0x222222 });
  }
  if (id === 'taxi') det.push({ geo: caja(0.6, 0.18, 0.25, 0, H + 0.09, L * cabZ), color: 0x111111 });
  return { pintura: p, detalles: unirColoreadas(det) };
}

/** Modelo del helicóptero de la policía. */
function modeloHelicoptero(): { grupo: THREE.Group; rotor: THREE.Object3D; cola: THREE.Object3D } {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(new THREE.SphereGeometry(1.4, 12, 8).scale(1, 0.85, 1.5), 0x1a237e, 0, 0, 0);
  add(new THREE.SphereGeometry(1.1, 10, 8).scale(0.9, 0.7, 0.8), 0x9ecbe8, 0, 0.1, 1.2);
  add(new THREE.BoxGeometry(0.35, 0.35, 4), 0x1a237e, 0, 0.2, -3);
  add(new THREE.BoxGeometry(0.1, 1, 0.6), 0xffffff, 0, 0.6, -4.8);
  for (const x of [-0.9, 0.9]) add(new THREE.BoxGeometry(0.1, 0.1, 2.6), 0x222222, x, -1.4, 0);
  const rotor = new THREE.Group();
  rotor.position.set(0, 1.35, 0);
  for (const a of [0, Math.PI / 2]) {
    const pala = new THREE.Mesh(new THREE.BoxGeometry(9, 0.05, 0.3), mat(0x111111));
    pala.rotation.y = a;
    rotor.add(pala);
  }
  g.add(rotor);
  const cola = new THREE.Group();
  cola.position.set(0.25, 0.4, -4.8);
  cola.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.6, 0.15), mat(0x111111)));
  g.add(cola);
  return { grupo: g, rotor, cola };
}

/* ---------- Personas horneadas ---------- */

interface Horneado {
  cuerpo: THREE.InstancedMesh;
  brazos: THREE.InstancedMesh;
  posBrazos: THREE.Vector3[];
  escala: number;
}

/** Hornea un avatar de `createAvatar` en dos geometrías (cuerpo y un brazo) con colores por vértice. */
function hornearAvatar(look: Look, material: THREE.Material, max: number): Horneado {
  const a = createAvatar(look);
  const body = a.body;
  const escala = body.scale.x;
  body.scale.setScalar(1);
  body.updateMatrixWorld(true);
  const brazos = body.userData.arms as THREE.Group[];
  const enBrazo = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (brazos.includes(p as THREE.Group)) return true;
    return false;
  };
  const partesCuerpo: Array<{ geo: THREE.BufferGeometry; color: number; matriz: THREE.Matrix4 }> = [];
  const partesBrazo: Array<{ geo: THREE.BufferGeometry; color: number; matriz: THREE.Matrix4 }> = [];
  body.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh) return;
    const color = (me.material as THREE.MeshLambertMaterial).color.getHex();
    if (enBrazo(me)) {
      if (me.parent === brazos[0]) partesBrazo.push({ geo: me.geometry, color, matriz: me.matrix.clone() });
    } else partesCuerpo.push({ geo: me.geometry, color, matriz: me.matrixWorld.clone() });
  });
  const cuerpo = instancias(unirColoreadas(partesCuerpo), material, max, true);
  const brazo = instancias(unirColoreadas(partesBrazo), material, max * 2, true);
  const posBrazos = brazos.map((b) => b.position.clone());
  liberar(a.group);
  return { cuerpo, brazos: brazo, posBrazos, escala };
}

/* ---------- Render ---------- */

const LOOKS_EXTRA: Record<'policia' | 'banda' | 'rival', Look> = {
  policia: { ...DEFAULT_LOOK, shirt: 0x1f3a68, bottomColor: 0x1b1f2a, hat: 'cap', hatColor: 0x1b2a48, hair: 'short', accessory: 'sunglasses', body: 'strong' },
  banda: { ...DEFAULT_LOOK, shirt: 0x2e9e3e, bottomColor: 0x37474f, hat: 'beanie', hatColor: 0x1b5e20, skin: 0x8d5524, hair: 'short', hairColor: 0x2b1d14 },
  rival: { ...DEFAULT_LOOK, shirt: 0x7b1fa2, bottomColor: 0x212121, hat: 'cap', hatColor: 0x4a148c, skin: 0x5c3a21, hair: 'bald', facialHair: 'goatee', hairColor: 0x2b1d14 },
};

interface Particula {
  x: number;
  y: number;
  z: number;
  vy: number;
  t: number;
  vida: number;
  fuego: boolean;
  tam: number;
}

export interface OpcionesDibujo {
  efectos: boolean;
  /** Distancia de dibujo (m). */
  distancia: number;
  oscuro: boolean;
}

const m4 = new THREE.Matrix4();
const m5 = new THREE.Matrix4();
const m6 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e3 = new THREE.Euler();
const v3 = new THREE.Vector3();
const s3 = new THREE.Vector3();
const col = new THREE.Color();
const ARRIBA = new THREE.Vector3(0, 1, 0);

export class Render3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly camara = new THREE.PerspectiveCamera(65, 1, 0.1, 600);
  private escena = new THREE.Scene();
  private sol: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private tamSombras = -1;
  private suelo: THREE.Mesh;
  private fog: THREE.Fog;
  // Ciudad (instancias que se rehacen al cambiar de celda).
  private lotes: THREE.InstancedMesh;
  private edificios: Record<'torre' | 'piso' | 'casa' | 'nave' | 'lisa', THREE.InstancedMesh>;
  private matFachadas: THREE.MeshLambertMaterial[] = [];
  private tejados: THREE.InstancedMesh;
  private troncos: THREE.InstancedMesh;
  private copas: Record<TipoArbol, THREE.InstancedMesh>;
  private postes: THREE.InstancedMesh;
  private lamparas: THREE.InstancedMesh;
  private charcosLuz: THREE.InstancedMesh;
  private rampas: THREE.InstancedMesh;
  private carteles: Record<Servicio, THREE.InstancedMesh>;
  private marcas: THREE.InstancedMesh;
  private paquetes: THREE.InstancedMesh;
  private celdaActual = '';
  private celdasVisibles: Celda[] = [];
  private marcasDatos: Array<{ x: number; z: number; color: number; r: number }> = [];
  // Dinámicos.
  private coches: Record<IdVehiculo, ModeloCoche>;
  private ruedas: THREE.InstancedMesh;
  private luces: THREE.InstancedMesh;
  private haces: THREE.InstancedMesh;
  private sirenas: THREE.InstancedMesh;
  private giroRuedas = new Map<Vehiculo, { giro: number; pitch: number }>();
  private matPersonas = new THREE.MeshLambertMaterial({ vertexColors: true });
  private horneados: Horneado[] = [];
  private armasMano: THREE.InstancedMesh;
  private jugador: { grupo: THREE.Group; cuerpo: THREE.Group; brazos: THREE.Object3D[]; arma: IdArma | ''; armaMalla: THREE.Group | null } | null = null;
  private lookActual = '';
  private heli = modeloHelicoptero();
  private trazos: THREE.InstancedMesh;
  private cohetes: THREE.InstancedMesh;
  private humo: THREE.InstancedMesh;
  private fuego: THREE.InstancedMesh;
  private bolas: THREE.InstancedMesh;
  private recogibles: Record<'dinero' | 'arma' | 'vida' | 'chaleco', THREE.InstancedMesh>;
  private particulas: Particula[] = [];
  private vp = new THREE.Vector3();
  private tiempo = 0;

  constructor(lienzo: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.fog = new THREE.Fog(0x9fd0f0, 80, 240);
    this.escena.fog = this.fog;
    this.escena.background = new THREE.Color(0x9fd0f0);

    this.hemi = new THREE.HemisphereLight(0xeaf6ff, 0x5a5a50, 1.4);
    this.escena.add(this.hemi);
    const sol = new THREE.DirectionalLight(0xfff1d6, 1.7);
    this.sol = sol;
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    sol.shadow.bias = -0.0006;
    Object.assign(sol.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 260 });
    this.escena.add(sol, sol.target);

    // Suelo: un plano con la textura de la celda repetida, que sigue a la cámara.
    const texSuelo = texturaCalles();
    const lado = CELDA * 12;
    texSuelo.repeat.set(12, 12);
    this.suelo = new THREE.Mesh(new THREE.PlaneGeometry(lado, lado).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: texSuelo }));
    this.suelo.receiveShadow = true;
    this.escena.add(this.suelo);

    const ruidoClaro = textura(128, 128, (c) => {
      c.fillStyle = '#f2f2f2';
      c.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 1400; i++) {
        c.fillStyle = i % 2 ? '#dcdcdc' : '#ffffff';
        c.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
      }
    });
    ruidoClaro.repeat.set(6, 6);
    this.lotes = instancias(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: ruidoClaro }), 200, false, true);

    // Edificios: caja unidad con la base en y = 0.
    const cajaU = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const torre = texturasFachada(4, 4, [3, 4, 29, 28], '#33475e', '#dfe4ea', 1);
    const piso = texturasFachada(4, 4, [9, 7, 23, 25], '#2c3540', '#ececec', 2);
    const casa = texturasFachada(2, 2, [10, 8, 22, 22], '#3a4350', '#f2f2f2', 3);
    const nave = textura(64, 64, (c) => {
      c.fillStyle = '#e6e6e6';
      c.fillRect(0, 0, 64, 64);
      c.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = 0; x < 64; x += 4) c.fillRect(x, 0, 1, 64);
    });
    const lisa = textura(8, 8, (c) => {
      c.fillStyle = '#f0f0f0';
      c.fillRect(0, 0, 8, 8);
    });
    const mT = materialFachada(torre.mapa, torre.emi, 14);
    const mP = materialFachada(piso.mapa, piso.emi, 12);
    const mC = materialFachada(casa.mapa, casa.emi, 6.5);
    const mN = materialFachada(nave, null, 3);
    const mL = materialFachada(lisa, null, 1);
    this.matFachadas = [mT, mP, mC];
    this.edificios = {
      torre: instancias(cajaU, mT, 400, true, true),
      piso: instancias(cajaU, mP, 600, true, true),
      casa: instancias(cajaU, mC, 900, true, true),
      nave: instancias(cajaU, mN, 500, true, true),
      lisa: instancias(cajaU, mL, 400, true, true),
    };
    this.tejados = instancias(new THREE.CylinderGeometry(0.01, 0.71, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), new THREE.MeshLambertMaterial(), 900, true, true);

    // Árboles y farolas.
    this.troncos = instancias(new THREE.CylinderGeometry(0.15, 0.22, 1, 6).translate(0, 0.5, 0), mat(0x6d4c41), 2500);
    this.copas = {
      redondo: instancias(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), 2000, true, true),
      pino: instancias(new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ flatShading: true }), 1000, true, true),
      palmera: instancias(new THREE.ConeGeometry(1, 0.5, 6, 1, true).rotateX(Math.PI), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, flatShading: true }), 600, true, true),
      cactus: instancias(new THREE.CapsuleGeometry(0.3, 1.6, 3, 7).translate(0, 1.1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), 800, true, true),
    };
    this.postes = instancias(mergeGeometries([new THREE.CylinderGeometry(0.08, 0.11, 6.5, 6).translate(0, 3.25, 0), caja(0.1, 0.1, 1.2, 0, 6.4, 0.5)])!, mat(0x4b5258), 1500);
    this.lamparas = instancias(caja(0.35, 0.15, 0.5, 0, 6.3, 1.0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 1500, false);
    const texLuz = textura(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,210,140,0.55)');
      g.addColorStop(1, 'rgba(255,210,140,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    });
    const matLuz = new THREE.MeshBasicMaterial({ map: texLuz, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.charcosLuz = instancias(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), matLuz, 1500, false);
    this.charcosLuz.renderOrder = 1;

    // Rampa: cuña con franjas.
    const cuna = new THREE.BufferGeometry();
    const vs = new Float32Array([
      -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0.5, -0.5, 0, -0.5, 0.5, 1, 0.5, -0.5, 1, 0.5,
      -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0.5, -0.5, 0, 0.5, 0.5, 1, 0.5, -0.5, 1, 0.5,
      -0.5, 0, -0.5, -0.5, 1, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0.5,
    ]);
    cuna.setAttribute('position', new THREE.BufferAttribute(vs, 3));
    cuna.computeVertexNormals();
    this.rampas = instancias(cuna, new THREE.MeshLambertMaterial({ color: 0xf5b800, side: THREE.DoubleSide }), 40);

    // Carteles de los servicios y marcadores de entrada.
    this.carteles = {} as Record<Servicio, THREE.InstancedMesh>;
    for (const s of Object.keys(SERVICIOS) as Servicio[]) {
      const info = SERVICIOS[s];
      const tex = textura(256, 64, (c) => {
        c.fillStyle = s === 'hospital' ? '#c62828' : s === 'policia' ? '#0d47a1' : s === 'armeria' ? '#33691e' : s === 'comida' ? '#e65100' : s === 'taller' ? '#ad1457' : '#5d4037';
        c.fillRect(0, 0, 256, 64);
        c.fillStyle = '#fff';
        c.font = 'bold 34px system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(info.nombre.toUpperCase(), 128, 34);
      });
      this.carteles[s] = instancias(new THREE.PlaneGeometry(1, 0.25), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }), 30, false);
    }
    this.marcas = instancias(new THREE.CylinderGeometry(1, 1, 1.2, 20, 1, true).translate(0, 0.6, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }), 60, false, true);
    this.paquetes = instancias(caja(0.5, 0.5, 0.5, 0, 0.6, 0), mat(0x2ecc71, true), 20, false);

    // Coches.
    this.coches = {} as Record<IdVehiculo, ModeloCoche>;
    const matDetalles = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const id of IDS_VEHICULO) {
      const g = geometriasCoche(id);
      this.coches[id] = { pintura: instancias(g.pintura, new THREE.MeshLambertMaterial(), 40, true, true), detalles: instancias(g.detalles, matDetalles, 40) };
    }
    const rueda = unirColoreadas([
      { geo: new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2), color: 0x1b1b1b },
      { geo: caja(1.05, 0.25, 1.3), color: 0x9e9e9e },
    ]);
    this.ruedas = instancias(rueda, matDetalles, 160);
    this.luces = instancias(caja(0.32, 0.13, 0.06), new THREE.MeshBasicMaterial(), 160, false, true);
    const texHaz = textura(64, 128, (c) => {
      const g = c.createRadialGradient(32, 128, 4, 32, 70, 70);
      g.addColorStop(0, 'rgba(255,240,200,0.6)');
      g.addColorStop(1, 'rgba(255,240,200,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 128);
    });
    this.haces = instancias(new THREE.PlaneGeometry(4.5, 9).rotateX(-Math.PI / 2).translate(0, 0, 4.5), new THREE.MeshBasicMaterial({ map: texHaz, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 40, false);
    this.haces.renderOrder = 1;
    this.sirenas = instancias(caja(0.32, 0.14, 0.22), new THREE.MeshBasicMaterial(), 30, false, true);

    // Personas: un avatar horneado por apariencia (16 civiles + policía + banda + rival).
    const looks: Look[] = [];
    for (let i = 0; i < 16; i++) looks.push(randomLook());
    looks.push(LOOKS_EXTRA.policia, LOOKS_EXTRA.banda, LOOKS_EXTRA.rival);
    this.horneados = looks.map((l, i) => hornearAvatar(l, this.matPersonas, i < 16 ? 10 : 16));
    this.armasMano = instancias(caja(0.07, 0.1, 0.45, 0, 0, 0.12), mat(0x222222), 80);

    // Efectos.
    this.trazos = instancias(new THREE.CylinderGeometry(0.015, 0.015, 1, 4), mat(0xfff2b0, true, 0.85), 80, false);
    this.cohetes = instancias(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6).rotateX(Math.PI / 2), mat(0x556b2f), 10);
    this.humo = instancias(new THREE.IcosahedronGeometry(1, 0), mat(0x5a5a5a, false, 0.4), 260, false);
    this.fuego = instancias(new THREE.IcosahedronGeometry(1, 0), mat(0xff8a20, true, 0.85), 160, false);
    this.bolas = instancias(new THREE.IcosahedronGeometry(1, 1), mat(0xffa030, true, 0.7, true), 12, false);
    this.recogibles = {
      dinero: instancias(caja(0.5, 0.06, 0.25), mat(0x43a047), 60, false),
      arma: instancias(caja(0.12, 0.12, 0.55), mat(0x37474f), 30, false),
      vida: instancias(new THREE.OctahedronGeometry(0.28), mat(0xe53935), 20, false),
      chaleco: instancias(caja(0.45, 0.5, 0.15), mat(0x1e88e5), 20, false),
    };

    for (const m of [this.lotes, ...Object.values(this.edificios), this.tejados, this.troncos, ...Object.values(this.copas), this.postes, this.lamparas, this.charcosLuz, this.rampas,
      ...Object.values(this.carteles), this.marcas, this.paquetes, ...Object.values(this.coches).flatMap((c) => [c.pintura, c.detalles]), this.ruedas, this.luces, this.haces, this.sirenas,
      ...this.horneados.flatMap((h) => [h.cuerpo, h.brazos]), this.armasMano, this.trazos, this.cohetes, this.humo, this.fuego, this.bolas, ...Object.values(this.recogibles)]) {
      this.escena.add(m);
    }
    this.heli.grupo.visible = false;
    this.escena.add(this.heli.grupo, this.camara);
  }

  /** Tamaño del mapa de sombras según la calidad (0 = sin sombras). */
  sombras(tam: number) {
    if (tam === this.tamSombras) return;
    this.tamSombras = tam;
    this.renderer.shadowMap.enabled = tam > 0;
    if (tam > 0) {
      this.sol.shadow.mapSize.set(tam, tam);
      this.sol.shadow.map?.dispose();
      this.sol.shadow.map = null;
    }
    this.escena.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
  }

  ajustar(ancho: number, alto: number, dpr: number) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(ancho, alto, false);
    this.camara.aspect = ancho / alto;
    this.camara.updateProjectionMatrix();
  }

  /* ---------- Ciudad ---------- */

  /** Rehace las instancias de la ciudad con las celdas cercanas a la cámara. */
  private construirCiudad(p: Partida, radio: number) {
    const cx = Math.floor(this.camara.position.x / CELDA);
    const cz = Math.floor(this.camara.position.z / CELDA);
    const clave = `${cx},${cz},${radio}`;
    if (clave === this.celdaActual) return;
    this.celdaActual = clave;
    const r = Math.ceil(radio / CELDA);
    const celdas: Celda[] = [];
    for (let i = cx - r; i <= cx + r; i++) for (let k = cz - r; k <= cz + r; k++) celdas.push(p.ciudad.celda(i, k));
    this.celdasVisibles = celdas;

    const poner = (m: THREE.InstancedMesh, matriz: THREE.Matrix4, color?: number) => {
      if (m.count >= m.instanceMatrix.count) return;
      m.setMatrixAt(m.count, matriz);
      if (color !== undefined && m.instanceColor) m.setColorAt(m.count, col.set(color));
      m.count++;
    };
    const todas = [this.lotes, ...Object.values(this.edificios), this.tejados, this.troncos, ...Object.values(this.copas), this.postes, this.lamparas, this.charcosLuz, this.rampas, ...Object.values(this.carteles)];
    for (const m of todas) m.count = 0;
    this.marcasDatos = [];
    const lado = CELDA - 2 * BORDE;
    for (const c of celdas) {
      const ox = c.i * CELDA;
      const oz = c.k * CELDA;
      poner(this.lotes, m4.compose(v3.set(ox + CELDA / 2, 0.03, oz + CELDA / 2), q.identity(), s3.set(lado, 1, lado)), DISTRITOS[c.distrito].suelo);
      for (const b of c.bloques) {
        const destino = b.tipo === 'torre' ? this.edificios.torre
          : b.tipo === 'piso' || b.tipo === 'servicio' ? this.edificios.piso
            : b.tipo === 'casa' ? this.edificios.casa
              : b.tipo === 'nave' || b.tipo === 'contenedor' ? this.edificios.nave
                : b.tipo === 'muro' || b.tipo === 'banco' ? this.edificios.lisa : null;
        if (!destino) continue;
        poner(destino, m4.compose(v3.set(b.x, b.y0, b.z), q.identity(), s3.set(b.w, b.y1 - b.y0, b.d)), b.color);
        if (b.techo !== undefined) poner(this.tejados, m4.compose(v3.set(b.x, b.y1, b.z), q.identity(), s3.set(b.w * 1.1, 1.8, b.d * 1.1)), b.techo);
      }
      for (const a of c.arboles) {
        const e = a.escala;
        const verde = a.tipo === 'pino' ? 0x2e7d32 : a.tipo === 'cactus' ? 0x558b2f : a.tipo === 'palmera' ? 0x4caf50 : [0x43a047, 0x5cb85c, 0x388e3c][Math.floor(pseudo(a.x * 3 + a.z) * 3)];
        if (a.tipo === 'cactus') {
          poner(this.copas.cactus, m4.compose(v3.set(a.x, 0, a.z), q.identity(), s3.set(e, e, e)), verde);
          continue;
        }
        const alto = a.tipo === 'palmera' ? 6 * e : a.tipo === 'pino' ? 2.2 * e : 2.6 * e;
        poner(this.troncos, m4.compose(v3.set(a.x, 0, a.z), q.identity(), s3.set(e, alto, e)));
        if (a.tipo === 'redondo') poner(this.copas.redondo, m4.compose(v3.set(a.x, alto + 1.2 * e, a.z), q.setFromEuler(e3.set(0, a.x, 0)), s3.set(1.9 * e, 1.6 * e, 1.9 * e)), verde);
        else if (a.tipo === 'pino') poner(this.copas.pino, m4.compose(v3.set(a.x, alto * 0.6, a.z), q.identity(), s3.set(1.6 * e, 4.2 * e, 1.6 * e)), verde);
        else poner(this.copas.palmera, m4.compose(v3.set(a.x, alto + 0.2, a.z), q.identity(), s3.set(2.6 * e, 2 * e, 2.6 * e)), verde);
      }
      for (const f of c.farolas) {
        // El brazo de la farola apunta hacia la calle más cercana.
        const lx = f.x - ox;
        const lz = f.z - oz;
        const dx = lx < CELDA / 2 ? -lx : CELDA - lx;
        const dz = lz < CELDA / 2 ? -lz : CELDA - lz;
        const yaw = Math.abs(dx) < Math.abs(dz) ? Math.atan2(Math.sign(dx), 0) : Math.atan2(0, Math.sign(dz));
        q.setFromEuler(e3.set(0, yaw, 0));
        poner(this.postes, m4.compose(v3.set(f.x, 0, f.z), q, s3.set(1, 1, 1)));
        poner(this.lamparas, m4.compose(v3.set(f.x, 0, f.z), q, s3.set(1, 1, 1)));
        poner(this.charcosLuz, m4.compose(v3.set(f.x + Math.sin(yaw) * 1.6, 0.06, f.z + Math.cos(yaw) * 1.6), q.identity(), s3.set(11, 1, 11)));
      }
      if (c.rampa) {
        const ra = c.rampa;
        poner(this.rampas, m4.compose(v3.set(ra.x, 0, ra.z), q.setFromEuler(e3.set(0, ra.yaw, 0)), s3.set(ra.ancho, ra.alto, ra.largo)));
      }
      if (c.servicio && c.edificioServicio && c.entrada) {
        const b = c.edificioServicio;
        const e = c.entrada;
        const fx = Math.sin(e.yaw);
        const fz = Math.cos(e.yaw);
        const fondo = Math.abs(fx) > 0.5 ? b.w / 2 : b.d / 2;
        const ancho = Math.min(14, (Math.abs(fx) > 0.5 ? b.d : b.w) * 0.8);
        poner(this.carteles[c.servicio], m4.compose(v3.set(b.x + fx * (fondo + 0.08), b.y1 - 1.3, b.z + fz * (fondo + 0.08)), q.setFromEuler(e3.set(0, e.yaw, 0)), s3.set(ancho, ancho, 1)));
        if (c.servicio !== 'hospital' && c.servicio !== 'policia') {
          this.marcasDatos.push({ x: e.x, z: e.z, color: c.servicio === 'taller' ? 0xff4fa0 : c.servicio === 'casa' ? 0x4fd06a : 0xffd23f, r: c.servicio === 'taller' ? 2.6 : 0.9 });
        }
      }
    }
    for (const m of todas) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /* ---------- Dibujo ---------- */

  dibujar(p: Partida, look: Look, op: OpcionesDibujo, dt: number) {
    this.tiempo += dt;
    const j = p.jugador;

    // Cámara.
    const c = p.camara();
    this.camara.position.set(c.x, c.y, c.z);
    this.camara.lookAt(c.x + c.dx, c.y + c.dy, c.z + c.dz);
    const velCoche = j.coche ? Math.hypot(j.coche.vx, j.coche.vz) : 0;
    const fov = 65 + Math.min(14, velCoche * 0.25);
    if (Math.abs(this.camara.fov - fov) > 0.05) {
      this.camara.fov += (fov - this.camara.fov) * Math.min(1, dt * 3);
      this.camara.updateProjectionMatrix();
    }

    // Luz del día, cielo y niebla (de noche, negro puro en el tema oscuro).
    const luz = luzDelDia(p.hora);
    const atardecer = Math.max(0, 1 - Math.abs(luz - 0.45) * 2.6) * (p.hora > 12 ? 1 : 0.7);
    const dia = new THREE.Color(0x9fd0f0);
    const noche = new THREE.Color(op.oscuro ? 0x000000 : 0x0b1530);
    const cielo = noche.clone().lerp(dia, luz).lerp(new THREE.Color(0xf09060), atardecer * 0.6);
    (this.escena.background as THREE.Color).copy(cielo);
    this.fog.color.copy(cielo);
    this.fog.near = op.distancia * 0.35;
    this.fog.far = op.distancia;
    this.hemi.intensity = 0.35 + luz * 1.1;
    this.hemi.color.setHex(luz > 0.3 ? 0xeaf6ff : 0x8090c0);
    this.sol.intensity = 0.25 + luz * 1.5;
    this.sol.color.setHex(atardecer > 0.3 ? 0xffc890 : luz > 0.2 ? 0xfff1d6 : 0x8fa8ff);
    const angSol = ((p.hora - 6) / 12) * Math.PI;
    const ox = this.camara.position.x;
    const oz = this.camara.position.z;
    const pj = p.posJugador();
    this.sol.position.set(pj.x + Math.cos(angSol) * 50 + 15, 60 + Math.max(0, Math.sin(angSol)) * 30, pj.z + 30);
    this.sol.target.position.set(pj.x, 0, pj.z);
    const nocheK = 1 - Math.min(1, luz / 0.35);
    for (const m of this.matFachadas) m.emissiveIntensity = nocheK * 0.9;
    (this.lamparas.material as THREE.MeshBasicMaterial).color.setHex(nocheK > 0.1 ? 0xffe2a8 : 0x9a9a92);
    this.charcosLuz.visible = nocheK > 0.1;
    (this.charcosLuz.material as THREE.MeshBasicMaterial).opacity = nocheK;

    // Suelo que sigue a la cámara (pegado a la rejilla de celdas para que la textura cuadre).
    this.suelo.position.set(Math.round(ox / CELDA) * CELDA, 0, Math.round(oz / CELDA) * CELDA);
    this.construirCiudad(p, op.distancia);
    this.dibujarMarcas(p);

    this.dibujarCoches(p, nocheK, op.efectos, dt);
    this.dibujarPersonas(p, look);
    this.dibujarHelicoptero(p, dt);
    this.dibujarEfectos(p, op.efectos, dt);
    this.renderer.render(this.escena, this.camara);
  }

  private dibujarMarcas(p: Partida) {
    const m = this.marcas;
    m.count = 0;
    const pulso = 1 + Math.sin(this.tiempo * 4) * 0.08;
    for (const d of this.marcasDatos) {
      m.setMatrixAt(m.count, m4.compose(v3.set(d.x, 0, d.z), q.identity(), s3.set(d.r * pulso, 1, d.r * pulso)));
      m.setColorAt(m.count, col.set(d.color));
      m.count++;
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    // Paquetes ocultos sin recoger.
    const pk = this.paquetes;
    pk.count = 0;
    for (const c of this.celdasVisibles) {
      const pq = c.paquete;
      if (!pq || p.g.paquetes.includes(pq.id) || pk.count >= 20) continue;
      pk.setMatrixAt(pk.count++, m4.compose(v3.set(pq.x, Math.sin(this.tiempo * 2) * 0.15, pq.z), q.setFromEuler(e3.set(0, this.tiempo * 1.5, 0)), s3.set(1, 1, 1)));
    }
    pk.instanceMatrix.needsUpdate = true;
  }

  private dibujarCoches(p: Partida, nocheK: number, efectos: boolean, dt: number) {
    for (const id of IDS_VEHICULO) this.coches[id].pintura.count = this.coches[id].detalles.count = 0;
    this.ruedas.count = this.luces.count = this.haces.count = this.sirenas.count = 0;
    const vivos = new Set(p.vehiculos);
    for (const v of this.giroRuedas.keys()) if (!vivos.has(v)) this.giroRuedas.delete(v);
    const destello = Math.floor(this.tiempo * 5) % 2;
    const cx = this.camara.position.x;
    const cz = this.camara.position.z;
    for (const v of p.vehiculos) {
      if (Math.abs(v.x - cx) > 260 || Math.abs(v.z - cz) > 260) continue;
      const d = VEHICULOS[v.tipo];
      const mc = this.coches[v.tipo];
      let st = this.giroRuedas.get(v);
      if (!st) this.giroRuedas.set(v, (st = { giro: 0, pitch: 0 }));
      const vf = v.vx * Math.sin(v.yaw) + v.vz * Math.cos(v.yaw);
      st.giro += (vf * dt) / 0.36;
      const pitchObj = v.enAire ? -Math.atan2(v.vy, Math.max(6, Math.abs(vf))) * 0.6 : -Math.atan2(v.vy, Math.max(4, Math.abs(vf)));
      st.pitch += (pitchObj - st.pitch) * Math.min(1, dt * 8);
      q.setFromEuler(e3.set(st.pitch, v.yaw, v.destruido ? 0.15 : 0, 'YXZ'));
      m5.compose(v3.set(v.x, v.y, v.z), q, s3.set(1, 1, 1));
      const n = mc.pintura.count;
      if (n >= mc.pintura.instanceMatrix.count) continue;
      mc.pintura.setMatrixAt(n, m5);
      mc.pintura.setColorAt(n, col.set(v.destruido ? 0x262626 : v.color));
      mc.detalles.setMatrixAt(n, m5);
      mc.pintura.count++;
      mc.detalles.count++;
      // Ruedas.
      const rx = d.ancho / 2 - 0.12;
      const rz = d.largo / 2 - 0.8;
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
        const giroR = sz > 0 ? -v.ruedas : 0;
        m6.compose(v3.set(sx * rx, 0.36, sz * rz), q.setFromEuler(e3.set(st.giro, giroR, 0, 'YXZ')), s3.set(0.26, 0.36, 0.36));
        this.ruedas.setMatrixAt(this.ruedas.count++, m4.multiplyMatrices(m5, m6));
      }
      if (v.destruido) continue;
      // Faros y pilotos.
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
        m6.compose(v3.set(sx * (d.ancho / 2 - 0.3), v.tipo === 'deportivo' ? 0.6 : 0.78, sz * (d.largo / 2 + 0.02)), q.identity(), s3.set(1, 1, 1));
        this.luces.setMatrixAt(this.luces.count, m4.multiplyMatrices(m5, m6));
        const frenando = v.mandos.frenar > 0 && sz < 0;
        this.luces.setColorAt(this.luces.count++, col.set(sz > 0 ? (nocheK > 0.1 ? 0xfffbe8 : 0xd8d8c8) : frenando || nocheK > 0.1 ? 0xff2020 : 0x8a1010));
      }
      if (nocheK > 0.1 && this.haces.count < 40 && v.conductor) {
        m6.compose(v3.set(0, 0.05 - v.y, d.largo / 2), q.identity(), s3.set(1, 1, 1));
        this.haces.setMatrixAt(this.haces.count++, m4.multiplyMatrices(m5, m6));
      }
      if (v.tipo === 'patrulla') {
        for (const sx of [-1, 1]) {
          m6.compose(v3.set(sx * 0.2, d.alto + 0.12, -0.2), q.identity(), s3.set(1, 1, 1));
          this.sirenas.setMatrixAt(this.sirenas.count, m4.multiplyMatrices(m5, m6));
          const on = v.sirena && (destello === (sx > 0 ? 1 : 0));
          this.sirenas.setColorAt(this.sirenas.count++, col.set(sx > 0 ? (on ? 0xff2a2a : 0x551010) : on ? 0x2a6aff : 0x101a55));
        }
      }
      // Humo y fuego del coche dañado.
      if (efectos && (v.vida < d.vida * 0.3 || v.ardiendo >= 0) && Math.random() < dt * (v.ardiendo >= 0 ? 30 : 8)) {
        const fx = Math.sin(v.yaw) * (d.largo / 2 - 0.6);
        const fz = Math.cos(v.yaw) * (d.largo / 2 - 0.6);
        this.particulas.push({ x: v.x + fx, y: v.y + d.alto * 0.7, z: v.z + fz, vy: 1.5 + Math.random(), t: 0, vida: 1.4, fuego: v.ardiendo >= 0 && Math.random() < 0.6, tam: 0.4 + Math.random() * 0.3 });
      }
    }
    for (const m of [...IDS_VEHICULO.flatMap((id) => [this.coches[id].pintura, this.coches[id].detalles]), this.ruedas, this.luces, this.haces, this.sirenas]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /** Índice del avatar horneado de cada persona. */
  private horneadoDe(per: Persona): Horneado {
    const i = per.tipo === 'policia' ? 16 : per.tipo === 'banda' ? 17 : per.tipo === 'rival' ? 18 : per.apariencia % 16;
    return this.horneados[i];
  }

  private dibujarPersonas(p: Partida, look: Look) {
    for (const h of this.horneados) h.cuerpo.count = h.brazos.count = 0;
    this.armasMano.count = 0;
    const cx = this.camara.position.x;
    const cz = this.camara.position.z;
    for (const per of p.personas) {
      if (per === p.jugador || per.estado === 'coche') continue;
      if (Math.abs(per.cuerpo.x - cx) > 140 || Math.abs(per.cuerpo.z - cz) > 140) continue;
      const h = this.horneadoDe(per);
      if (h.cuerpo.count >= h.cuerpo.instanceMatrix.count) continue;
      const t = this.tiempo + per.id;
      const tumbado = per.estado === 'caido' || per.estado === 'muerto';
      // Cuerpo: balanceo al andar (como animateWalk).
      const frec = per.corriendo ? 15 : 11;
      const bob = per.moviendose && !tumbado ? Math.abs(Math.sin(t * frec)) * 0.08 : 0;
      const sway = per.moviendose && !tumbado ? Math.sin(t * frec) * 0.06 : 0;
      q.setFromEuler(e3.set(tumbado ? -Math.PI / 2 : 0, per.yaw, 0, 'YXZ'));
      m5.compose(v3.set(per.cuerpo.x, per.cuerpo.y + (tumbado ? 0.25 : 0), per.cuerpo.z), q, s3.set(1, 1, 1));
      m6.compose(v3.set(0, bob, 0), q.setFromEuler(e3.set(0, 0, sway)), s3.setScalar(h.escala));
      const cuerpo = m4.multiplyMatrices(m5, m6);
      h.cuerpo.setMatrixAt(h.cuerpo.count++, cuerpo);
      const armado = per.arma !== 'punos' && per.arma !== 'bate';
      const atacando = per.ataqueT < 0.25 && !tumbado;
      for (let i = 0; i < 2; i++) {
        const lado = i === 0 ? -1 : 1;
        let rx = per.moviendose && !tumbado ? Math.sin(t * frec + i * Math.PI) * (per.corriendo ? 0.9 : 0.6) : 0;
        let rz = lado * 0.12;
        if (per.manosArriba) {
          rx = Math.PI;
          rz = lado * 0.25;
        } else if (armado && (per.ia.modo === 'atacar' || atacando)) {
          // El brazo 0 es el derecho (lleva el arma); el izquierdo la sujeta por delante.
          rx = i === 0 ? -1.45 : -1.2;
          if (i === 1) rz = -0.45;
        } else if (atacando && i === 0) rx = -1.6;
        const pb = h.posBrazos[i];
        m6.compose(pb, q.setFromEuler(e3.set(rx, 0, rz)), s3.set(1, 1, 1));
        const brazo = new THREE.Matrix4().multiplyMatrices(cuerpo, m6);
        h.brazos.setMatrixAt(h.brazos.count++, brazo);
        if (i === 0 && armado && this.armasMano.count < 80) {
          m6.compose(v3.set(0, -0.42, 0.05), q.setFromEuler(e3.set(Math.PI / 2, 0, 0)), s3.set(1, 1, per.arma === 'pistola' ? 0.6 : 1.4));
          this.armasMano.setMatrixAt(this.armasMano.count++, m4.multiplyMatrices(brazo, m6));
        }
      }
    }
    for (const h of this.horneados) {
      h.cuerpo.instanceMatrix.needsUpdate = true;
      h.brazos.instanceMatrix.needsUpdate = true;
    }
    this.armasMano.instanceMatrix.needsUpdate = true;
    this.dibujarJugador(p, look);
  }

  private dibujarJugador(p: Partida, look: Look) {
    const clave = JSON.stringify(look);
    if (clave !== this.lookActual || !this.jugador) {
      if (this.jugador) {
        this.escena.remove(this.jugador.grupo);
        liberar(this.jugador.grupo);
      }
      const a = createAvatar(look);
      this.jugador = { grupo: a.group, cuerpo: a.body, brazos: a.body.userData.arms as THREE.Object3D[], arma: '', armaMalla: null };
      this.escena.add(a.group);
      this.lookActual = clave;
    }
    const m = this.jugador;
    const j = p.jugador;
    m.grupo.visible = j.estado !== 'coche';
    if (!m.grupo.visible) return;
    // Arma en la mano.
    if (m.arma !== p.armaActual) {
      if (m.armaMalla) {
        m.brazos[0].remove(m.armaMalla);
        liberar(m.armaMalla);
      }
      m.armaMalla = modeloArma(p.armaActual);
      m.armaMalla.position.set(0, -0.42, 0.05);
      m.armaMalla.rotation.x = Math.PI / 2;
      m.brazos[0].add(m.armaMalla);
      m.arma = p.armaActual;
    }
    const tumbado = j.estado === 'caido' || j.estado === 'muerto';
    m.grupo.position.set(j.cuerpo.x, j.cuerpo.y + (tumbado ? 0.25 : 0), j.cuerpo.z);
    m.grupo.rotation.set(tumbado ? -Math.PI / 2 : 0, j.yaw, 0, 'YXZ');
    animateWalk(m.cuerpo, this.tiempo * (j.corriendo ? 1.4 : 1), j.moviendose && !tumbado);
    // brazos[0] está en x negativa: es el derecho (el modelo mira hacia +z).
    const [der, izq] = m.brazos;
    der.rotation.z = -0.12;
    izq.rotation.z = 0.12;
    const apuntando = (p.objetivo || j.ataqueT < 0.3) && p.armaActual !== 'punos' && p.armaActual !== 'bate';
    if (j.manosArriba) {
      izq.rotation.x = der.rotation.x = Math.PI;
    } else if (apuntando) {
      const pitch = p.objetivo ? 0 : -p.camPitch * 0.8;
      der.rotation.x = -1.45 + pitch;
      izq.rotation.x = -1.2 + pitch;
      izq.rotation.z = -0.45;
      der.rotation.z = 0;
    } else if (j.ataqueT < 0.2) {
      der.rotation.x = p.armaActual === 'bate' ? -2.4 + j.ataqueT * 8 : -1.6;
    }
  }

  private dibujarHelicoptero(p: Partida, dt: number) {
    const h = p.helicoptero;
    const g = this.heli.grupo;
    g.visible = !!h;
    if (!h) return;
    g.position.set(h.x, h.y, h.z);
    g.rotation.set(h.destruido ? 0.3 : 0.12, h.yaw, 0, 'YXZ');
    this.heli.rotor.rotation.y += dt * (h.destruido ? 8 : 28);
    this.heli.cola.rotation.x += dt * 30;
    if (h.destruido && Math.random() < dt * 20) this.particulas.push({ x: h.x, y: h.y, z: h.z, vy: 1, t: 0, vida: 1.5, fuego: Math.random() < 0.5, tam: 0.8 });
  }

  private dibujarEfectos(p: Partida, efectos: boolean, dt: number) {
    // Trazos de bala.
    const tr = this.trazos;
    tr.count = 0;
    for (const t of p.trazos) {
      if (tr.count >= 80) break;
      const a = v3.set(t.x0, t.y0, t.z0);
      const b = this.vp.set(t.x1, t.y1, t.z1);
      const largo = a.distanceTo(b);
      if (largo < 0.01) continue;
      const centro = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      q.setFromUnitVectors(ARRIBA, b.sub(a).normalize());
      tr.setMatrixAt(tr.count++, m4.compose(centro, q, s3.set(1, largo, 1)));
    }
    tr.instanceMatrix.needsUpdate = true;
    // Cohetes.
    const co = this.cohetes;
    co.count = 0;
    for (const c of p.cohetes) {
      q.setFromEuler(e3.set(-Math.atan2(c.vy, Math.hypot(c.vx, c.vz)), Math.atan2(c.vx, c.vz), 0, 'YXZ'));
      co.setMatrixAt(co.count++, m4.compose(v3.set(c.x, c.y, c.z), q, s3.set(1, 1, 1)));
      if (efectos) this.particulas.push({ x: c.x, y: c.y, z: c.z, vy: 0.3, t: 0, vida: 0.8, fuego: false, tam: 0.25 });
    }
    co.instanceMatrix.needsUpdate = true;
    // Explosiones: bola de fuego y humo.
    const bo = this.bolas;
    bo.count = 0;
    for (const e of p.explosiones) {
      const k = Math.min(1, e.t / 0.35);
      if (e.t < 0.6 && bo.count < 12) bo.setMatrixAt(bo.count++, m4.compose(v3.set(e.x, e.y, e.z), q.identity(), s3.setScalar(1 + k * 5 * (1 - Math.max(0, e.t - 0.35) * 2))));
      if (efectos && e.t < 0.4) {
        for (let i = 0; i < 3; i++) this.particulas.push({ x: e.x + (Math.random() - 0.5) * 3, y: e.y + Math.random() * 2, z: e.z + (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 2, t: 0, vida: 1.6, fuego: Math.random() < 0.4, tam: 0.8 + Math.random() });
      }
    }
    bo.instanceMatrix.needsUpdate = true;
    // Partículas.
    const hu = this.humo;
    const fu = this.fuego;
    hu.count = fu.count = 0;
    for (const pa of this.particulas) {
      pa.t += dt;
      pa.y += pa.vy * dt;
      const k = pa.t / pa.vida;
      const tam = pa.tam * (0.5 + k * (pa.fuego ? 0.5 : 1.3));
      const m = pa.fuego ? fu : hu;
      if (m.count >= m.instanceMatrix.count) continue;
      m.setMatrixAt(m.count++, m4.compose(v3.set(pa.x, pa.y, pa.z), q.identity(), s3.setScalar(tam)));
    }
    this.particulas = this.particulas.filter((pa) => pa.t < pa.vida).slice(-400);
    hu.instanceMatrix.needsUpdate = true;
    fu.instanceMatrix.needsUpdate = true;
    // Recogibles.
    for (const m of Object.values(this.recogibles)) m.count = 0;
    for (const r of p.recogibles) {
      const m = this.recogibles[r.tipo];
      if (m.count >= m.instanceMatrix.count) continue;
      m.setMatrixAt(m.count++, m4.compose(v3.set(r.x, r.y + 0.45 + Math.sin(this.tiempo * 3 + r.id) * 0.1, r.z), q.setFromEuler(e3.set(0, this.tiempo * 2 + r.id, 0)), s3.set(1, 1, 1)));
    }
    for (const m of Object.values(this.recogibles)) m.instanceMatrix.needsUpdate = true;
  }

  /** Proyecta un punto del mundo a la pantalla. */
  proyectar(x: number, y: number, z: number, ancho: number, alto: number): { x: number; y: number; visible: boolean } {
    const v = this.vp.set(x, y, z).project(this.camara);
    return { x: ((v.x + 1) / 2) * ancho, y: ((1 - v.y) / 2) * alto, visible: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  }
}

export { Partida };
