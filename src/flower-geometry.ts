export interface FlowerDiscVertexData {
  positions: number[];
  normals: number[];
  indices: number[];
}

export interface FlowerDiscOptions {
  radius: number;
  segments?: number;
  normalStrength: number;
  profile: 'cone' | 'bump';
}

function normalizedNormal(x: number, y: number, z: number): readonly [number, number, number] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

/**
 * Builds a flat, low-poly disc whose authored normals provide its apparent
 * volume. Vertices are duplicated per wedge so the large disc can retain a
 * deliberately faceted cone read while the center disc interpolates a bump.
 */
export function buildFlowerDiscVertexData(options: FlowerDiscOptions): FlowerDiscVertexData {
  const segments = Math.max(3, Math.round(options.segments ?? 8));
  const radius = Math.max(0.001, options.radius);
  const strength = Math.max(0, options.normalStrength);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let segment = 0; segment < segments; segment++) {
    const angle0 = (segment / segments) * Math.PI * 2;
    const angle1 = ((segment + 1) / segments) * Math.PI * 2;
    const base = positions.length / 3;
    positions.push(0, 0, 0, Math.cos(angle1) * radius, 0, Math.sin(angle1) * radius, Math.cos(angle0) * radius, 0, Math.sin(angle0) * radius);

    if (options.profile === 'cone') {
      const middle = (angle0 + angle1) * 0.5;
      const normal = normalizedNormal(Math.cos(middle) * strength, 1, Math.sin(middle) * strength);
      normals.push(...normal, ...normal, ...normal);
    } else {
      const rim0 = normalizedNormal(Math.cos(angle1) * strength, 0.45, Math.sin(angle1) * strength);
      const rim1 = normalizedNormal(Math.cos(angle0) * strength, 0.45, Math.sin(angle0) * strength);
      normals.push(0, 1, 0, ...rim0, ...rim1);
    }
    // Babylon's left-handed front-face convention needs the opposite winding
    // from the right-handed geometric normal for this XZ-plane disc.
    indices.push(base, base + 2, base + 1);
  }

  return { positions, normals, indices };
}
