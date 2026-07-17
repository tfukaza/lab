import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { perlinNoise2D } from './blade-patch-noise.js';

export interface GroundColorSettings {
  baseColor: string;
  highlightColor: string;
  accentColor: string;
  patchSize: number;
  accentPatchSize: number;
  accentStrength: number;
  octaves: number;
  detailScale: number;
  detailStrength: number;
}

const GROUND_SEED_SALT = 0x9e3779b9;
const ACCENT_SEED_SALT = 0x85ebca6b;
const DETAIL_SEED_SALT = 0xc2b2ae35;

interface LinearColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Precomputed palette so per-sample work is pure noise + lerps. The same
 * sampler fills the ground albedo texture AND tints blade instances, which is
 * what keeps grass patches pixel-aligned with the ground they stand on.
 */
export interface GroundColorSampler {
  sample(x: number, z: number): LinearColor;
  /** The raw fractal patch field in [0,1] that drives the base/highlight mix. */
  samplePatches(x: number, z: number): number;
}

export function createGroundColorSampler(seed: number, settings: GroundColorSettings): GroundColorSampler {
  const base = Color3.FromHexString(settings.baseColor).toLinearSpace();
  const highlight = Color3.FromHexString(settings.highlightColor).toLinearSpace();
  const accent = Color3.FromHexString(settings.accentColor).toLinearSpace();
  const patchSize = Math.max(0.001, settings.patchSize);
  const accentPatchSize = Math.max(0.001, settings.accentPatchSize);
  const detailScale = Math.max(0.001, settings.detailScale);
  const accentStrength = Math.max(0, Math.min(1, settings.accentStrength));
  const detailStrength = Math.max(0, Math.min(1, settings.detailStrength));
  const octaves = Math.max(1, Math.min(4, Math.round(settings.octaves)));
  // Fractal octaves control the granularity of the base patches: each octave
  // doubles the frequency at half the amplitude.
  const samplePatches = (x: number, z: number): number => {
    let patches = 0;
    let amplitude = 1;
    let normalizer = 0;
    let frequency = 1;
    for (let octave = 0; octave < octaves; octave++) {
      patches += amplitude * perlinNoise2D((x * frequency) / patchSize, (z * frequency) / patchSize, seed ^ (GROUND_SEED_SALT + octave));
      normalizer += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return patches / normalizer;
  };
  return {
    samplePatches,
    sample(x: number, z: number): LinearColor {
      const patches = samplePatches(x, z);
      const accentAmount = accentStrength * perlinNoise2D(x / accentPatchSize, z / accentPatchSize, seed ^ ACCENT_SEED_SALT);
      const grain = 1 + detailStrength * (perlinNoise2D(x / detailScale, z / detailScale, seed ^ DETAIL_SEED_SALT) * 2 - 1);
      const r = (base.r + (highlight.r - base.r) * patches) * (1 - accentAmount) + accent.r * accentAmount;
      const g = (base.g + (highlight.g - base.g) * patches) * (1 - accentAmount) + accent.g * accentAmount;
      const b = (base.b + (highlight.b - base.b) * patches) * (1 - accentAmount) + accent.b * accentAmount;
      return { r: r * grain, g: g * grain, b: b * grain };
    },
  };
}

/**
 * Fills an RGBA byte texture covering worldSize x worldSize units centered on
 * the origin. Bytes are sRGB-encoded because the terrain shader decodes its
 * albedo samples with pow(rgb, 2.2), matching the image-texture path.
 */
export function generateGroundTextureData(
  resolution: number,
  worldSize: number,
  seed: number,
  settings: GroundColorSettings,
): Uint8Array {
  const sampler = createGroundColorSampler(seed, settings);
  const data = new Uint8Array(resolution * resolution * 4);
  const texelToWorld = worldSize / resolution;
  let offset = 0;
  for (let row = 0; row < resolution; row++) {
    const z = (row + 0.5) * texelToWorld - worldSize / 2;
    for (let column = 0; column < resolution; column++) {
      const x = (column + 0.5) * texelToWorld - worldSize / 2;
      const color = sampler.sample(x, z);
      data[offset] = Math.round(Math.min(1, Math.max(0, color.r)) ** (1 / 2.2) * 255);
      data[offset + 1] = Math.round(Math.min(1, Math.max(0, color.g)) ** (1 / 2.2) * 255);
      data[offset + 2] = Math.round(Math.min(1, Math.max(0, color.b)) ** (1 / 2.2) * 255);
      data[offset + 3] = 255;
      offset += 4;
    }
  }
  return data;
}
