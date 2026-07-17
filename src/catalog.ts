export type TerrainTextureGroup = 'Version 4';

export interface TerrainTextureEntry {
  id: string;
  label: string;
  group: TerrainTextureGroup;
  url: string;
}

function asset(path: string): string {
  return new URL(path, import.meta.url).href;
}

export const TERRAIN_TEXTURE_CATALOG: readonly TerrainTextureEntry[] = [
  { id: 'v4/mixed-meadow', label: 'Mixed meadow', group: 'Version 4', url: asset('./assets/terrain/mixed-meadow.png') },
  { id: 'v4/worn-meadow', label: 'Worn meadow', group: 'Version 4', url: asset('./assets/terrain/worn-meadow.png') },
  { id: 'v4/packed-earth', label: 'Packed earth', group: 'Version 4', url: asset('./assets/terrain/packed-earth.png') },
  { id: 'v4/rocky-verge', label: 'Rocky verge', group: 'Version 4', url: asset('./assets/terrain/rocky-verge.png') },
] as const;

export const TERRAIN_REFERENCE_ASSETS = {
  coverAtlas: '/textures/terrain/ground-cover-v2.png',
  productionAlbedo: '/textures/terrain/arena-ground-albedo.webp',
  productionNormal: '/textures/terrain/arena-ground-normal.webp',
  productionOrm: '/textures/terrain/arena-ground-orm.webp',
  sharedDetail: '/textures/terrain/arena-ground-detail.webp',
} as const;

export function textureById(id: string): TerrainTextureEntry {
  return TERRAIN_TEXTURE_CATALOG.find((entry) => entry.id === id) ?? TERRAIN_TEXTURE_CATALOG[0]!;
}
