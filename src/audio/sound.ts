/**
 * Tiny Web Audio sound engine — all effects are synthesised (no asset files),
 * so there's nothing to bundle or download. Purely a client/render concern;
 * the sim never touches it.
 *
 * Cues are triggered from the typed event stream, drained each frame by the
 * renderer. The AudioContext is created lazily and resumed on first use (which
 * always follows a user gesture — picking a play), so autoplay policies are
 * satisfied without any special handling.
 */
export type SoundCue = "snap" | "catch" | "hit" | "whistle" | "cheer" | "turnover";

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  play(cue: SoundCue): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    switch (cue) {
      case "snap":
        this.tone(150, 0.09, "square", 0.16);
        this.tone(90, 0.13, "sine", 0.12);
        break;
      case "catch":
        this.tone(540, 0.06, "triangle", 0.12);
        break;
      case "hit":
        this.thud(0.14, 0.3);
        break;
      case "whistle":
        this.tone(2350, 0.13, "square", 0.06);
        this.tone(2500, 0.12, "square", 0.05, 0.05);
        break;
      case "turnover":
        this.tone(320, 0.18, "sawtooth", 0.1);
        this.tone(220, 0.22, "sawtooth", 0.1, 0.16);
        break;
      case "cheer":
        this.crowd(1.2, 0.22);
        break;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private getNoise(): AudioBuffer {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      const len = ctx.sampleRate * 1.4;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      // Deterministic-ish noise (no Math.random dependency needed for audio).
      let s = 1;
      for (let i = 0; i < len; i++) {
        s = (s * 16807) % 2147483647;
        data[i] = (s / 1073741823.5) - 1;
      }
      this.noiseBuf = buf;
    }
    return this.noiseBuf;
  }

  private thud(dur: number, gain: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoise();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master!);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  private crowd(dur: number, gain: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoise();
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = 900;
    filt.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.25);
    g.gain.linearRampToValueAtTime(gain * 0.8, t0 + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master!);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }
}

export const sound = new SoundManager();
