import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/** Tiny synthesized sound effects – no audio assets needed. */
class Sound {
  private ctx: AudioContext | null = null;
  enabled = true;

  /** Must be called from a user gesture to unlock audio on mobile. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.18, slideTo?: number) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  pickUp() {
    this.tone(520, 0, 0.06, 'triangle', 0.08);
  }

  place() {
    this.tone(180, 0, 0.09, 'triangle', 0.25, 120);
  }

  invalid() {
    this.tone(140, 0, 0.12, 'square', 0.05, 100);
  }

  clear(lines: number, combo: number) {
    const base = 440 * Math.pow(2, Math.min(combo - 1, 8) / 12);
    const steps = [0, 4, 7, 12, 16, 19];
    for (let i = 0; i < Math.min(2 + lines, steps.length); i++) {
      this.tone(base * Math.pow(2, steps[i] / 12), i * 0.06, 0.18, 'sine', 0.16);
    }
  }

  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, i * 0.16, 0.3, 'triangle', 0.15));
  }
}

export const sound = new Sound();

const native = Capacitor.isNativePlatform();

function vibrate(ms: number) {
  if ('vibrate' in navigator) navigator.vibrate(ms);
}

export const haptics = {
  light() {
    if (native) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    else vibrate(10);
  },
  medium() {
    if (native) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    else vibrate(20);
  },
  heavy() {
    if (native) void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
    else vibrate(40);
  },
  error() {
    if (native) void Haptics.notification({ type: NotificationType.Error }).catch(() => {});
    else vibrate(80);
  },
};
