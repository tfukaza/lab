import { Color3 } from '@babylonjs/core/Maths/math.color.js';

export interface BladeGeometrySettings {
  width: number;
  topWidth: number;
  height: number;
  normalCurveDegrees: number;
  normalFlatten: number;
  tipDropRatio: number;
  rootColor: string;
  tipColor: string;
}

export interface BladeVertexData {
  positions: number[];
  normals: number[];
  /** Unflattened curved face normals, used only by the specular glint path. */
  specNormals: number[];
  /** Selects the single high vertex that folds around the diagonal crease. */
  foldWeights: number[];
  colors: number[];
  indices: number[];
}

/** Builds a two-triangle, two-sided origami blade without relying on instance scale. */
export function buildBladeVertexData(settings: BladeGeometrySettings): BladeVertexData {
  const width = Math.max(0.001, settings.width);
  const height = Math.max(0.001, settings.height);
  const halfWidth = width * 0.5;
  const halfTop = Math.min(width, Math.max(0.001, settings.topWidth)) * 0.5;
  const tipDropRatio = Math.max(0, Math.min(0.8, settings.tipDropRatio));
  const shoulderHeight = 1 - tipDropRatio;
  const heights = [0, 0, shoulderHeight, 1] as const;
  const positions = [
    -halfWidth,
    0,
    0,
    halfWidth,
    0,
    0,
    halfTop,
    height * shoulderHeight,
    0,
    -halfTop,
    height,
    0,
    -halfWidth,
    0,
    0,
    halfWidth,
    0,
    0,
    halfTop,
    height * shoulderHeight,
    0,
    -halfTop,
    height,
    0,
  ];

  const curveRadians = (Math.max(0, Math.min(80, settings.normalCurveDegrees)) * Math.PI) / 180;
  // Bending shading normals toward world up makes every blade in a patch take
  // the same N.L from the sun regardless of its facing, while shadow-map
  // darkening, sun elevation, and slope response are untouched. Instance yaw
  // preserves an up-leaning normal, so the blend can live in shared vertex
  // data. On non-flat production terrain, "up" should become the terrain
  // surface normal instead.
  const flatten = Math.max(0, Math.min(1, settings.normalFlatten));
  // Vertex colors multiply albedo in linear space, but the color wells hand us
  // sRGB hex; without this conversion the blades render several times brighter
  // than the configured swatch.
  const root = Color3.FromHexString(settings.rootColor).toLinearSpace();
  const tip = Color3.FromHexString(settings.tipColor).toLinearSpace();
  const normals: number[] = [];
  const specNormals: number[] = [];
  const colors: number[] = [];

  for (const faceSign of [-1, 1]) {
    for (const normalizedHeight of heights) {
      const curve = curveRadians * normalizedHeight;
      const rawY = curve === 0 ? 0 : -faceSign * Math.sin(curve);
      const rawZ = faceSign * Math.cos(curve);
      specNormals.push(0, rawY, rawZ);
      const normalY = rawY + (1 - rawY) * flatten;
      const normalZ = rawZ * (1 - flatten);
      const length = Math.hypot(normalY, normalZ) || 1;
      normals.push(0, normalY / length, normalZ / length);
      // Root occlusion is intentionally NOT baked here: the vertex shader
      // applies it per instance so shorter blades receive less darkening.
      const color = Color3.Lerp(root, tip, normalizedHeight);
      colors.push(color.r, color.g, color.b, 1);
    }
  }

  return {
    positions,
    normals,
    specNormals,
    foldWeights: [0, 0, 0, 1, 0, 0, 0, 1],
    colors,
    indices: [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6],
  };
}
