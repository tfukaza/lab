export const TERRAIN_STAGE_KEYS = [
  'randomization',
  'fbm',
  'warp',
  'surfaceBlend',
  'detailPbr',
  'groundCover',
  'bladeCover',
  'flowerCover',
  'leafCover',
] as const;
export type TerrainStageKey = (typeof TERRAIN_STAGE_KEYS)[number];

export const TERRAIN_DEBUG_VIEWS = [
  'final',
  'unlit',
  'fbm',
  'warpedUv',
  'weight0',
  'weight1',
  'weight2',
  'weight3',
  'detail',
  'normal',
  'roughness',
  'ao',
] as const;
export type TerrainDebugView = (typeof TERRAIN_DEBUG_VIEWS)[number];

export interface TerrainSurfaceSlot {
  textureId: string;
  tiling: number;
  tint: string;
  coverage: number;
  threshold: number;
  softness: number;
}

export interface TerrainLabConfigV25 {
  version: 25;
  seed: number;
  stages: Record<TerrainStageKey, boolean>;
  slots: [TerrainSurfaceSlot, TerrainSurfaceSlot, TerrainSurfaceSlot, TerrainSurfaceSlot];
  bombing: {
    cells: number;
    scaleMin: number;
    scaleMax: number;
    offset: number;
    rotation: number;
    mirror: number;
    cellBlend: number;
  };
  fbm: { scale: number; strength: number; octaves: number; lacunarity: number; gain: number };
  warp: { scale: number; strength: number; secondaryScale: number };
  ground: {
    enabled: boolean;
    baseColor: string;
    highlightColor: string;
    accentColor: string;
    patchSize: number;
    accentPatchSize: number;
    accentStrength: number;
    octaves: number;
    detailScale: number;
    detailStrength: number;
    emission: number;
  };
  blend: { macroTint: number; edgeBreakup: number };
  detail: { tiling: number; diffuse: number; bump: number; roughness: number };
  pbr: { baseRoughness: number; ao: number; metallic: number };
  cover: {
    count: number;
    variant: number;
    spread: number;
    offsetX: number;
    offsetZ: number;
    groundOffset: number;
    width: number;
    height: number;
    scaleVariation: number;
    colorVariation: number;
    alphaCutoff: number;
    crossedAngle: number;
    cropPadding: number;
  };
  blades: {
    count: number;
    spread: number;
    groundOffset: number;
    width: number;
    topWidth: number;
    height: number;
    scaleVariation: number;
    tiltDegrees: number;
    bendDegrees: number;
    bendHeightInfluence: number;
    bendJitterDegrees: number;
    tiltNoisePatchSize: number;
    tiltCellJitter: number;
    tiltTransitionWidth: number;
    tiltNoiseStrength: number;
    tiltVariationDegrees: number;
    tiltDirectionJitterDegrees: number;
    normalCurveDegrees: number;
    normalFlatten: number;
    viewFacing: number;
    rootOcclusion: number;
    roughness: number;
    specularIntensity: number;
    glintSpread: number;
    glintTipBias: number;
    sideLightEvenness: number;
    glintColor: string;
    diffuseDirectionality: number;
    tipDropRatio: number;
    rootColor: string;
    tipColor: string;
    tintNoisePatchSize: number;
    tintNoiseStrength: number;
    tintNoiseColor: string;
    groundBlend: number;
    rootGroundBlend: number;
    growthSyncToGround: number;
    growthNoisePatchSize: number;
    growthHeightVariation: number;
    growthMinimumHeightScale: number;
    growthDensityVariation: number;
    growthDensityExponent: number;
    windNoisePatchSize: number;
    windTiltDegrees: number;
    windSpeed: number;
    windAzimuth: number;
    windDirectionBias: number;
    windBendExponent: number;
    interactionSphereRadius: number;
    interactionPushStrength: number;
    interactionSquashStrength: number;
    interactionMaxTiltDegrees: number;
    interactionGroundClearance: number;
  };
  flowers: {
    count: number;
    clumpCount: number;
    clumpRadius: number;
    spread: number;
    grassHeightRatio: number;
    grassHeightRatioVariation: number;
    windInfluence: number;
    radius: number;
    centerRadius: number;
    centerLift: number;
    scaleVariation: number;
    tiltDegrees: number;
    petalNormalStrength: number;
    centerNormalStrength: number;
    roughness: number;
    petalColor: string;
    bluePetalColor: string;
    yellowPetalColor: string;
    blueClumpFraction: number;
    yellowClumpFraction: number;
    pocketClumpFraction: number;
    pocketGrowthThreshold: number;
    centerColor: string;
  };
  leaves: {
    clumpCount: number;
    minPlantsPerClump: number;
    maxPlantsPerClump: number;
    minLeavesPerPlant: number;
    maxLeavesPerPlant: number;
    spread: number;
    clumpRadius: number;
    plantSpacing: number;
    shortGrassThreshold: number;
    pocketClumpFraction: number;
    groundOffset: number;
    length: number;
    width: number;
    rise: number;
    scaleVariation: number;
    colorVariation: number;
    yawJitterDegrees: number;
    seamStrength: number;
    curveStrength: number;
    roughness: number;
    rootGroundBlend: number;
    windInfluence: number;
    edgeColor: string;
    bodyColor: string;
    centerColor: string;
  };
  lighting: {
    ambient: number;
    ambientColor: string;
    skylight: number;
    sun: number;
    sunColor: string;
    sunAzimuth: number;
    sunElevation: number;
    exposure: number;
    contrast: number;
  };
}

export interface NumericControl {
  path: string;
  label: string;
  group: string;
  min: number;
  max: number;
  step: number;
}

export const CONTROL_SCHEMA: readonly NumericControl[] = [
  { path: 'seed', label: 'Global seed', group: 'Global', min: 0, max: 9999, step: 1 },
  { path: 'bombing.cells', label: 'Cell count', group: 'Randomization', min: 1, max: 48, step: 1 },
  { path: 'bombing.scaleMin', label: 'Minimum scale', group: 'Randomization', min: 0.25, max: 4, step: 0.01 },
  { path: 'bombing.scaleMax', label: 'Maximum scale', group: 'Randomization', min: 0.25, max: 6, step: 0.01 },
  { path: 'bombing.offset', label: 'Offset range', group: 'Randomization', min: 0, max: 2, step: 0.01 },
  { path: 'bombing.rotation', label: 'Quarter rotations', group: 'Randomization', min: 0, max: 1, step: 1 },
  { path: 'bombing.mirror', label: 'Mirroring', group: 'Randomization', min: 0, max: 1, step: 1 },
  { path: 'bombing.cellBlend', label: 'Cell blend', group: 'Randomization', min: 0, max: 1, step: 0.01 },
  { path: 'fbm.scale', label: 'Scale', group: 'Procedural FBM', min: 0.1, max: 32, step: 0.1 },
  { path: 'fbm.strength', label: 'Strength', group: 'Procedural FBM', min: 0, max: 2, step: 0.01 },
  { path: 'fbm.octaves', label: 'Octaves', group: 'Procedural FBM', min: 1, max: 8, step: 1 },
  { path: 'fbm.lacunarity', label: 'Lacunarity', group: 'Procedural FBM', min: 1, max: 4, step: 0.01 },
  { path: 'fbm.gain', label: 'Gain', group: 'Procedural FBM', min: 0.1, max: 0.9, step: 0.01 },
  { path: 'ground.patchSize', label: 'Patch size', group: 'Procedural ground', min: 4, max: 128, step: 1 },
  { path: 'ground.accentPatchSize', label: 'Accent patch size', group: 'Procedural ground', min: 4, max: 128, step: 1 },
  { path: 'ground.accentStrength', label: 'Accent strength', group: 'Procedural ground', min: 0, max: 1, step: 0.01 },
  { path: 'ground.octaves', label: 'Noise octaves', group: 'Procedural ground', min: 1, max: 4, step: 1 },
  { path: 'ground.detailScale', label: 'Grain scale', group: 'Procedural ground', min: 0.2, max: 16, step: 0.1 },
  { path: 'ground.detailStrength', label: 'Grain strength', group: 'Procedural ground', min: 0, max: 1, step: 0.01 },
  { path: 'ground.emission', label: 'Ground emission', group: 'Procedural ground', min: 0, max: 1, step: 0.01 },
  { path: 'warp.scale', label: 'Scale', group: 'Domain warp', min: 0.1, max: 24, step: 0.1 },
  { path: 'warp.strength', label: 'Strength', group: 'Domain warp', min: 0, max: 1, step: 0.005 },
  { path: 'warp.secondaryScale', label: 'Secondary scale', group: 'Domain warp', min: 0.1, max: 8, step: 0.05 },
  { path: 'blend.macroTint', label: 'Macro tint', group: 'Surface blend', min: 0, max: 1, step: 0.01 },
  { path: 'blend.edgeBreakup', label: 'Edge breakup', group: 'Surface blend', min: 0, max: 2, step: 0.01 },
  { path: 'detail.tiling', label: 'Detail tiling', group: 'Detail / PBR', min: 1, max: 128, step: 1 },
  { path: 'detail.diffuse', label: 'Diffuse influence', group: 'Detail / PBR', min: 0, max: 1, step: 0.01 },
  { path: 'detail.bump', label: 'Bump influence', group: 'Detail / PBR', min: 0, max: 2, step: 0.01 },
  { path: 'detail.roughness', label: 'Detail roughness', group: 'Detail / PBR', min: 0, max: 1, step: 0.01 },
  { path: 'pbr.baseRoughness', label: 'Base roughness', group: 'Detail / PBR', min: 0, max: 1, step: 0.01 },
  { path: 'pbr.ao', label: 'AO multiplier', group: 'Detail / PBR', min: 0, max: 1, step: 0.01 },
  { path: 'pbr.metallic', label: 'Metallic', group: 'Detail / PBR', min: 0, max: 1, step: 0.01 },
  { path: 'cover.count', label: 'Grass count', group: 'Grass placement', min: 0, max: 12000, step: 100 },
  { path: 'cover.variant', label: 'Variant (-1 = all)', group: 'Grass placement', min: -1, max: 7, step: 1 },
  { path: 'cover.spread', label: 'Distribution width', group: 'Grass placement', min: 10, max: 256, step: 1 },
  { path: 'cover.offsetX', label: 'Distribution X offset', group: 'Grass placement', min: -128, max: 128, step: 0.5 },
  { path: 'cover.offsetZ', label: 'Distribution Z offset', group: 'Grass placement', min: -128, max: 128, step: 0.5 },
  { path: 'cover.groundOffset', label: 'Ground Y offset', group: 'Grass placement', min: -2, max: 2, step: 0.01 },
  { path: 'cover.width', label: 'Grass width', group: 'Grass placement', min: 0.1, max: 12, step: 0.05 },
  { path: 'cover.height', label: 'Grass height', group: 'Grass placement', min: 0.1, max: 10, step: 0.05 },
  { path: 'cover.scaleVariation', label: 'Scale variation', group: 'Grass placement', min: 0, max: 1, step: 0.01 },
  { path: 'cover.colorVariation', label: 'Color variation', group: 'Grass placement', min: 0, max: 1, step: 0.01 },
  { path: 'cover.alphaCutoff', label: 'Alpha cutoff', group: 'Grass placement', min: 0, max: 1, step: 0.01 },
  { path: 'cover.crossedAngle', label: 'Crossed-card angle', group: 'Grass placement', min: 10, max: 90, step: 1 },
  { path: 'cover.cropPadding', label: 'Atlas crop padding', group: 'Grass placement', min: 0, max: 32, step: 1 },
  { path: 'blades.count', label: 'Blade count', group: 'Blade cover', min: 0, max: 200000, step: 1000 },
  { path: 'blades.spread', label: 'Blade field width', group: 'Blade cover', min: 10, max: 256, step: 1 },
  { path: 'blades.groundOffset', label: 'Blade ground Y', group: 'Blade cover', min: -1, max: 1, step: 0.01 },
  { path: 'blades.width', label: 'Blade base width', group: 'Blade cover', min: 0.05, max: 2, step: 0.01 },
  { path: 'blades.topWidth', label: 'Blade top width', group: 'Blade cover', min: 0.01, max: 1, step: 0.01 },
  { path: 'blades.height', label: 'Blade height', group: 'Blade cover', min: 0.1, max: 5, step: 0.05 },
  { path: 'blades.scaleVariation', label: 'Blade scale variation', group: 'Blade cover', min: 0, max: 1, step: 0.01 },
  { path: 'blades.tiltDegrees', label: 'Default blade tilt', group: 'Blade cover', min: 0, max: 70, step: 1 },
  { path: 'blades.bendDegrees', label: 'Origami fold angle', group: 'Blade cover', min: 0, max: 60, step: 1 },
  { path: 'blades.normalCurveDegrees', label: 'Normal curvature', group: 'Blade cover', min: 0, max: 80, step: 1 },
  { path: 'blades.normalFlatten', label: 'Normal flatten (to up)', group: 'Blade cover', min: 0, max: 1, step: 0.01 },
  { path: 'blades.viewFacing', label: 'View facing (billboard)', group: 'Blade cover', min: 0, max: 1, step: 0.01 },
  { path: 'blades.rootOcclusion', label: 'Root occlusion', group: 'Blade cover', min: 0, max: 1, step: 0.01 },
  { path: 'blades.roughness', label: 'Blade roughness', group: 'Blade cover', min: 0, max: 1, step: 0.01 },
  { path: 'blades.specularIntensity', label: 'Blade specular', group: 'Blade cover', min: 0, max: 3, step: 0.01 },
  { path: 'blades.glintSpread', label: 'Glint spread', group: 'Blade cover', min: 0, max: 1, step: 0.01 },
  { path: 'blades.glintTipBias', label: 'Glint tip bias', group: 'Blade cover', min: 0, max: 1, step: 0.01 },
  {
    path: 'blades.sideLightEvenness',
    label: 'Side lighting evenness',
    group: 'Blade cover',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    path: 'blades.diffuseDirectionality',
    label: 'Diffuse directionality',
    group: 'Blade cover',
    min: 0,
    max: 1,
    step: 0.01,
  },
  { path: 'blades.tipDropRatio', label: 'Tip drop ratio', group: 'Blade cover', min: 0, max: 0.8, step: 0.01 },
  { path: 'blades.tiltNoisePatchSize', label: 'Tilt clump width', group: 'Blade patches', min: 4, max: 128, step: 1 },
  { path: 'blades.tiltCellJitter', label: 'Clump boundary irregularity', group: 'Blade patches', min: 0, max: 1, step: 0.01 },
  { path: 'blades.tiltTransitionWidth', label: 'Tilt boundary softness', group: 'Blade patches', min: 0, max: 0.5, step: 0.01 },
  { path: 'blades.tiltNoiseStrength', label: 'Clump tilt variation', group: 'Blade patches', min: 0, max: 0.5, step: 0.01 },
  { path: 'blades.tiltVariationDegrees', label: 'Blade tilt jitter', group: 'Blade patches', min: 0, max: 20, step: 1 },
  { path: 'blades.tiltDirectionJitterDegrees', label: 'Blade direction jitter', group: 'Blade patches', min: 0, max: 90, step: 1 },
  { path: 'blades.bendHeightInfluence', label: 'Tall blade fold influence', group: 'Blade patches', min: 0, max: 1, step: 0.01 },
  { path: 'blades.bendJitterDegrees', label: 'Blade fold jitter', group: 'Blade patches', min: 0, max: 30, step: 1 },
  { path: 'blades.tintNoisePatchSize', label: 'Tint patch size', group: 'Blade patches', min: 4, max: 128, step: 1 },
  { path: 'blades.tintNoiseStrength', label: 'Tint strength', group: 'Blade patches', min: 0, max: 2, step: 0.01 },
  { path: 'blades.groundBlend', label: 'Ground blend', group: 'Blade patches', min: 0, max: 1, step: 0.01 },
  { path: 'blades.rootGroundBlend', label: 'Root ground color', group: 'Blade patches', min: 0, max: 1, step: 0.01 },
  {
    path: 'blades.growthSyncToGround',
    label: 'Sync growth to ground (0/1)',
    group: 'Blade patches',
    min: 0,
    max: 1,
    step: 1,
  },
  {
    path: 'blades.growthNoisePatchSize',
    label: 'Growth patch size',
    group: 'Blade patches',
    min: 4,
    max: 128,
    step: 1,
  },
  {
    path: 'blades.growthHeightVariation',
    label: 'Patch height variation',
    group: 'Blade patches',
    min: 0,
    max: 1.5,
    step: 0.01,
  },
  {
    path: 'blades.growthMinimumHeightScale',
    label: 'Retained blade minimum height',
    group: 'Blade patches',
    min: 0.05,
    max: 2,
    step: 0.01,
  },
  {
    path: 'blades.growthDensityVariation',
    label: 'Patch density variation',
    group: 'Blade patches',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    path: 'blades.growthDensityExponent',
    label: 'Short-patch clearing strength',
    group: 'Blade patches',
    min: 0.25,
    max: 8,
    step: 0.05,
  },
  { path: 'blades.windNoisePatchSize', label: 'Wind patch size', group: 'Blade wind', min: 4, max: 128, step: 1 },
  { path: 'blades.windTiltDegrees', label: 'Maximum wind tilt', group: 'Blade wind', min: 0, max: 45, step: 1 },
  { path: 'blades.windSpeed', label: 'Wind travel speed', group: 'Blade wind', min: 0, max: 30, step: 0.1 },
  { path: 'blades.windAzimuth', label: 'Wind azimuth', group: 'Blade wind', min: 0, max: 360, step: 1 },
  { path: 'blades.windDirectionBias', label: 'Downwind bias', group: 'Blade wind', min: 0, max: 1, step: 0.01 },
  {
    path: 'blades.windBendExponent',
    label: 'Wind magnitude exponent',
    group: 'Blade wind',
    min: 0.5,
    max: 4,
    step: 0.1,
  },
  {
    path: 'blades.interactionSphereRadius',
    label: 'Sphere influence radius',
    group: 'Blade interaction',
    min: 1,
    max: 20,
    step: 0.1,
  },
  {
    path: 'blades.interactionPushStrength',
    label: 'Outward push',
    group: 'Blade interaction',
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    path: 'blades.interactionSquashStrength',
    label: 'Crush tilt strength',
    group: 'Blade interaction',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    path: 'blades.interactionMaxTiltDegrees',
    label: 'Maximum crush tilt',
    group: 'Blade interaction',
    min: 0,
    max: 60,
    step: 1,
  },
  {
    path: 'blades.interactionGroundClearance',
    label: 'Crush ground clearance',
    group: 'Blade interaction',
    min: 0,
    max: 0.5,
    step: 0.01,
  },
  { path: 'flowers.count', label: 'Flower count', group: 'Flower cover', min: 0, max: 1000, step: 1 },
  { path: 'flowers.clumpCount', label: 'Flower clumps', group: 'Flower cover', min: 1, max: 100, step: 1 },
  { path: 'flowers.clumpRadius', label: 'Clump radius', group: 'Flower cover', min: 0.25, max: 20, step: 0.25 },
  { path: 'flowers.spread', label: 'Flower field width', group: 'Flower cover', min: 10, max: 256, step: 1 },
  { path: 'flowers.grassHeightRatio', label: 'Flower grass-height ratio', group: 'Flower cover', min: 0.1, max: 1.5, step: 0.01 },
  { path: 'flowers.grassHeightRatioVariation', label: 'Flower height ratio variation', group: 'Flower cover', min: 0, max: 0.75, step: 0.01 },
  { path: 'flowers.windInfluence', label: 'Flower wind sway', group: 'Flower cover', min: 0, max: 1.5, step: 0.01 },
  { path: 'flowers.radius', label: 'Flower radius', group: 'Flower cover', min: 0.1, max: 4, step: 0.05 },
  { path: 'flowers.centerRadius', label: 'Brown center radius', group: 'Flower cover', min: 0.05, max: 2, step: 0.05 },
  { path: 'flowers.centerLift', label: 'Center lift', group: 'Flower cover', min: 0.01, max: 0.5, step: 0.01 },
  { path: 'flowers.scaleVariation', label: 'Flower size variation', group: 'Flower cover', min: 0, max: 0.9, step: 0.01 },
  { path: 'flowers.tiltDegrees', label: 'Flower tilt variation', group: 'Flower cover', min: 0, max: 45, step: 1 },
  { path: 'flowers.petalNormalStrength', label: 'Cone normal strength', group: 'Flower cover', min: 0, max: 3, step: 0.05 },
  { path: 'flowers.centerNormalStrength', label: 'Bump normal strength', group: 'Flower cover', min: 0, max: 3, step: 0.05 },
  { path: 'flowers.roughness', label: 'Flower roughness', group: 'Flower cover', min: 0, max: 1, step: 0.01 },
  { path: 'flowers.blueClumpFraction', label: 'Blue clump share', group: 'Flower cover', min: 0, max: 1, step: 0.01 },
  { path: 'flowers.yellowClumpFraction', label: 'Yellow clump share', group: 'Flower cover', min: 0, max: 1, step: 0.01 },
  { path: 'flowers.pocketClumpFraction', label: 'Flower pocket preference', group: 'Flower cover', min: 0, max: 1, step: 0.01 },
  { path: 'flowers.pocketGrowthThreshold', label: 'Flower pocket threshold', group: 'Flower cover', min: 0, max: 1, step: 0.01 },
  { path: 'leaves.clumpCount', label: 'Broadleaf clumps', group: 'Broadleaf cover', min: 0, max: 128, step: 1 },
  { path: 'leaves.minPlantsPerClump', label: 'Minimum plants per clump', group: 'Broadleaf cover', min: 1, max: 8, step: 1 },
  { path: 'leaves.maxPlantsPerClump', label: 'Maximum plants per clump', group: 'Broadleaf cover', min: 1, max: 8, step: 1 },
  { path: 'leaves.minLeavesPerPlant', label: 'Minimum leaves per plant', group: 'Broadleaf cover', min: 1, max: 5, step: 1 },
  { path: 'leaves.maxLeavesPerPlant', label: 'Maximum leaves per plant', group: 'Broadleaf cover', min: 1, max: 5, step: 1 },
  { path: 'leaves.spread', label: 'Broadleaf field width', group: 'Broadleaf cover', min: 10, max: 256, step: 1 },
  { path: 'leaves.clumpRadius', label: 'Broadleaf clump radius', group: 'Broadleaf cover', min: 0.5, max: 20, step: 0.25 },
  { path: 'leaves.plantSpacing', label: 'Minimum plant spacing', group: 'Broadleaf cover', min: 0, max: 6, step: 0.05 },
  { path: 'leaves.shortGrassThreshold', label: 'Short-grass threshold', group: 'Broadleaf cover', min: 0, max: 1, step: 0.01 },
  { path: 'leaves.pocketClumpFraction', label: 'Broadleaf pocket preference', group: 'Broadleaf cover', min: 0, max: 1, step: 0.01 },
  { path: 'leaves.groundOffset', label: 'Broadleaf ground Y', group: 'Broadleaf cover', min: -1, max: 1, step: 0.01 },
  { path: 'leaves.length', label: 'Leaf length', group: 'Broadleaf cover', min: 0.2, max: 6, step: 0.05 },
  { path: 'leaves.width', label: 'Leaf width', group: 'Broadleaf cover', min: 0.1, max: 4, step: 0.05 },
  { path: 'leaves.rise', label: 'Leaf rise', group: 'Broadleaf cover', min: 0.05, max: 3, step: 0.05 },
  { path: 'leaves.scaleVariation', label: 'Leaf size variation', group: 'Broadleaf cover', min: 0, max: 0.9, step: 0.01 },
  { path: 'leaves.colorVariation', label: 'Leaf color variation', group: 'Broadleaf cover', min: 0, max: 1, step: 0.01 },
  { path: 'leaves.yawJitterDegrees', label: 'Leaf fan jitter', group: 'Broadleaf cover', min: 0, max: 60, step: 1 },
  { path: 'leaves.seamStrength', label: 'Center seam strength', group: 'Broadleaf cover', min: 0, max: 3, step: 0.05 },
  { path: 'leaves.curveStrength', label: 'Leaf curve strength', group: 'Broadleaf cover', min: 0, max: 3, step: 0.05 },
  { path: 'leaves.roughness', label: 'Leaf roughness', group: 'Broadleaf cover', min: 0, max: 1, step: 0.01 },
  { path: 'leaves.rootGroundBlend', label: 'Leaf root ground color', group: 'Broadleaf cover', min: 0, max: 1, step: 0.01 },
  { path: 'leaves.windInfluence', label: 'Leaf wind influence', group: 'Broadleaf cover', min: 0, max: 1.5, step: 0.01 },
  { path: 'lighting.ambient', label: 'Ambient', group: 'Lighting', min: 0, max: 2, step: 0.01 },
  { path: 'lighting.skylight', label: 'Skylight', group: 'Lighting', min: 0, max: 2, step: 0.01 },
  { path: 'lighting.sun', label: 'Sun intensity', group: 'Lighting', min: 0, max: 8, step: 0.01 },
  { path: 'lighting.sunAzimuth', label: 'Sun azimuth', group: 'Lighting', min: 0, max: 360, step: 1 },
  { path: 'lighting.sunElevation', label: 'Sun elevation', group: 'Lighting', min: 5, max: 85, step: 1 },
  { path: 'lighting.exposure', label: 'Exposure', group: 'Lighting', min: 0.2, max: 3, step: 0.01 },
  { path: 'lighting.contrast', label: 'Contrast', group: 'Lighting', min: 0.2, max: 3, step: 0.01 },
] as const;

export const GUIDED_STAGES: readonly { key: TerrainStageKey | 'base'; label: string; description: string }[] = [
  { key: 'base', label: '1 Base', description: 'One repeating albedo' },
  { key: 'randomization', label: '2 Randomize', description: 'Seeded texture bombing' },
  { key: 'fbm', label: '3 FBM', description: 'Procedural octave noise' },
  { key: 'warp', label: '4 Warp', description: 'Domain distortion' },
  { key: 'surfaceBlend', label: '5 Blend', description: 'Four normalized surfaces' },
  { key: 'detailPbr', label: '6 Detail', description: 'Shared micro-detail and PBR' },
  { key: 'groundCover', label: '7 Cover', description: 'Thin-instanced plants' },
  { key: 'bladeCover', label: '8 Blades', description: 'Folded origami triangles' },
  { key: 'flowerCover', label: '9 Flowers', description: 'Clustered octagonal blooms' },
  { key: 'leafCover', label: '10 Leaves', description: 'Procedural broadleaf rosettes' },
] as const;

export function createDefaultTerrainConfig(): TerrainLabConfigV25 {
  return {
    version: 25,
    seed: 1337,
    stages: {
      randomization: true,
      fbm: false,
      warp: false,
      surfaceBlend: false,
      detailPbr: false,
      groundCover: false,
      bladeCover: true,
      flowerCover: true,
      leafCover: true,
    },
    slots: [
      { textureId: 'v4/mixed-meadow', tiling: 12, tint: '#ffffff', coverage: 1, threshold: 0, softness: 0.2 },
      { textureId: 'v4/worn-meadow', tiling: 12, tint: '#f3ecdb', coverage: 0.82, threshold: 0.46, softness: 0.15 },
      { textureId: 'v4/packed-earth', tiling: 12, tint: '#f0e2c8', coverage: 0.7, threshold: 0.57, softness: 0.12 },
      { textureId: 'v4/rocky-verge', tiling: 12, tint: '#e3e1d8', coverage: 0.54, threshold: 0.66, softness: 0.1 },
    ],
    bombing: { cells: 8, scaleMin: 0.8, scaleMax: 1.25, offset: 0.9, rotation: 1, mirror: 1, cellBlend: 0.82 },
    fbm: { scale: 4, strength: 0.28, octaves: 4, lacunarity: 2, gain: 0.5 },
    warp: { scale: 2.2, strength: 0.08, secondaryScale: 2.1 },
    ground: {
      enabled: true,
      baseColor: '#2f542b',
      highlightColor: '#648d50',
      accentColor: '#7daa62',
      patchSize: 22,
      accentPatchSize: 34,
      accentStrength: 0.48,
      octaves: 2,
      detailScale: 6.2,
      detailStrength: 0.18,
      emission: 0.15,
    },
    blend: { macroTint: 0.2, edgeBreakup: 0.55 },
    detail: { tiling: 32, diffuse: 0.34, bump: 0.42, roughness: 0.3 },
    pbr: { baseRoughness: 0.92, ao: 1, metallic: 0 },
    cover: {
      count: 1200,
      variant: -1,
      spread: 248,
      offsetX: 0,
      offsetZ: 0,
      groundOffset: -0.08,
      width: 7,
      height: 3,
      scaleVariation: 0.38,
      colorVariation: 0.18,
      alphaCutoff: 0.1,
      crossedAngle: 90,
      cropPadding: 4,
    },
    blades: {
      count: 100000,
      spread: 104,
      groundOffset: 0.02,
      width: 0.29,
      topWidth: 0.07,
      height: 3.8,
      scaleVariation: 0.92,
      tiltDegrees: 35,
      bendDegrees: 24,
      bendHeightInfluence: 0.7,
      bendJitterDegrees: 8,
      tiltNoisePatchSize: 12,
      tiltCellJitter: 0.5,
      tiltTransitionWidth: 0.32,
      tiltNoiseStrength: 0.1,
      tiltVariationDegrees: 7,
      tiltDirectionJitterDegrees: 90,
      normalCurveDegrees: 52,
      normalFlatten: 0.77,
      viewFacing: 0.6,
      rootOcclusion: 0.88,
      roughness: 0.14,
      specularIntensity: 0.06,
      glintSpread: 0.37,
      glintTipBias: 0.85,
      sideLightEvenness: 1,
      glintColor: '#fffca3',
      diffuseDirectionality: 1,
      tipDropRatio: 0.25,
      rootColor: '#587f49',
      tipColor: '#91b86f',
      tintNoisePatchSize: 25,
      tintNoiseStrength: 1.35,
      tintNoiseColor: '#ffde0a',
      groundBlend: 0.4,
      rootGroundBlend: 0.7,
      growthSyncToGround: 1,
      growthNoisePatchSize: 21,
      growthHeightVariation: 1.2,
      growthMinimumHeightScale: 0.6,
      growthDensityVariation: 1,
      growthDensityExponent: 1.75,
      windNoisePatchSize: 14,
      windTiltDegrees: 18,
      windSpeed: 11,
      windAzimuth: 99,
      windDirectionBias: 0.75,
      windBendExponent: 1.9,
      interactionSphereRadius: 6,
      interactionPushStrength: 0.85,
      interactionSquashStrength: 0.9,
      interactionMaxTiltDegrees: 38,
      interactionGroundClearance: 0.04,
    },
    flowers: {
      count: 280,
      clumpCount: 20,
      clumpRadius: 4.5,
      spread: 96,
      grassHeightRatio: 0.8,
      grassHeightRatioVariation: 0.25,
      windInfluence: 1.04,
      radius: 0.48,
      centerRadius: 0.17,
      centerLift: 0.025,
      scaleVariation: 0.3,
      tiltDegrees: 10,
      petalNormalStrength: 0.85,
      centerNormalStrength: 1.4,
      roughness: 0.68,
      petalColor: '#f4f1dd',
      bluePetalColor: '#2f6dff',
      yellowPetalColor: '#ffd84a',
      blueClumpFraction: 0.06,
      yellowClumpFraction: 0.25,
      pocketClumpFraction: 0.55,
      pocketGrowthThreshold: 0.42,
      centerColor: '#a97651',
    },
    leaves: {
      clumpCount: 16,
      minPlantsPerClump: 3,
      maxPlantsPerClump: 8,
      minLeavesPerPlant: 3,
      maxLeavesPerPlant: 5,
      spread: 96,
      clumpRadius: 5,
      plantSpacing: 1.75,
      shortGrassThreshold: 0.42,
      pocketClumpFraction: 0.65,
      groundOffset: 0.03,
      length: 2.4,
      width: 1.1,
      rise: 0.72,
      scaleVariation: 0.22,
      colorVariation: 0.4,
      yawJitterDegrees: 15,
      seamStrength: 0.75,
      curveStrength: 0.55,
      roughness: 0.66,
      rootGroundBlend: 0.65,
      windInfluence: 0.55,
      edgeColor: '#6b9654',
      bodyColor: '#7faa62',
      centerColor: '#acca7a',
    },
    lighting: {
      ambient: 0.15,
      ambientColor: '#b8f3ff',
      skylight: 0.07,
      sun: 2.21,
      sunColor: '#fffce5',
      sunAzimuth: 293,
      sunElevation: 63,
      exposure: 2.38,
      contrast: 1.36,
    },
  };
}

export function applyGuidedStage(config: TerrainLabConfigV25, selected: TerrainStageKey | 'base'): TerrainLabConfigV25 {
  const next = structuredClone(config);
  const selectedIndex = selected === 'base' ? -1 : TERRAIN_STAGE_KEYS.indexOf(selected);
  for (let index = 0; index < TERRAIN_STAGE_KEYS.length; index++)
    next.stages[TERRAIN_STAGE_KEYS[index]!] = index <= selectedIndex;
  // Sprite cards and polygon blades are alternative cover experiments, not a
  // cumulative material stage. The Blades guide keeps the material pipeline
  // through Detail but isolates the new geometry for a clean comparison.
  if (selected === 'bladeCover') next.stages.groundCover = false;
  if (selected === 'flowerCover') next.stages.groundCover = false;
  if (selected === 'leafCover') next.stages.groundCover = false;
  return next;
}

export function getNumericValue(config: TerrainLabConfigV25, path: string): number {
  let value: unknown = config;
  for (const part of path.split('.')) value = (value as Record<string, unknown>)[part];
  return typeof value === 'number' ? value : 0;
}

export function setNumericValue(
  config: TerrainLabConfigV25,
  control: NumericControl,
  rawValue: number,
): TerrainLabConfigV25 {
  const next = structuredClone(config);
  const parts = control.path.split('.');
  let target = next as unknown as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
  const clamped = Math.max(control.min, Math.min(control.max, Number.isFinite(rawValue) ? rawValue : control.min));
  target[parts.at(-1)!] = control.step >= 1 ? Math.round(clamped) : clamped;
  return next;
}

export function estimateTextureSamples(config: TerrainLabConfigV25): number {
  const surfaces = config.stages.surfaceBlend ? 4 : 1;
  let samples = surfaces * (config.stages.randomization ? 4 : 1);
  if (config.stages.detailPbr) samples += 3;
  return samples;
}

export function shaderVariantKey(config: TerrainLabConfigV25, referenceMode = false): string {
  if (referenceMode) return 'production-reference';
  const stages = TERRAIN_STAGE_KEYS.filter((key) => config.stages[key]).join('+') || 'base';
  const ground = config.ground.enabled ? '+procGround' : '';
  return `${stages}${ground}:o${config.stages.fbm ? config.fbm.octaves : 0}`;
}
