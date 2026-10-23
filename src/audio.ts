/** Sonido sintetizado con WebAudio (sin archivos): efectos, motor, sirena y la radio del coche. */
type Efecto = 'disparo' | 'escopeta' | 'golpe' | 'muerte' | 'explosion' | 'nivel' | 'recoger' | 'boton' | 'dano' | 'choque' | 'puerta' | 'claxon' | 'estrella';

const DEFS: Record<Efecto, { tipo: OscillatorType; f0: number; f1: number; dur: number; vol: number; ruido?: boolean }> = {
  disparo: { tipo: 'square', f0: 520, f1: 90, dur: 0.09, vol: 0.09, ruido: true },
  escopeta: { tipo: 'sawtooth', f0: 220, f1: 40, dur: 0.22, vol: 0.14, ruido: true },
  golpe: { tipo: 'triangle', f0: 260, f1: 90, dur: 0.08, vol: 0.14 },
  muerte: { tipo: 'sawtooth', f0: 220, f1: 50, dur: 0.25, vol: 0.1 },
  explosion: { tipo: 'sawtooth', f0: 110, f1: 25, dur: 0.7, vol: 0.28, ruido: true },
  nivel: { tipo: 'sine', f0: 520, f1: 1040, dur: 0.35, vol: 0.15 },
  recoger: { tipo: 'sine', f0: 900, f1: 1500, dur: 0.1, vol: 0.09 },
  boton: { tipo: 'sine', f0: 600, f1: 700, dur: 0.05, vol: 0.08 },
  dano: { tipo: 'square', f0: 160, f1: 80, dur: 0.15, vol: 0.13 },
  choque: { tipo: 'square', f0: 140, f1: 40, dur: 0.25, vol: 0.18, ruido: true },
  puerta: { tipo: 'triangle', f0: 180, f1: 120, dur: 0.08, vol: 0.12 },
  claxon: { tipo: 'square', f0: 400, f1: 395, dur: 0.35, vol: 0.08 },
  estrella: { tipo: 'square', f0: 880, f1: 660, dur: 0.18, vol: 0.07 },
};

export const EMISORAS = [
  { nombre: 'Ritmo FM', estilo: 'hiphop' },
  { nombre: 'Ruta 88 Rock', estilo: 'rock' },
  { nombre: 'Brisa Clásica', estilo: 'clasica' },
] as const;

const nota = (base: number, semitonos: number) => base * 2 ** (semitonos / 12);

class Audio {
  private ctx: AudioContext | null = null;
  /** 0 a 1: volumen general × volumen de efectos. */
  volumen = 0.5;
  /** 0 a 1: volumen general × volumen de la música (radio). */
  volumenMusica = 0.35;
  private motorOsc: OscillatorNode | null = null;
  private motorGan: GainNode | null = null;
  private motorFiltro: BiquadFilterNode | null = null;
  private sirenaOsc: OscillatorNode | null = null;
  private sirenaGan: GainNode | null = null;
  private emisora = -1;
  private paso = 0;
  private proxima = 0;
  private reloj: ReturnType<typeof setInterval> | null = null;
  private ruidoBuf: AudioBuffer | null = null;

  iniciar() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null;
    }
  }

  private ruido(ctx: AudioContext): AudioBuffer {
    if (!this.ruidoBuf) {
      this.ruidoBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const datos = this.ruidoBuf.getChannelData(0);
      for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;
    }
    return this.ruidoBuf;
  }

  /** `factor` baja el volumen (p. ej. disparos lejanos). */
  efecto(nombre: Efecto, factor = 1) {
    const ctx = this.ctx;
    if (!ctx || this.volumen <= 0 || ctx.state !== 'running' || factor < 0.02) return;
    const d = DEFS[nombre];
    const t = ctx.currentTime;
    const gan = ctx.createGain();
    gan.gain.setValueAtTime(Math.max(0.0002, d.vol * this.volumen * Math.min(1, factor)), t);
    gan.gain.exponentialRampToValueAtTime(0.0001, t + d.dur);
    gan.connect(ctx.destination);
    if (d.ruido) {
      const src = ctx.createBufferSource();
      src.buffer = this.ruido(ctx);
      src.connect(gan);
      src.start(t, Math.random() * 0.5, d.dur);
    }
    const osc = ctx.createOscillator();
    osc.type = d.tipo;
    osc.frequency.setValueAtTime(d.f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, d.f1), t + d.dur);
    osc.connect(gan);
    osc.start(t);
    osc.stop(t + d.dur);
  }

  /** Motor del coche del jugador: `rpm` de 0 a 1; null lo apaga. */
  motor(rpm: number | null) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (rpm === null || this.volumen <= 0) {
      if (this.motorGan) this.motorGan.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      return;
    }
    if (!this.motorOsc) {
      this.motorOsc = ctx.createOscillator();
      this.motorOsc.type = 'sawtooth';
      this.motorFiltro = ctx.createBiquadFilter();
      this.motorFiltro.type = 'lowpass';
      this.motorGan = ctx.createGain();
      this.motorGan.gain.value = 0;
      this.motorOsc.connect(this.motorFiltro).connect(this.motorGan).connect(ctx.destination);
      this.motorOsc.start();
    }
    const t = ctx.currentTime;
    this.motorOsc.frequency.setTargetAtTime(38 + rpm * 110, t, 0.05);
    this.motorFiltro!.frequency.setTargetAtTime(300 + rpm * 900, t, 0.05);
    this.motorGan!.gain.setTargetAtTime(0.05 * this.volumen, t, 0.05);
  }

  /** Sirena de policía cercana: intensidad de 0 a 1. */
  sirena(intensidad: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (!this.sirenaOsc) {
      this.sirenaOsc = ctx.createOscillator();
      this.sirenaOsc.type = 'triangle';
      this.sirenaGan = ctx.createGain();
      this.sirenaGan.gain.value = 0;
      this.sirenaOsc.connect(this.sirenaGan).connect(ctx.destination);
      this.sirenaOsc.start();
    }
    const t = ctx.currentTime;
    this.sirenaOsc.frequency.setTargetAtTime(Math.floor(t * 1.6) % 2 ? 700 : 950, t, 0.03);
    this.sirenaGan!.gain.setTargetAtTime(0.04 * intensidad * this.volumen, t, 0.1);
  }

  /** Enciende una emisora (índice de EMISORAS) o apaga la radio con -1. */
  radio(emisora: number) {
    if (emisora === this.emisora) return;
    this.emisora = emisora;
    if (this.reloj) clearInterval(this.reloj);
    this.reloj = null;
    const ctx = this.ctx;
    if (emisora < 0 || !ctx) return;
    this.paso = 0;
    this.proxima = ctx.currentTime + 0.1;
    this.reloj = setInterval(() => this.programar(), 60);
  }

  get emisoraActual() {
    return this.emisora;
  }

  /** Programa las notas de la radio con un poco de antelación. */
  private programar() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.emisora < 0) return;
    const estilo = EMISORAS[this.emisora].estilo;
    const bpm = estilo === 'hiphop' ? 88 : estilo === 'rock' ? 132 : 76;
    const semi = 60 / bpm / 4;
    while (this.proxima < ctx.currentTime + 0.25) {
      if (this.volumenMusica > 0) this.tocarPaso(ctx, estilo, this.paso, this.proxima, semi);
      this.paso++;
      this.proxima += semi;
    }
  }

  private tono(ctx: AudioContext, tipo: OscillatorType, f: number, t: number, dur: number, vol: number) {
    const gan = ctx.createGain();
    gan.gain.setValueAtTime(0.0001, t);
    gan.gain.linearRampToValueAtTime(vol * this.volumenMusica, t + 0.01);
    gan.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    gan.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = tipo;
    osc.frequency.setValueAtTime(f, t);
    osc.connect(gan);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private golpe(ctx: AudioContext, t: number, tipo: 'bombo' | 'caja' | 'platillo', vol: number) {
    if (tipo === 'bombo') {
      const gan = ctx.createGain();
      gan.gain.setValueAtTime(vol * this.volumenMusica, t);
      gan.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      gan.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);
      osc.connect(gan);
      osc.start(t);
      osc.stop(t + 0.26);
      return;
    }
    const dur = tipo === 'caja' ? 0.15 : 0.04;
    const gan = ctx.createGain();
    gan.gain.setValueAtTime(vol * this.volumenMusica, t);
    gan.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const filtro = ctx.createBiquadFilter();
    filtro.type = tipo === 'caja' ? 'bandpass' : 'highpass';
    filtro.frequency.value = tipo === 'caja' ? 1800 : 7000;
    const src = ctx.createBufferSource();
    src.buffer = this.ruido(ctx);
    src.connect(filtro).connect(gan).connect(ctx.destination);
    src.start(t, Math.random() * 0.5, dur);
  }

  private tocarPaso(ctx: AudioContext, estilo: string, paso: number, t: number, semi: number) {
    const s = paso % 16;
    const compas = Math.floor(paso / 16) % 4;
    if (estilo === 'hiphop') {
      // La menor: i - VI - III - VII.
      const raiz = [0, -4, 3, -2][compas];
      const base = 110;
      if (s === 0 || s === 7 || s === 10) this.golpe(ctx, t, 'bombo', 0.5);
      if (s === 4 || s === 12) this.golpe(ctx, t, 'caja', 0.3);
      if (s % 2 === 0) this.golpe(ctx, t, 'platillo', s % 4 === 2 ? 0.12 : 0.07);
      if (s === 0 || s === 7 || s === 10) this.tono(ctx, 'sine', nota(base / 2, raiz), t, semi * 3, 0.32);
      if (s === 2 || s === 6 || s === 14) for (const i of [0, 3, 7]) this.tono(ctx, 'triangle', nota(base * 2, raiz + i), t, semi * 1.6, 0.05);
      if (compas % 2 === 1 && s % 4 === 3) this.tono(ctx, 'square', nota(base * 4, raiz + [0, 3, 5, 7, 10][(paso >> 2) % 5]), t, semi, 0.025);
    } else if (estilo === 'rock') {
      // Mi: I - VII - VI - VII con quintas.
      const raiz = [0, -2, -4, -2][compas];
      const base = 82.4;
      if (s % 8 === 0 || s === 11) this.golpe(ctx, t, 'bombo', 0.5);
      if (s % 8 === 4) this.golpe(ctx, t, 'caja', 0.35);
      if (s % 2 === 0) this.golpe(ctx, t, 'platillo', 0.08);
      if (s % 2 === 0) {
        this.tono(ctx, 'sawtooth', nota(base, raiz), t, semi * 1.8, 0.07);
        this.tono(ctx, 'sawtooth', nota(base, raiz + 7), t, semi * 1.8, 0.05);
      }
      if (compas === 3 && s >= 8 && s % 2 === 1) this.tono(ctx, 'square', nota(base * 4, raiz + [0, 3, 5, 7][(s >> 1) % 4]), t, semi * 1.5, 0.03);
    } else {
      // Do: I - vi - IV - V en arpegios.
      const acorde = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]][compas];
      const base = 261.6;
      const n = acorde[s % 3] + (s % 6 >= 3 ? 12 : 0);
      this.tono(ctx, 'triangle', nota(base, n), t, semi * 2.5, 0.06);
      if (s === 0) this.tono(ctx, 'sine', nota(base / 2, acorde[0]), t, semi * 15, 0.12);
      if (s === 8 || s === 12) this.tono(ctx, 'sine', nota(base * 2, acorde[2] + 12), t, semi * 4, 0.035);
    }
  }
}

export const audio = new Audio();
