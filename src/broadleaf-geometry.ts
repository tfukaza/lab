import { Color3 } from '@babylonjs/core/Maths/math.color.js';

export interface BroadleafGeometrySettings {
  length: number;
  width: number;
  rise: number;
  seamStrength: number;
  curveStrength: number;
}

export interface BroadleafVertexData {
  positions: number[];
  normals: number[];
  specNormals: number[];
  colors: number[];
  uvs: number[];
  indices: number[];
  foldWeights: number[];
}

const STATIONS = [0, 0.25, 0.55, 0.8, 1] as const;
const EDGE_STATIONS = STATIONS.slice(1, -1);

function normalized(x: number, y: number, z: number): readonly [number, number, number] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function stationRise(t: number, rise: number): number {
  return rise * t * (2 - t);
}

function halfWidthAt(t: number, width: number): number {
  return (width * 0.5) * Math.sin(Math.PI * t) ** 0.72;
}

/**
 * Builds one 16-vertex broad leaf. Each half owns a duplicate five-vertex
 * centerline plus three outer vertices. The coincident centerline positions
 * carry opposing normals, producing a lit central seam without a normal map.
 */
export function buildBroadleafVertexData(settings: BroadleafGeometrySettings): BroadleafVertexData {
  const length = Math.max(0.01, settings.length);
  const width = Math.max(0.01, settings.width);
  const rise = Math.max(0.001, settings.rise);
  const seamStrength = Math.max(0, settings.seamStrength);
  const curveStrength = Math.max(0, settings.curveStrength);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const foldWeights: number[] = [];

  for (const side of [-1, 1] as const) {
    const base = positions.length / 3;
    for (const t of STATIONS) {
      positions.push(0, stationRise(t, rise), length * t);
      const slope = (2 * rise * (1 - t)) / length;
      const normal = normalized(-side * seamStrength, 1, -slope);
      normals.push(...normal);
      colors.push(1, 1, 1, 1);
      uvs.push(0.5, t);
      foldWeights.push(0);
    }
    for (const t of EDGE_STATIONS) {
      positions.push(side * halfWidthAt(t, width), stationRise(t, rise), length * t);
      const slope = (2 * rise * (1 - t)) / length;
      const normal = normalized(side * curveStrength, 1, -slope);
      normals.push(...normal);
      colors.push(1, 1, 1, 1);
      uvs.push(side < 0 ? 0 : 1, t);
      foldWeights.push(0);
    }

    const c0 = base,
      c1 = base + 1,
      c2 = base + 2,
      c3 = base + 3,
      c4 = base + 4,
      e1 = base + 5,
      e2 = base + 6,
      e3 = base + 7;
    const triangles =
      side < 0
        ? [c0, c1, e1, c1, c2, e2, c1, e2, e1, c2, c3, e3, c2, e3, e2, c3, c4, e3]
        : [c0, e1, c1, c1, e2, c2, c1, e1, e2, c2, e3, c3, c2, e2, e3, c3, e3, c4];
    indices.push(...triangles);
  }

  return {
    positions,
    normals,
    specNormals: [...normals],
    colors,
    uvs,
    indices,
    foldWeights,
  };
}

function mixColor(a: Color3, b: Color3, amount: number): Color3 {
  return Color3.Lerp(a, b, Math.max(0, Math.min(1, amount)));
}

/** Generates an opaque oval radial gradient in memory; callers upload it directly. */
export function generateBroadleafGradientData(
  width: number,
  height: number,
  edgeColor: string,
  bodyColor: string,
  centerColor: string,
): Uint8Array {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const edge = Color3.FromHexString(edgeColor);
  const body = Color3.FromHexString(bodyColor);
  const center = Color3.FromHexString(centerColor);
  const data = new Uint8Array(safeWidth * safeHeight * 4);
  let offset = 0;
  for (let row = 0; row < safeHeight; row++) {
    const v = (row + 0.5) / safeHeight;
    for (let column = 0; column < safeWidth; column++) {
      const u = (column + 0.5) / safeWidth;
      const ovalRadius = Math.min(1, Math.hypot((u - 0.5) / 0.5, (v - 0.52) / 0.52));
      const inward = 1 - ovalRadius;
      const color = inward < 0.58 ? mixColor(edge, body, inward / 0.58) : mixColor(body, center, (inward - 0.58) / 0.42);
      data[offset] = Math.round(color.r * 255);
      data[offset + 1] = Math.round(color.g * 255);
      data[offset + 2] = Math.round(color.b * 255);
      data[offset + 3] = 255;
      offset += 4;
    }
  }
  return data;
}
