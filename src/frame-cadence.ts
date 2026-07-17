export const SLOW_FRAME_MS = 25;
export const MISSED_REFRESH_MS = 1000 / 30;
export const MAX_SLOW_FRAME_RATE = 0.001;

export interface FrameCadenceSnapshot {
  samples: number;
  frameP95Ms: number;
  frameP99Ms: number;
  frameMaxMs: number;
  framesOver25Ms: number;
  framesOver33Ms: number;
  rateOver25Ms: number;
  rateOver33Ms: number;
}

function percentileFromSorted(values: Float32Array, length: number, fraction: number): number {
  if (length === 0) return 0;
  return values[Math.min(length - 1, Math.floor((length - 1) * fraction))] ?? 0;
}

export class FrameCadenceTracker {
  private readonly values: Float32Array;
  private readonly ordered: Float32Array;
  private writeIndex = 0;
  private sampleCount = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error('Frame cadence capacity must be positive');
    this.values = new Float32Array(capacity);
    this.ordered = new Float32Array(capacity);
  }

  get count(): number {
    return this.sampleCount;
  }

  add(frameMs: number): void {
    if (!Number.isFinite(frameMs) || frameMs < 0) return;
    this.values[this.writeIndex] = frameMs;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    this.sampleCount = Math.min(this.sampleCount + 1, this.capacity);
  }

  reset(): void {
    this.writeIndex = 0;
    this.sampleCount = 0;
  }

  snapshot(): FrameCadenceSnapshot {
    let framesOver25Ms = 0;
    let framesOver33Ms = 0;
    let frameMaxMs = 0;
    for (let index = 0; index < this.sampleCount; index++) {
      const value = this.values[index] ?? 0;
      this.ordered[index] = value;
      frameMaxMs = Math.max(frameMaxMs, value);
      if (value >= SLOW_FRAME_MS) framesOver25Ms++;
      if (value >= MISSED_REFRESH_MS) framesOver33Ms++;
    }
    this.ordered.subarray(0, this.sampleCount).sort();
    return {
      samples: this.sampleCount,
      frameP95Ms: percentileFromSorted(this.ordered, this.sampleCount, 0.95),
      frameP99Ms: percentileFromSorted(this.ordered, this.sampleCount, 0.99),
      frameMaxMs,
      framesOver25Ms,
      framesOver33Ms,
      rateOver25Ms: this.sampleCount === 0 ? 0 : framesOver25Ms / this.sampleCount,
      rateOver33Ms: this.sampleCount === 0 ? 0 : framesOver33Ms / this.sampleCount,
    };
  }
}

export function passesSixtyHertzCadence(snapshot: FrameCadenceSnapshot): boolean {
  return (
    snapshot.samples > 0 &&
    snapshot.framesOver33Ms === 0 &&
    snapshot.rateOver25Ms <= MAX_SLOW_FRAME_RATE
  );
}
