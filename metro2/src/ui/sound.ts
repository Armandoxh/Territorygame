/** The v2 sound desk — tiny synthesized cues, zero assets. WebAudio
 * unlocks on the first user gesture (iOS law); everything is short,
 * quiet, and layered under the UI so it reads as texture, not noise.
 * Mute persists in localStorage.
 */

const MUTE_KEY = 'metro2_mute';

class SoundDesk {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
    // iOS unlocks audio only inside a user gesture — arm on the first.
    const unlock = () => {
      this.ensure();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* fine */
    }
    return this.muted;
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  /** One enveloped tone. */
  private tone(
    freq: number,
    dur: number,
    opts: { type?: OscillatorType; gain?: number; at?: number; slideTo?: number } = {},
  ): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + (opts.at ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(opts.gain ?? 0.5, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** A purchase lands: turnstile click + coin blip. */
  buy(): void {
    this.tone(2600, 0.03, { type: 'square', gain: 0.12 });
    this.tone(1245, 0.09, { type: 'triangle', gain: 0.35, at: 0.02 });
    this.tone(1865, 0.12, { type: 'triangle', gain: 0.28, at: 0.055 });
  }

  /** A commendation: two-note station chime. */
  chime(): void {
    this.tone(880, 0.35, { type: 'sine', gain: 0.4 });
    this.tone(1318, 0.5, { type: 'sine', gain: 0.35, at: 0.12 });
    this.tone(1760, 0.6, { type: 'sine', gain: 0.15, at: 0.24 });
  }

  /** The night rush opens: a low platform bell. */
  bell(): void {
    this.tone(392, 0.7, { type: 'triangle', gain: 0.4 });
    this.tone(587, 0.55, { type: 'sine', gain: 0.2, at: 0.05 });
    this.tone(392, 0.8, { type: 'triangle', gain: 0.25, at: 0.35 });
  }

  /** Collecting the away earnings: a little coin cascade. */
  collect(): void {
    const steps = [988, 1175, 1480, 1760, 2093];
    steps.forEach((f, i) =>
      this.tone(f, 0.16, { type: 'triangle', gain: 0.3, at: i * 0.055 }),
    );
  }
}

export const sound = new SoundDesk();
