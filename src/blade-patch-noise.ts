export interface BladePatchSample {
  tint: number;
  growth: number;
  heightFactor: number;
  densityProbability: number;
}

export function bladeDensityProbability(
  growth: number,
  densityVariation: number,
  densityExponent: number,
): number {
  const shapedGrowth = Math.pow(
    Math.max(0, Math.min(1, growth)),
    Math.max(0.1, densityExponent),
  );
  return 1 - Math.max(0, Math.min(1, densityVariation)) * (1 - shapedGrowth);
}

export interface BladeTiltPatchSample {
  rgb: readonly [number, number, number];
  directionX: number;
  directionZ: number;
  strength: number;
}

const TINT_SEED_SALT = 0x6d2b79f5;
const GROWTH_SEED_SALT = 0x1b873593;
const TILT_CELL_X_SEED_SALT = 0x4cf5ad43;
const TILT_CELL_Z_SEED_SALT = 0x68e31da4;
const TILT_DIRECTION_SEED_SALT = 0x9e3779b9;
const TILT_STRENGTH_SEED_SALT = 0x85ebca6b;
const INV_SQRT_TWO = Math.SQRT1_2;

function fade(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function smoothstep01(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function latticeHash(x: number, z: number, seed: number): number {
  let hash = Math.imul(x, 0x1f123bb5) ^ Math.imul(z, 0x5f356495) ^ seed;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function gradientDot(hash: number, x: number, z: number): number {
  switch (hash & 7) {
    case 0:
      return x;
    case 1:
      return -x;
    case 2:
      return z;
    case 3:
      return -z;
    case 4:
      return (x + z) * INV_SQRT_TWO;
    case 5:
      return (x - z) * INV_SQRT_TWO;
    case 6:
      return (-x + z) * INV_SQRT_TWO;
    default:
      return (-x - z) * INV_SQRT_TWO;
  }
}

/** Deterministic single-octave 2D gradient Perlin noise normalized to [0, 1]. */
export function perlinNoise2D(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const localX = x - x0;
  const localZ = z - z0;
  const u = fade(localX);
  const v = fade(localZ);
  const lower = mix(
    gradientDot(latticeHash(x0, z0, seed), localX, localZ),
    gradientDot(latticeHash(x0 + 1, z0, seed), localX - 1, localZ),
    u,
  );
  const upper = mix(
    gradientDot(latticeHash(x0, z0 + 1, seed), localX, localZ - 1),
    gradientDot(latticeHash(x0 + 1, z0 + 1, seed), localX - 1, localZ - 1),
    u,
  );
  return Math.max(0, Math.min(1, 0.5 + mix(lower, upper, v) * INV_SQRT_TWO));
}

export function sampleBladePatch(
  x: number,
  z: number,
  seed: number,
  tintPatchSize: number,
  growthPatchSize: number,
  heightVariation: number,
  densityVariation: number,
  densityExponent: number,
): BladePatchSample {
  const tint = perlinNoise2D(x / tintPatchSize, z / tintPatchSize, seed ^ TINT_SEED_SALT);
  const growth = perlinNoise2D(x / growthPatchSize, z / growthPatchSize, seed ^ GROWTH_SEED_SALT);
  return {
    tint,
    growth,
    heightFactor: Math.max(0.12, 1 + heightVariation * (growth * 2 - 1)),
    densityProbability: bladeDensityProbability(growth, densityVariation, densityExponent),
  };
}

/**
 * Static cellular RGB clump field for blade orientation. Each jittered
 * Voronoi cell owns one RG direction and B tilt strength; only a narrow band
 * blends toward the runner-up cell, keeping irregular boundaries readable
 * without returning to a continuously flowing field.
 */
export function sampleBladeTiltPatch(
  x: number,
  z: number,
  seed: number,
  patchSize: number,
  cellJitter: number,
  transitionWidth: number,
): BladeTiltPatchSample {
  const safePatchSize = Math.max(0.001, patchSize);
  const sampleX = x / safePatchSize;
  const sampleZ = z / safePatchSize;
  const baseCellX = Math.floor(sampleX);
  const baseCellZ = Math.floor(sampleZ);
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  let secondDistanceSquared = Number.POSITIVE_INFINITY;
  let nearestCellX = baseCellX;
  let nearestCellZ = baseCellZ;
  let secondCellX = baseCellX;
  let secondCellZ = baseCellZ;

  const safeCellJitter = Math.max(0, Math.min(1, cellJitter));
  // A 5×5 neighborhood remains correct across the full configurable feature
  // jitter range, including points that may reach a cell edge at value 1.
  for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
    for (let offsetX = -2; offsetX <= 2; offsetX++) {
      const cellX = baseCellX + offsetX;
      const cellZ = baseCellZ + offsetZ;
      const featureX =
        cellX + 0.5 + (latticeHash(cellX, cellZ, seed ^ TILT_CELL_X_SEED_SALT) / 4294967296 - 0.5) * safeCellJitter;
      const featureZ =
        cellZ + 0.5 + (latticeHash(cellX, cellZ, seed ^ TILT_CELL_Z_SEED_SALT) / 4294967296 - 0.5) * safeCellJitter;
      const deltaX = sampleX - featureX;
      const deltaZ = sampleZ - featureZ;
      const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
      if (distanceSquared < nearestDistanceSquared) {
        secondDistanceSquared = nearestDistanceSquared;
        secondCellX = nearestCellX;
        secondCellZ = nearestCellZ;
        nearestDistanceSquared = distanceSquared;
        nearestCellX = cellX;
        nearestCellZ = cellZ;
      } else if (distanceSquared < secondDistanceSquared) {
        secondDistanceSquared = distanceSquared;
        secondCellX = cellX;
        secondCellZ = cellZ;
      }
    }
  }

  const nearestAngle =
    (latticeHash(nearestCellX, nearestCellZ, seed ^ TILT_DIRECTION_SEED_SALT) / 4294967296) * Math.PI * 2;
  const secondAngle =
    (latticeHash(secondCellX, secondCellZ, seed ^ TILT_DIRECTION_SEED_SALT) / 4294967296) * Math.PI * 2;
  const edgeDistance = Math.max(0, Math.sqrt(secondDistanceSquared) - Math.sqrt(nearestDistanceSquared));
  const nearestWeight =
    transitionWidth <= 0 ? 1 : 0.5 + 0.5 * smoothstep01(edgeDistance / Math.max(0.0001, transitionWidth));
  const shortestAngleDelta = Math.atan2(Math.sin(nearestAngle - secondAngle), Math.cos(nearestAngle - secondAngle));
  const angle = secondAngle + shortestAngleDelta * nearestWeight;
  const directionX = Math.sin(angle);
  const directionZ = Math.cos(angle);
  const nearestStrength =
    latticeHash(nearestCellX, nearestCellZ, seed ^ TILT_STRENGTH_SEED_SALT) / 4294967296;
  const secondStrength =
    latticeHash(secondCellX, secondCellZ, seed ^ TILT_STRENGTH_SEED_SALT) / 4294967296;
  const strength = mix(secondStrength, nearestStrength, nearestWeight);
  return {
    rgb: [directionX * 0.5 + 0.5, directionZ * 0.5 + 0.5, strength],
    directionX,
    directionZ,
    strength,
  };
}
