import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { PointerDragBehavior } from '@babylonjs/core/Behaviors/Meshes/pointerDragBehavior.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import '@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery.js';
import '@babylonjs/core/Engines/Extensions/engine.query.js';
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation.js';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import { Material } from '@babylonjs/core/Materials/material.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateScreenshotAsync } from '@babylonjs/core/Misc/screenshotTools.js';
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import '@babylonjs/loaders/glTF/index.js';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
import { Scene } from '@babylonjs/core/scene.js';
import { buildBladeVertexData } from './blade-geometry.js';
import { buildBroadleafVertexData, generateBroadleafGradientData } from './broadleaf-geometry.js';
import { buildFlowerDiscVertexData } from './flower-geometry.js';
import { BladeLightingPlugin } from './blade-lighting-plugin.js';
import { bladeDensityProbability, sampleBladePatch, sampleBladeTiltPatch } from './blade-patch-noise.js';
import { createGroundColorSampler, generateGroundTextureData } from './ground-color.js';
import { cameraRelativeGroundDirection, encodeCrushDirection } from './interaction-motion.js';
import { TERRAIN_REFERENCE_ASSETS } from './catalog.js';
import { estimateTextureSamples, shaderVariantKey, type TerrainDebugView, type TerrainLabConfigV25 } from './config.js';
import { TerrainLabMaterialPlugin } from './terrain-plugin.js';
import { FrameCadenceTracker, passesSixtyHertzCadence } from './frame-cadence.js';

export const CAMERA_PRESETS = ['top', 'high', 'rts', 'close', 'low', 'grazing'] as const;
export type CameraPreset = (typeof CAMERA_PRESETS)[number];

interface PhotoOpBounds {
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
}

export interface TerrainLabDiagnostics {
  fps: number;
  frameMs: number;
  frameP95Ms: number;
  frameP99Ms: number;
  frameMaxMs: number;
  framesOver25Ms: number;
  framesOver33Ms: number;
  gpuFrameMs: number;
  drawCalls: number;
  activeMeshes: number;
  textures: number;
  shaderVariant: string;
  textureSamples: number;
  groundCoverInstances: number;
  bladeCoverInstances: number;
  flowerCoverInstances: number;
  leafCoverInstances: number;
  shaderCompileMs: number;
  ready: boolean;
}

export interface TerrainLabProfileScenario {
  name:
    | 'baseline'
    | 'camera-orbit'
    | 'camera-sweep'
    | 'camera-zoom'
    | 'camera-zoom-no-facing'
    | 'no-shadows'
    | 'no-view-facing'
    | 'no-wind'
    | 'no-interaction'
    | 'no-blades'
    | 'no-flowers'
    | 'no-leaves'
    | 'baseline-repeat';
  samples: number;
  frameMedianMs: number;
  frameP95Ms: number;
  frameP99Ms: number;
  frameMaxMs: number;
  framesOver25Ms: number;
  framesOver33Ms: number;
  gpuMedianMs: number;
  gpuP95Ms: number;
  cpuMedianMs: number;
  drawCallsMedian: number;
  estimatedFps: number;
  savedFrameMedianMs: number;
  savedFrameP95Ms: number;
  savedGpuMedianMs: number;
  savedGpuP95Ms: number;
}

export interface TerrainLabProfileSuite {
  capturedAt: string;
  renderer: string;
  resolution: string;
  hardwareScaling: number;
  bladeInstances: number;
  flowerInstances: number;
  leafInstances: number;
  bladeBuildMs: number;
  groundBuildMs: number;
  target60: boolean;
  target90: boolean;
  gpuHeadroom60: boolean;
  gpuHeadroom90: boolean;
  scenarios: TerrainLabProfileScenario[];
}

export interface TerrainLabStutterSoak {
  capturedAt: string;
  renderer: string;
  resolution: string;
  hardwareScaling: number;
  durationMs: number;
  warmupMs: number;
  bladeInstances: number;
  flowerInstances: number;
  leafInstances: number;
  samples: number;
  frameP95Ms: number;
  frameP99Ms: number;
  frameMaxMs: number;
  framesOver25Ms: number;
  framesOver33Ms: number;
  rateOver25Ms: number;
  rateOver33Ms: number;
  gpuP95Ms: number;
  longTaskCount: number;
  longTaskMaxMs: number;
  target60: boolean;
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * fraction))] ?? 0;
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Alpha bounds measured from the low-resolution 4x2 ground-cover atlas. Cropping the
// transparent cell margins makes width/height controls describe visible art
// and lets the bottom of every card sit on the terrain instead of floating.
const COVER_ALPHA_BOUNDS = [
  [10, 62, 119, 101],
  [9, 61, 117, 101],
  [8, 65, 116, 102],
  [4, 51, 114, 101],
  [10, 49, 121, 94],
  [10, 10, 116, 94],
  [10, 52, 111, 94],
  [5, 51, 115, 94],
] as const;
const COVER_ATLAS_WIDTH = 512,
  COVER_ATLAS_HEIGHT = 256,
  COVER_CELL_SIZE = 128;
const INTERACTION_TRAIL_RESOLUTION = 256,
  INTERACTION_TRAIL_WORLD_SIZE = 256;
// The procedural ground texture spans the whole 256-unit field at ~2
// texels/unit — plenty for soft patches, cheap to regenerate on the CPU.
const GROUND_TEXTURE_RESOLUTION = 512;
const GROUND_WORLD_SIZE = 256;

class LabGroundCover {
  private meshes: Mesh[] = [];
  private materials: StandardMaterial[] = [];
  private atlas: Texture;
  private buildKey = '';
  instanceCount = 0;

  constructor(private scene: Scene) {
    this.atlas = new Texture(TERRAIN_REFERENCE_ASSETS.coverAtlas, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
    this.atlas.hasAlpha = true;
  }

  update(config: TerrainLabConfigV25): void {
    const key = JSON.stringify([config.stages.groundCover, config.seed, config.cover]);
    if (key === this.buildKey) return;
    this.buildKey = key;
    this.clear();
    if (!config.stages.groundCover || config.cover.count <= 0) return;

    const random = seeded(config.seed ^ 0x51f15e);
    const matrices: Matrix[][] = Array.from({ length: 8 }, () => []);
    let placed = 0;
    while (placed < config.cover.count) {
      const variant =
        config.cover.variant < 0
          ? Math.floor(random() * 8)
          : Math.max(0, Math.min(7, Math.round(config.cover.variant)));
      const scale = 1 + (random() * 2 - 1) * config.cover.scaleVariation;
      const x = config.cover.offsetX + (random() - 0.5) * config.cover.spread;
      const z = config.cover.offsetZ + (random() - 0.5) * config.cover.spread;
      const yaw = random() * Math.PI * 2;
      const width = config.cover.width * scale;
      const height = config.cover.height * scale;
      const matrix = Matrix.Compose(
        new Vector3(width, height, width),
        Quaternion.FromEulerAngles(0, yaw, 0),
        new Vector3(x, config.cover.groundOffset, z),
      );
      matrices[variant]!.push(matrix);
      placed++;
    }

    for (let variant = 0; variant < 8; variant++) {
      const variation = 1 + (variant / 7 - 0.5) * config.cover.colorVariation;
      const material = new StandardMaterial(`cover-material-${variant}`, this.scene);
      material.diffuseTexture = this.atlas;
      material.useAlphaFromDiffuseTexture = true;
      material.transparencyMode = Material.MATERIAL_ALPHATEST;
      material.alphaCutOff = config.cover.alphaCutoff;
      material.backFaceCulling = false;
      material.twoSidedLighting = true;
      material.specularColor = Color3.Black();
      material.diffuseColor = new Color3(0.78 * variation, 0.82 * variation, 0.68 * variation);
      material.emissiveTexture = this.atlas;
      material.emissiveColor = new Color3(0.12, 0.14, 0.1);
      this.materials.push(material);
      const mesh = this.createVariantCards(variant, config.cover.crossedAngle, config.cover.cropPadding);
      mesh.material = material;
      mesh.doNotSyncBoundingInfo = true;
      if (matrices[variant]!.length > 0) mesh.thinInstanceAdd(matrices[variant]!);
      else mesh.setEnabled(false);
      this.meshes.push(mesh);
    }
    this.instanceCount = this.meshes.reduce((total, mesh) => total + mesh.thinInstanceCount, 0);
  }

  private createVariantCards(variant: number, crossedAngle: number, cropPadding: number): Mesh {
    const positions: number[] = [],
      normals: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    const column = variant % 4,
      row = Math.floor(variant / 4);
    const bounds = COVER_ALPHA_BOUNDS[variant]!;
    const padding = Math.max(0, Math.min(32, cropPadding));
    const cellX = column * COVER_CELL_SIZE,
      cellY = row * COVER_CELL_SIZE;
    const u0 = (cellX + Math.max(0, bounds[0] - padding)) / COVER_ATLAS_WIDTH;
    const u1 = (cellX + Math.min(COVER_CELL_SIZE - 1, bounds[2] + padding) + 1) / COVER_ATLAS_WIDTH;
    const v0 = (cellY + Math.max(0, bounds[1] - padding)) / COVER_ATLAS_HEIGHT;
    const v1 = (cellY + Math.min(COVER_CELL_SIZE - 1, bounds[3] + padding) + 1) / COVER_ATLAS_HEIGHT;
    for (let plane = 0; plane < 2; plane++) {
      const angle = (plane * crossedAngle * Math.PI) / 180;
      const dx = Math.cos(angle) * 0.5,
        dz = Math.sin(angle) * 0.5;
      const nx = -Math.sin(angle),
        nz = Math.cos(angle),
        base = positions.length / 3;
      positions.push(-dx, 0, -dz, dx, 0, dz, dx, 1, dz, -dx, 1, -dz);
      normals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz);
      uvs.push(u0, v1, u1, v1, u1, v0, u0, v0);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const mesh = new Mesh(`cover-${variant}`, this.scene);
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.uvs = uvs;
    data.indices = indices;
    data.applyToMesh(mesh);
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    return mesh;
  }

  private clear(): void {
    for (const mesh of this.meshes) mesh.dispose();
    for (const material of this.materials) material.dispose(false, false);
    this.meshes = [];
    this.materials = [];
    this.instanceCount = 0;
  }

  dispose(): void {
    this.clear();
    this.atlas.dispose();
  }
}

class LabFlowerCover {
  private meshes: Mesh[] = [];
  private petalMaterial: PBRMaterial;
  private centerMaterial: PBRMaterial;
  private petalPlugin: BladeLightingPlugin;
  private centerPlugin: BladeLightingPlugin;
  private buildKey = '';
  instanceCount = 0;

  constructor(
    private scene: Scene,
    private shadowGenerator: ShadowGenerator,
    interactionTrail: Texture,
  ) {
    this.petalMaterial = this.createMaterial('flower-petal-material');
    this.centerMaterial = this.createMaterial('flower-center-material');
    // Stem mode: flower heads float at the top of an invisible stem, so wind
    // and crush deformation pivot around the ground point beneath each head.
    this.petalPlugin = new BladeLightingPlugin(this.petalMaterial, 1, 0, 0, interactionTrail, true);
    this.centerPlugin = new BladeLightingPlugin(this.centerMaterial, 1, 0, 0, interactionTrail, true);
  }

  update(config: TerrainLabConfigV25): void {
    // Per-instance vertex colors select white, blue, or yellow clumps without
    // splitting the petals into additional materials or draw sources.
    this.petalMaterial.albedoColor = Color3.White();
    this.centerMaterial.albedoColor = Color3.FromHexString(config.flowers.centerColor);
    this.petalMaterial.roughness = config.flowers.roughness;
    this.centerMaterial.roughness = config.flowers.roughness;
    const flowerWind = {
      noisePatchSize: config.blades.windNoisePatchSize,
      tiltDegrees: config.blades.windTiltDegrees * config.flowers.windInfluence,
      speed: config.blades.windSpeed,
      azimuth: config.blades.windAzimuth,
      directionBias: config.blades.windDirectionBias,
      bendExponent: config.blades.windBendExponent,
    };
    const flowerInteraction = {
      radius: config.blades.interactionSphereRadius,
      pushStrength: config.blades.interactionPushStrength,
      squashStrength: config.blades.interactionSquashStrength,
      maxTiltDegrees: config.blades.interactionMaxTiltDegrees,
      groundClearance: config.blades.interactionGroundClearance,
    };
    for (const plugin of [this.petalPlugin, this.centerPlugin])
      plugin.update(
        1,
        0,
        0,
        { r: 1, g: 1, b: 1 },
        0,
        0,
        0,
        1,
        0.1,
        0.1,
        0,
        0,
        flowerWind,
        flowerInteraction,
        config.seed,
      );
    const key = JSON.stringify([config.stages.flowerCover, config.seed, config.flowers]);
    if (key === this.buildKey) return;
    this.buildKey = key;
    this.clear();
    if (!config.stages.flowerCover || config.flowers.count <= 0) return;

    const flower = config.flowers;
    const petalMesh = this.createDiscMesh(
      'flower-petals',
      flower.radius,
      0,
      flower.petalNormalStrength,
      'cone',
      this.petalMaterial,
    );
    const centerMesh = this.createDiscMesh(
      'flower-centers',
      Math.min(flower.radius, flower.centerRadius),
      flower.centerLift,
      flower.centerNormalStrength,
      'bump',
      this.centerMaterial,
    );

    const random = seeded(config.seed ^ 0xf10e3);
    const pocketRandom = seeded(config.seed ^ 0xf10e31);
    const scatterRandom = seeded(config.seed ^ 0xf10e32);
    const placementModeRandom = seeded(config.seed ^ 0xf10e33);
    const clumpCount = Math.max(1, Math.min(flower.count, Math.round(flower.clumpCount)));
    const fieldRadius = Math.max(0, flower.spread * 0.5 - flower.clumpRadius);
    const clumpCenters: Vector3[] = [];
    const primaryPetal = Color3.FromHexString(flower.petalColor).toLinearSpace();
    const bluePetal = Color3.FromHexString(flower.bluePetalColor).toLinearSpace();
    const yellowPetal = Color3.FromHexString(flower.yellowPetalColor).toLinearSpace();
    const blueClumps = Math.min(clumpCount, Math.round(clumpCount * Math.max(0, flower.blueClumpFraction)));
    const yellowClumps = Math.min(
      clumpCount - blueClumps,
      Math.round(clumpCount * Math.max(0, flower.yellowClumpFraction)),
    );
    const clumpPetalColors: Color3[] = [
      ...Array<Color3>(blueClumps).fill(bluePetal),
      ...Array<Color3>(yellowClumps).fill(yellowPetal),
      ...Array<Color3>(clumpCount - blueClumps - yellowClumps).fill(primaryPetal),
    ];
    const colorRandom = seeded(config.seed ^ 0xc01045);
    for (let index = clumpPetalColors.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(colorRandom() * (index + 1));
      [clumpPetalColors[index], clumpPetalColors[swapIndex]] = [
        clumpPetalColors[swapIndex]!,
        clumpPetalColors[index]!,
      ];
    }
    const groundSampler = createGroundColorSampler(config.seed, config.ground);
    const sampleGrowth = (x: number, z: number): number =>
      config.blades.growthSyncToGround >= 0.5
        ? groundSampler.samplePatches(x, z)
        : sampleBladePatch(
            x,
            z,
            config.seed,
            config.blades.tintNoisePatchSize,
            config.blades.growthNoisePatchSize,
            0,
            0,
            config.blades.growthDensityExponent,
          ).growth;
    const pocketClumps = Math.round(clumpCount * Math.max(0, Math.min(1, flower.pocketClumpFraction)));
    const pocketModes = [
      ...Array<boolean>(pocketClumps).fill(true),
      ...Array<boolean>(clumpCount - pocketClumps).fill(false),
    ];
    for (let index = pocketModes.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(placementModeRandom() * (index + 1));
      [pocketModes[index], pocketModes[swapIndex]] = [pocketModes[swapIndex]!, pocketModes[index]!];
    }
    for (let index = 0; index < clumpCount; index++) {
      const prefersPocket = pocketModes[index]!;
      const centerRandom = prefersPocket ? pocketRandom : scatterRandom;
      let selectedX = 0;
      let selectedZ = 0;
      let selectedGrowth = Number.POSITIVE_INFINITY;
      const attempts = prefersPocket ? 24 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const distance = Math.sqrt(centerRandom()) * fieldRadius;
        const angle = centerRandom() * Math.PI * 2;
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        const growth = sampleGrowth(x, z);
        if (growth < selectedGrowth) {
          selectedX = x;
          selectedZ = z;
          selectedGrowth = growth;
        }
        if (prefersPocket && growth <= flower.pocketGrowthThreshold) break;
      }
      clumpCenters.push(new Vector3(selectedX, 0, selectedZ));
    }

    const matrices: Matrix[] = [];
    const petalColors = new Float32Array(flower.count * 4);
    const maximumTilt = (flower.tiltDegrees * Math.PI) / 180;
    for (let index = 0; index < flower.count; index++) {
      const clumpIndex = index % clumpCount;
      const center = clumpCenters[clumpIndex]!;
      const distance = Math.sqrt(random()) * flower.clumpRadius;
      const angle = random() * Math.PI * 2;
      const scale = Math.max(0.1, 1 + (random() * 2 - 1) * flower.scaleVariation);
      const x = center.x + Math.cos(angle) * distance;
      const z = center.z + Math.sin(angle) * distance;
      const growth = sampleGrowth(x, z);
      const localGrassScale = Math.max(
        config.blades.growthMinimumHeightScale,
        Math.max(0.12, 1 + config.blades.growthHeightVariation * (growth * 2 - 1)),
      );
      const heightRatio = Math.max(
        0.05,
        flower.grassHeightRatio + (random() * 2 - 1) * flower.grassHeightRatioVariation,
      );
      const flowerY = config.blades.height * localGrassScale * heightRatio;
      const rotation = Quaternion.FromEulerAngles(
        (random() * 2 - 1) * maximumTilt,
        random() * Math.PI * 2,
        (random() * 2 - 1) * maximumTilt,
      );
      matrices.push(
        Matrix.Compose(
          new Vector3(scale, scale, scale),
          rotation,
          new Vector3(x, flowerY, z),
        ),
      );
      const petalColor = clumpPetalColors[clumpIndex]!;
      const colorOffset = index * 4;
      petalColors[colorOffset] = petalColor.r;
      petalColors[colorOffset + 1] = petalColor.g;
      petalColors[colorOffset + 2] = petalColor.b;
      petalColors[colorOffset + 3] = 1;
    }

    petalMesh.thinInstanceAdd(matrices);
    petalMesh.thinInstanceSetBuffer('color', petalColors, 4, true);
    petalMesh.useVertexColors = true;
    petalMesh.hasVertexAlpha = false;
    centerMesh.thinInstanceAdd(matrices);
    // The lighting plugin declares these per-instance attributes; flowers use
    // neither root-ground blending nor the static origami fold, so bind zeros.
    const rootGroundZeros = new Float32Array(flower.count * 3);
    const bendZeros = new Float32Array(flower.count);
    for (const mesh of [petalMesh, centerMesh]) {
      mesh.thinInstanceSetBuffer('bladeRootGround', rootGroundZeros, 3, true);
      mesh.thinInstanceSetBuffer('bladeBend', bendZeros, 1, true);
    }
    this.meshes.push(petalMesh, centerMesh);
    this.instanceCount = flower.count;
  }

  advanceWind(deltaSeconds: number): void {
    this.petalPlugin.advanceWind(deltaSeconds);
    this.centerPlugin.advanceWind(deltaSeconds);
  }

  setInteractionCenter(x: number, z: number): void {
    this.petalPlugin.setInteractionCenter(x, z);
    this.centerPlugin.setInteractionCenter(x, z);
  }

  private createMaterial(name: string): PBRMaterial {
    const material = new PBRMaterial(name, this.scene);
    material.metallic = 0;
    material.roughness = 0.68;
    material.environmentIntensity = 0.2;
    material.backFaceCulling = true;
    return material;
  }

  private createDiscMesh(
    name: string,
    radius: number,
    y: number,
    normalStrength: number,
    profile: 'cone' | 'bump',
    material: PBRMaterial,
  ): Mesh {
    const disc = buildFlowerDiscVertexData({ radius, segments: 8, normalStrength, profile });
    for (let index = 1; index < disc.positions.length; index += 3) disc.positions[index] = y;
    const mesh = new Mesh(name, this.scene);
    const data = new VertexData();
    data.positions = disc.positions;
    data.normals = disc.normals;
    data.indices = disc.indices;
    data.applyToMesh(mesh);
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    mesh.doNotSyncBoundingInfo = true;
    mesh.alwaysSelectAsActiveMesh = true;
    this.shadowGenerator.addShadowCaster(mesh);
    return mesh;
  }

  private clear(): void {
    for (const mesh of this.meshes) {
      this.shadowGenerator.removeShadowCaster(mesh);
      mesh.dispose();
    }
    this.meshes = [];
    this.instanceCount = 0;
  }

  dispose(): void {
    this.clear();
    this.petalMaterial.dispose(false, false);
    this.centerMaterial.dispose(false, false);
  }
}

class LabBroadleafCover {
  private mesh: Mesh | null = null;
  private material: PBRMaterial;
  private gradientTexture: RawTexture;
  private lightingPlugin: BladeLightingPlugin;
  private buildKey = '';
  instanceCount = 0;
  plantCount = 0;

  constructor(
    private scene: Scene,
    private shadowGenerator: ShadowGenerator,
    interactionTrail: Texture,
  ) {
    this.gradientTexture = new RawTexture(
      new Uint8Array(32 * 64 * 4),
      32,
      64,
      Engine.TEXTUREFORMAT_RGBA,
      scene,
      false,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    this.gradientTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.gradientTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.gradientTexture.gammaSpace = true;
    this.material = new PBRMaterial('broadleaf-cover-material', scene);
    this.material.albedoColor = Color3.White();
    this.material.albedoTexture = this.gradientTexture;
    this.material.metallic = 0;
    this.material.roughness = 0.66;
    this.material.environmentIntensity = 0.15;
    this.material.backFaceCulling = false;
    this.material.twoSidedLighting = true;
    this.lightingPlugin = new BladeLightingPlugin(this.material, 0.6, 0, 0.45, interactionTrail);
  }

  update(config: TerrainLabConfigV25): void {
    const leaf = config.leaves;
    this.material.roughness = leaf.roughness;
    this.lightingPlugin.update(
      0.6,
      0,
      0.45,
      Color3.FromHexString(leaf.centerColor).toLinearSpace(),
      0,
      0,
      0.25,
      leaf.rise,
      leaf.width,
      leaf.width,
      0,
      leaf.rootGroundBlend,
      {
        noisePatchSize: config.blades.windNoisePatchSize,
        tiltDegrees: config.blades.windTiltDegrees * leaf.windInfluence,
        speed: config.blades.windSpeed,
        azimuth: config.blades.windAzimuth,
        directionBias: config.blades.windDirectionBias,
        bendExponent: config.blades.windBendExponent,
      },
      {
        radius: config.blades.interactionSphereRadius,
        pushStrength: config.blades.interactionPushStrength,
        squashStrength: config.blades.interactionSquashStrength,
        maxTiltDegrees: config.blades.interactionMaxTiltDegrees,
        groundClearance: config.blades.interactionGroundClearance,
      },
      config.seed,
    );

    const key = JSON.stringify([
      config.stages.leafCover,
      config.seed,
      leaf,
      config.ground,
      config.blades.growthSyncToGround,
      config.blades.growthNoisePatchSize,
    ]);
    if (key === this.buildKey) return;
    this.buildKey = key;
    this.clear();
    this.gradientTexture.update(
      generateBroadleafGradientData(32, 64, leaf.edgeColor, leaf.bodyColor, leaf.centerColor),
    );
    if (!config.stages.leafCover || leaf.clumpCount <= 0) return;

    this.mesh = this.createMesh(leaf);
    this.mesh.material = this.material;
    this.mesh.receiveShadows = true;
    this.mesh.doNotSyncBoundingInfo = true;
    this.mesh.alwaysSelectAsActiveMesh = true;

    const random = seeded(config.seed ^ 0x1eaf25);
    const colorRandom = seeded(config.seed ^ 0xc01eaf);
    const pocketRandom = seeded(config.seed ^ 0x1eaf251);
    const scatterRandom = seeded(config.seed ^ 0x1eaf252);
    const placementModeRandom = seeded(config.seed ^ 0x1eaf253);
    const clumpCount = Math.max(0, Math.round(leaf.clumpCount));
    const minPlants = Math.max(1, Math.min(8, Math.round(leaf.minPlantsPerClump)));
    const maxPlants = Math.max(minPlants, Math.min(8, Math.round(leaf.maxPlantsPerClump)));
    const minLeaves = Math.max(1, Math.min(5, Math.round(leaf.minLeavesPerPlant)));
    const maxLeaves = Math.max(minLeaves, Math.min(5, Math.round(leaf.maxLeavesPerPlant)));
    const maximumLeaves = clumpCount * maxPlants * maxLeaves;
    const matrices = new Float32Array(maximumLeaves * 16);
    const instanceColors = new Float32Array(maximumLeaves * 4);
    const rootGroundColors = new Float32Array(maximumLeaves * 3);
    const bendAngles = new Float32Array(maximumLeaves);
    const groundSampler = createGroundColorSampler(config.seed, config.ground);
    const sampleGrowth = (x: number, z: number): number =>
      config.blades.growthSyncToGround >= 0.5
        ? groundSampler.samplePatches(x, z)
        : sampleBladePatch(
            x,
            z,
            config.seed,
            config.blades.tintNoisePatchSize,
            config.blades.growthNoisePatchSize,
            0,
            0,
            config.blades.growthDensityExponent,
          ).growth;
    const fieldRadius = Math.max(0, leaf.spread * 0.5 - leaf.clumpRadius);
    const clumpCenters: Vector3[] = [];
    const pocketClumps = Math.round(clumpCount * Math.max(0, Math.min(1, leaf.pocketClumpFraction)));
    const pocketModes = [
      ...Array<boolean>(pocketClumps).fill(true),
      ...Array<boolean>(clumpCount - pocketClumps).fill(false),
    ];
    for (let index = pocketModes.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(placementModeRandom() * (index + 1));
      [pocketModes[index], pocketModes[swapIndex]] = [pocketModes[swapIndex]!, pocketModes[index]!];
    }
    for (let clumpIndex = 0; clumpIndex < clumpCount; clumpIndex++) {
      const prefersPocket = pocketModes[clumpIndex]!;
      const centerRandom = prefersPocket ? pocketRandom : scatterRandom;
      let selectedX = 0;
      let selectedZ = 0;
      let selectedGrowth = Number.POSITIVE_INFINITY;
      let accepted = false;
      const attempts = prefersPocket ? 96 : 32;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const distance = Math.sqrt(centerRandom()) * fieldRadius;
        const angle = centerRandom() * Math.PI * 2;
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        const separated = clumpCenters.every(
          (center) => Math.hypot(center.x - x, center.z - z) >= leaf.clumpRadius * 2,
        );
        const growth = sampleGrowth(x, z);
        if (separated && (prefersPocket ? growth < selectedGrowth : !accepted)) {
          selectedX = x;
          selectedZ = z;
          selectedGrowth = growth;
        }
        if (separated && (!prefersPocket || growth <= leaf.shortGrassThreshold)) {
          selectedX = x;
          selectedZ = z;
          accepted = true;
          break;
        }
      }
      if (!accepted && !Number.isFinite(selectedGrowth)) {
        const angle = centerRandom() * Math.PI * 2;
        selectedX = Math.cos(angle) * fieldRadius;
        selectedZ = Math.sin(angle) * fieldRadius;
      }
      clumpCenters.push(new Vector3(selectedX, leaf.groundOffset, selectedZ));
    }

    const matrix = Matrix.Identity();
    const scaleVector = new Vector3();
    const position = new Vector3();
    const rotation = Quaternion.Identity();
    const yawJitter = (leaf.yawJitterDegrees * Math.PI) / 180;
    let writtenLeaves = 0;
    let writtenPlants = 0;
    for (const clumpCenter of clumpCenters) {
      const clumpHue = (colorRandom() * 2 - 1) * leaf.colorVariation;
      const clumpBrightness = 1 + (colorRandom() * 2 - 1) * leaf.colorVariation * 0.18;
      const plantTarget = minPlants + Math.floor(random() * (maxPlants - minPlants + 1));
      const plants: Vector3[] = [];
      for (let plantIndex = 0; plantIndex < plantTarget; plantIndex++) {
        let bestX = clumpCenter.x;
        let bestZ = clumpCenter.z;
        let bestSeparation = -1;
        for (let attempt = 0; attempt < 32; attempt++) {
          const distance = Math.sqrt(random()) * leaf.clumpRadius;
          const angle = random() * Math.PI * 2;
          const x = clumpCenter.x + Math.cos(angle) * distance;
          const z = clumpCenter.z + Math.sin(angle) * distance;
          const separation = plants.length
            ? Math.min(...plants.map((plant) => Math.hypot(plant.x - x, plant.z - z)))
            : Number.POSITIVE_INFINITY;
          if (separation > bestSeparation) {
            bestSeparation = separation;
            bestX = x;
            bestZ = z;
          }
          if (separation >= leaf.plantSpacing) break;
        }
        const plant = new Vector3(bestX, leaf.groundOffset, bestZ);
        plants.push(plant);
        writtenPlants++;
        const plantHue = clumpHue + (colorRandom() * 2 - 1) * leaf.colorVariation * 0.25;
        const plantBrightness = clumpBrightness * (1 + (colorRandom() * 2 - 1) * leaf.colorVariation * 0.08);
        const colorR = Math.max(0.55, Math.min(1.45, plantBrightness * (1 + plantHue * 0.35)));
        const colorG = Math.max(0.55, Math.min(1.45, plantBrightness * (1 + plantHue * 0.08)));
        const colorB = Math.max(0.55, Math.min(1.45, plantBrightness * (1 - plantHue * 0.3)));
        const leafCount = minLeaves + Math.floor(random() * (maxLeaves - minLeaves + 1));
        const phase = random() * Math.PI * 2;
        for (let leafIndex = 0; leafIndex < leafCount; leafIndex++) {
          const yaw = phase + (leafIndex / leafCount) * Math.PI * 2 + (random() * 2 - 1) * yawJitter;
          const scale = Math.max(0.1, 1 + (random() * 2 - 1) * leaf.scaleVariation);
          Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, rotation);
          scaleVector.setAll(scale);
          position.copyFrom(plant);
          Matrix.ComposeToRef(scaleVector, rotation, position, matrix);
          matrix.copyToArray(matrices, writtenLeaves * 16);
          const ground = groundSampler.sample(plant.x, plant.z);
          const rootOffset = writtenLeaves * 3;
          rootGroundColors[rootOffset] = ground.r;
          rootGroundColors[rootOffset + 1] = ground.g;
          rootGroundColors[rootOffset + 2] = ground.b;
          const colorOffset = writtenLeaves * 4;
          instanceColors[colorOffset] = colorR;
          instanceColors[colorOffset + 1] = colorG;
          instanceColors[colorOffset + 2] = colorB;
          instanceColors[colorOffset + 3] = 1;
          writtenLeaves++;
        }
      }
    }
    this.mesh.thinInstanceSetBuffer('matrix', matrices.subarray(0, writtenLeaves * 16), 16, true);
    this.mesh.thinInstanceSetBuffer('color', instanceColors.subarray(0, writtenLeaves * 4), 4, true);
    this.mesh.thinInstanceSetBuffer('bladeRootGround', rootGroundColors.subarray(0, writtenLeaves * 3), 3, true);
    this.mesh.thinInstanceSetBuffer('bladeBend', bendAngles.subarray(0, writtenLeaves), 1, true);
    // The visible pass is forced active, but the shadow render target still
    // frustum-tests its explicit render list. Refresh the aggregate thin-
    // instance bounds before registering the caster so off-origin rosettes
    // participate in the directional shadow pass.
    this.mesh.thinInstanceRefreshBoundingInfo(true);
    this.shadowGenerator.addShadowCaster(this.mesh);
    this.instanceCount = writtenLeaves;
    this.plantCount = writtenPlants;
  }

  advanceWind(deltaSeconds: number): void {
    this.lightingPlugin.advanceWind(deltaSeconds);
  }

  setInteractionCenter(x: number, z: number): void {
    this.lightingPlugin.setInteractionCenter(x, z);
  }

  private createMesh(settings: TerrainLabConfigV25['leaves']): Mesh {
    const leaf = buildBroadleafVertexData(settings);
    const mesh = new Mesh('broadleaf-cover', this.scene);
    const data = new VertexData();
    data.positions = leaf.positions;
    data.normals = leaf.normals;
    data.colors = leaf.colors;
    data.uvs = leaf.uvs;
    data.indices = leaf.indices;
    data.applyToMesh(mesh);
    mesh.setVerticesData('bladeSpecNormal', leaf.specNormals, false, 3);
    mesh.setVerticesData('bladeFoldWeight', leaf.foldWeights, false, 1);
    mesh.useVertexColors = true;
    mesh.hasVertexAlpha = false;
    mesh.isPickable = false;
    return mesh;
  }

  private clear(): void {
    if (this.mesh) {
      this.shadowGenerator.removeShadowCaster(this.mesh);
      this.mesh.dispose(false, false);
    }
    this.mesh = null;
    this.instanceCount = 0;
    this.plantCount = 0;
  }

  dispose(): void {
    this.clear();
    this.material.dispose(false, false);
    this.gradientTexture.dispose();
  }
}

class LabBladeCover {
  private mesh: Mesh | null = null;
  private material: PBRMaterial;
  private lightingPlugin: BladeLightingPlugin;
  private buildKey = '';
  instanceCount = 0;
  lastBuildMs = 0;

  constructor(
    private scene: Scene,
    interactionTrail: Texture,
  ) {
    this.material = new PBRMaterial('blade-cover-material', scene);
    // Vertex colors carry the adjustable root-to-tip gradient; white albedo
    // keeps the material from tinting that authored gradient a second time.
    this.material.albedoColor = Color3.White();
    this.material.emissiveColor = Color3.FromHexString('#52663a');
    this.material.emissiveIntensity = 0.08;
    this.material.metallic = 0;
    this.material.roughness = 0.72;
    this.material.specularIntensity = 0.35;
    this.material.environmentIntensity = 0;
    // The mesh duplicates vertices and normals for the reverse face, so keep
    // culling enabled and let each visible side use its natural face normal.
    this.material.backFaceCulling = true;
    this.lightingPlugin = new BladeLightingPlugin(this.material, 0.08, 0.6, 0.25, interactionTrail);
  }

  update(config: TerrainLabConfigV25): void {
    this.material.roughness = config.blades.roughness;
    this.material.specularIntensity = config.blades.specularIntensity;
    this.material.environmentIntensity = 0;
    this.lightingPlugin.update(
      config.blades.diffuseDirectionality,
      config.blades.viewFacing,
      config.blades.glintSpread,
      Color3.FromHexString(config.blades.glintColor).toLinearSpace(),
      config.blades.glintTipBias,
      config.blades.sideLightEvenness,
      config.blades.rootOcclusion,
      config.blades.height,
      config.blades.width,
      config.blades.topWidth,
      config.blades.tipDropRatio,
      config.blades.rootGroundBlend,
      {
        noisePatchSize: config.blades.windNoisePatchSize,
        tiltDegrees: config.blades.windTiltDegrees,
        speed: config.blades.windSpeed,
        azimuth: config.blades.windAzimuth,
        directionBias: config.blades.windDirectionBias,
        bendExponent: config.blades.windBendExponent,
      },
      {
        radius: config.blades.interactionSphereRadius,
        pushStrength: config.blades.interactionPushStrength,
        squashStrength: config.blades.interactionSquashStrength,
        maxTiltDegrees: config.blades.interactionMaxTiltDegrees,
        groundClearance: config.blades.interactionGroundClearance,
      },
      config.seed,
    );
    // Shader-only blade settings update uniforms above without paying to
    // regenerate the static geometry, placement matrices, or patch colors.
    const blade = config.blades;
    const key = JSON.stringify([
      config.stages.bladeCover,
      config.seed,
      blade.count,
      blade.spread,
      blade.groundOffset,
      blade.width,
      blade.topWidth,
      blade.height,
      blade.scaleVariation,
      blade.tiltDegrees,
      blade.bendDegrees,
      blade.bendHeightInfluence,
      blade.bendJitterDegrees,
      blade.tiltNoisePatchSize,
      blade.tiltCellJitter,
      blade.tiltTransitionWidth,
      blade.tiltNoiseStrength,
      blade.tiltVariationDegrees,
      blade.tiltDirectionJitterDegrees,
      blade.normalCurveDegrees,
      blade.normalFlatten,
      blade.tipDropRatio,
      blade.rootColor,
      blade.tipColor,
      blade.tintNoisePatchSize,
      blade.tintNoiseStrength,
      blade.tintNoiseColor,
      blade.growthNoisePatchSize,
      blade.growthHeightVariation,
      blade.growthMinimumHeightScale,
      blade.growthDensityVariation,
      blade.growthDensityExponent,
      blade.groundBlend,
      blade.growthSyncToGround,
      config.ground,
    ]);
    if (key === this.buildKey) return;
    const buildStartedAt = performance.now();
    this.buildKey = key;
    this.clear();
    if (!config.stages.bladeCover || config.blades.count <= 0) {
      this.lastBuildMs = performance.now() - buildStartedAt;
      return;
    }

    const { count, spread, groundOffset, width, topWidth, height, scaleVariation, tiltDegrees } = config.blades;
    this.mesh = this.createBladeMesh(
      width,
      topWidth,
      height,
      config.blades.rootColor,
      config.blades.tipColor,
      config.blades.normalCurveDegrees,
      config.blades.normalFlatten,
      config.blades.tipDropRatio,
    );
    this.mesh.material = this.material;
    this.mesh.receiveShadows = true;
    this.mesh.doNotSyncBoundingInfo = true;
    this.mesh.alwaysSelectAsActiveMesh = true;

    const random = seeded(config.seed ^ 0xb1ade);
    const bendRandom = seeded(config.seed ^ 0xb3ed);
    const side = Math.ceil(Math.sqrt(count));
    const cell = spread / side;
    const matrices = new Float32Array(count * 16);
    const instanceColors = new Float32Array(count * 4);
    const rootGroundColors = new Float32Array(count * 3);
    const bendAngles = new Float32Array(count);
    const matrix = Matrix.Identity();
    const scaleVector = new Vector3();
    const position = new Vector3();
    const rotation = Quaternion.Identity();
    const baseTilt = (tiltDegrees * Math.PI) / 180;
    const tiltVariation = (config.blades.tiltVariationDegrees * Math.PI) / 180;
    const directionJitter = (config.blades.tiltDirectionJitterDegrees * Math.PI) / 180;
    const baseBend = (config.blades.bendDegrees * Math.PI) / 180;
    const bendJitter = (config.blades.bendJitterDegrees * Math.PI) / 180;
    const tintColor = Color3.FromHexString(config.blades.tintNoiseColor).toLinearSpace();
    const tintLuminance = Math.max(0.001, tintColor.r * 0.2126 + tintColor.g * 0.7152 + tintColor.b * 0.0722);
    const tintMultiplier = new Color3(
      Math.max(0.25, Math.min(2, tintColor.r / tintLuminance)),
      Math.max(0.25, Math.min(2, tintColor.g / tintLuminance)),
      Math.max(0.25, Math.min(2, tintColor.b / tintLuminance)),
    );
    // Ground blend steers each blade's multiplier toward the procedural
    // ground color sampled at its root — the same sampler that fills the
    // ground albedo texture, so grass patches align with ground patches.
    const groundBlend = Math.max(0, Math.min(1, config.blades.groundBlend));
    const groundSampler = createGroundColorSampler(config.seed, config.ground);
    const rootLinear = Color3.FromHexString(config.blades.rootColor).toLinearSpace();
    const tipLinear = Color3.FromHexString(config.blades.tipColor).toLinearSpace();
    const rootVisible = 1 - Math.max(0, Math.min(1, config.blades.rootOcclusion));
    const midColor = {
      r: Math.max(0.001, (rootLinear.r * rootVisible + tipLinear.r) / 2),
      g: Math.max(0.001, (rootLinear.g * rootVisible + tipLinear.g) / 2),
      b: Math.max(0.001, (rootLinear.b * rootVisible + tipLinear.b) / 2),
    };
    let accepted = 0;
    for (let index = 0; index < count; index++) {
      const column = index % side,
        row = Math.floor(index / side);
      const jitterX = (random() - 0.5) * cell * 0.78;
      const jitterZ = (random() - 0.5) * cell * 0.78;
      const densityRoll = random();
      const scale = 1 + (random() * 2 - 1) * scaleVariation;
      const bladeDirectionJitter = (random() * 2 - 1) * directionJitter;
      const bladeTiltJitter = (random() * 2 - 1) * tiltVariation;
      const bladeBendJitter = (bendRandom() * 2 - 1) * bendJitter;
      const x = -spread / 2 + (column + 0.5) * cell + jitterX;
      const z = -spread / 2 + (row + 0.5) * cell + jitterZ;
      const patch = sampleBladePatch(
        x,
        z,
        config.seed,
        config.blades.tintNoisePatchSize,
        config.blades.growthNoisePatchSize,
        config.blades.growthHeightVariation,
        config.blades.growthDensityVariation,
        config.blades.growthDensityExponent,
      );
      const tiltPatch = sampleBladeTiltPatch(
        x,
        z,
        config.seed,
        config.blades.tiltNoisePatchSize,
        config.blades.tiltCellJitter,
        config.blades.tiltTransitionWidth,
      );
      // Syncing growth to the ground swaps the independent growth field for
      // the exact patch noise that colors the ground, so height and density
      // follow the same patches the eye sees in the terrain.
      let heightFactor = patch.heightFactor;
      let densityProbability = patch.densityProbability;
      if (config.blades.growthSyncToGround >= 0.5) {
        const growth = groundSampler.samplePatches(x, z);
        heightFactor = Math.max(0.12, 1 + config.blades.growthHeightVariation * (growth * 2 - 1));
        densityProbability = bladeDensityProbability(
          growth,
          config.blades.growthDensityVariation,
          config.blades.growthDensityExponent,
        );
      }
      if (densityRoll > densityProbability) continue;
      // Discrete RG from the cellular clump field orients the flat blade and
      // its +Z wilt direction together. B varies the shared clump lean around
      // the 35° default. Small independent direction and tilt jitters soften
      // cell interiors without turning their irregular boundaries back into
      // one continuously flowing vector field.
      const yaw = Math.atan2(tiltPatch.directionX, tiltPatch.directionZ) + bladeDirectionJitter;
      const clumpTiltFactor = 1 + (tiltPatch.strength * 2 - 1) * config.blades.tiltNoiseStrength;
      const lean = Math.max(0, Math.min(Math.PI * 0.49, baseTilt * clumpTiltFactor + bladeTiltJitter));
      Quaternion.RotationYawPitchRollToRef(yaw, lean, 0, rotation);
      const retainedHeightScale = Math.max(config.blades.growthMinimumHeightScale, scale * heightFactor);
      scaleVector.set(scale, retainedHeightScale, scale);
      position.set(x, groundOffset, z);
      Matrix.ComposeToRef(scaleVector, rotation, position, matrix);
      matrix.copyToArray(matrices, accepted * 16);
      const relativeHeight = Math.max(0, Math.min(2, retainedHeightScale));
      const heightBendMultiplier = 1 + (relativeHeight - 1) * config.blades.bendHeightInfluence;
      bendAngles[accepted] = Math.max(0, Math.min(Math.PI / 3, baseBend * heightBendMultiplier + bladeBendJitter));
      const tintStrength = config.blades.tintNoiseStrength;
      const tintAmount = tintStrength * patch.tint;
      const tintBrightness = Math.max(0.45, 1 + (patch.tint * 2 - 1) * 0.35 * tintStrength);
      const colorOffset = accepted * 4;
      const ground = groundSampler.sample(x, z);
      let multiplierR = (1 + (tintMultiplier.r - 1) * tintAmount) * tintBrightness;
      let multiplierG = (1 + (tintMultiplier.g - 1) * tintAmount) * tintBrightness;
      let multiplierB = (1 + (tintMultiplier.b - 1) * tintAmount) * tintBrightness;
      if (groundBlend > 0) {
        const groundR = Math.max(0.25, Math.min(2, ground.r / midColor.r));
        const groundG = Math.max(0.25, Math.min(2, ground.g / midColor.g));
        const groundB = Math.max(0.25, Math.min(2, ground.b / midColor.b));
        multiplierR += (groundR - multiplierR) * groundBlend;
        multiplierG += (groundG - multiplierG) * groundBlend;
        multiplierB += (groundB - multiplierB) * groundBlend;
      }
      instanceColors[colorOffset] = multiplierR;
      instanceColors[colorOffset + 1] = multiplierG;
      instanceColors[colorOffset + 2] = multiplierB;
      instanceColors[colorOffset + 3] = 1;
      const rootOffset = accepted * 3;
      rootGroundColors[rootOffset] = ground.r;
      rootGroundColors[rootOffset + 1] = ground.g;
      rootGroundColors[rootOffset + 2] = ground.b;
      accepted++;
    }
    this.mesh.thinInstanceSetBuffer('matrix', matrices.subarray(0, accepted * 16), 16, true);
    this.mesh.thinInstanceSetBuffer('instanceColor', instanceColors.subarray(0, accepted * 4), 4, true);
    this.mesh.thinInstanceSetBuffer('bladeRootGround', rootGroundColors.subarray(0, accepted * 3), 3, true);
    this.mesh.thinInstanceSetBuffer('bladeBend', bendAngles.subarray(0, accepted), 1, true);
    this.instanceCount = accepted;
    this.lastBuildMs = performance.now() - buildStartedAt;
  }

  advanceWind(deltaSeconds: number): void {
    this.lightingPlugin.advanceWind(deltaSeconds);
  }

  setInteractionCenter(x: number, z: number): void {
    this.lightingPlugin.setInteractionCenter(x, z);
  }

  private createBladeMesh(
    width: number,
    topWidth: number,
    height: number,
    rootColor: string,
    tipColor: string,
    normalCurveDegrees: number,
    normalFlatten: number,
    tipDropRatio: number,
  ): Mesh {
    const blade = buildBladeVertexData({
      width,
      topWidth,
      height,
      rootColor,
      tipColor,
      normalCurveDegrees,
      normalFlatten,
      tipDropRatio,
    });
    const mesh = new Mesh('blade-cover-origami', this.scene);
    const data = new VertexData();
    data.positions = blade.positions;
    data.normals = blade.normals;
    data.colors = blade.colors;
    data.indices = blade.indices;
    data.applyToMesh(mesh);
    mesh.setVerticesData('bladeSpecNormal', blade.specNormals, false, 3);
    mesh.setVerticesData('bladeFoldWeight', blade.foldWeights, false, 1);
    mesh.useVertexColors = true;
    mesh.hasVertexAlpha = false;
    mesh.isPickable = false;
    return mesh;
  }

  private clear(): void {
    this.mesh?.dispose(false, false);
    this.mesh = null;
    this.instanceCount = 0;
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
  }
}

export class TerrainLabScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  private terrain: Mesh;
  private terrainBaseUvs: Float32Array;
  private material: PBRMaterial;
  private plugin: TerrainLabMaterialPlugin;
  private groundTexture: RawTexture;
  private groundKey = '';
  private lastGroundBuildMs = 0;
  private ambient: HemisphericLight;
  private groundBounce: HemisphericLight;
  private sun: DirectionalLight;
  private shadowGenerator: ShadowGenerator;
  private relicReady = false;
  private stopSignReady = false;
  private interactionSphere: Mesh;
  private interactionTrailTexture: RawTexture;
  private interactionTrailData = new Uint8Array(INTERACTION_TRAIL_RESOLUTION * INTERACTION_TRAIL_RESOLUTION * 4);
  private lastInteractionSphereX = 46;
  private lastInteractionSphereZ = -46;
  private sceneInstrumentation: SceneInstrumentation;
  private engineInstrumentation: EngineInstrumentation;
  private groundCover: LabGroundCover;
  private bladeCover: LabBladeCover;
  private flowerCover: LabFlowerCover;
  private broadleafCover: LabBroadleafCover;
  private textures = new Map<string, Texture>();
  private productionAlbedo: Texture;
  private productionNormal: Texture;
  private productionOrm: Texture;
  private sharedDetail: Texture;
  private config: TerrainLabConfigV25;
  private debugView: TerrainDebugView = 'final';
  private referenceMode = false;
  private photoOpMode = false;
  private savedCamera: { alpha: number; beta: number; radius: number; target: Vector3 } | null = null;
  private autoFlyby = false;
  private autoFlybyTime = 0;
  private autoFlybyTarget = new Vector3();
  private savedFlybyCamera: { alpha: number; beta: number; radius: number; target: Vector3 } | null = null;
  private frameCadence = new FrameCadenceTracker(512);
  private previousFrameAt = performance.now();
  private stutterSoakRunning = false;
  private stutterSoakCancelRequested = false;
  private resizeObserver: ResizeObserver;
  private interactionMoveKeys = new Set<string>();
  private onInteractionKeyDown = (event: KeyboardEvent): void => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    this.interactionMoveKeys.add(event.key);
    event.preventDefault();
  };
  private onInteractionKeyUp = (event: KeyboardEvent): void => {
    this.interactionMoveKeys.delete(event.key);
  };
  private onInteractionBlur = (): void => {
    this.interactionMoveKeys.clear();
  };

  constructor(
    private canvas: HTMLCanvasElement,
    initialConfig: TerrainLabConfigV25,
    private onError: (message: string) => void,
  ) {
    this.config = structuredClone(initialConfig);
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true }, true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.055, 0.067, 0.052, 1);
    this.scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(
      '/textures/environment/arena-sky.env',
      this.scene,
    );
    this.scene.imageProcessingConfiguration.toneMappingEnabled = true;
    this.scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;

    this.camera = new ArcRotateCamera('terrain-lab-camera', -Math.PI / 2, 0.72, 210, Vector3.Zero(), this.scene);
    this.camera.lowerRadiusLimit = 8;
    this.camera.upperRadiusLimit = 520;
    this.camera.lowerBetaLimit = 0.06;
    this.camera.upperBetaLimit = Math.PI / 2 - 0.015;
    this.camera.wheelPrecision = 1.8;
    this.camera.panningSensibility = 75;
    this.camera.attachControl(canvas, true);
    const cameraInputMap = this.camera.movement.input;
    cameraInputMap.inputMap = cameraInputMap.inputMap.filter(
      (entry) => entry.source !== 'pointer' && entry.source !== 'keyboard',
    );
    cameraInputMap.addEntry({ source: 'pointer', button: 1, interaction: 'rotate' });

    this.ambient = new HemisphericLight('terrain-lab-ambient', new Vector3(0, 1, 0), this.scene);
    this.ambient.groundColor = new Color3(0.12, 0.13, 0.1);
    // From-below hemisphere approximating light bounced off the grass: its
    // diffuse tracks the procedural ground palette, its intensity the ground
    // emission slider. Specular is disabled so it only adds soft color.
    this.groundBounce = new HemisphericLight('terrain-lab-ground-bounce', new Vector3(0, -1, 0), this.scene);
    this.groundBounce.groundColor = Color3.Black();
    this.groundBounce.specular = Color3.Black();
    this.sun = new DirectionalLight('terrain-lab-sun', new Vector3(-0.4, -0.8, -0.3), this.scene);
    this.sun.shadowFrustumSize = 300;
    this.sun.shadowMinZ = 1;
    this.sun.shadowMaxZ = 400;
    this.shadowGenerator = new ShadowGenerator(2048, this.sun, true);
    this.shadowGenerator.filter = ShadowGenerator.FILTER_PCF;
    this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    this.shadowGenerator.bias = 0.0005;
    this.shadowGenerator.normalBias = 0.02;
    this.shadowGenerator.setDarkness(0);

    this.sharedDetail = this.loadTexture(TERRAIN_REFERENCE_ASSETS.sharedDetail, false);
    this.productionAlbedo = this.loadTexture(TERRAIN_REFERENCE_ASSETS.productionAlbedo, true);
    this.productionNormal = this.loadTexture(TERRAIN_REFERENCE_ASSETS.productionNormal, false);
    this.productionOrm = this.loadTexture(TERRAIN_REFERENCE_ASSETS.productionOrm, false);
    this.groundKey = JSON.stringify([initialConfig.seed, initialConfig.ground]);
    const groundBuildStartedAt = performance.now();
    const initialGroundData = generateGroundTextureData(
      GROUND_TEXTURE_RESOLUTION,
      GROUND_WORLD_SIZE,
      initialConfig.seed,
      initialConfig.ground,
    );
    this.lastGroundBuildMs = performance.now() - groundBuildStartedAt;
    this.groundTexture = new RawTexture(
      initialGroundData,
      GROUND_TEXTURE_RESOLUTION,
      GROUND_TEXTURE_RESOLUTION,
      Engine.TEXTUREFORMAT_RGBA,
      this.scene,
      false,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    this.material = new PBRMaterial('terrain-lab-material', this.scene);
    this.material.albedoColor = Color3.White();
    this.material.albedoTexture = this.groundTexture;
    this.material.metallic = 0;
    this.material.roughness = initialConfig.pbr.baseRoughness;
    this.plugin = new TerrainLabMaterialPlugin(
      this.material,
      this.sharedDetail,
      this.groundTexture,
      initialConfig,
    );
    this.terrain = MeshBuilder.CreateGround(
      'terrain-lab-field',
      { width: 256, height: 256, subdivisions: 1 },
      this.scene,
    );
    this.terrain.material = this.material;
    this.terrain.receiveShadows = true;
    this.terrainBaseUvs = Float32Array.from(this.terrain.getVerticesData(VertexBuffer.UVKind) ?? []);
    this.terrain.setVerticesData(VertexBuffer.UVKind, this.terrainBaseUvs, true, 2);

    const probeMaterial = new PBRMaterial('terrain-probe-material', this.scene);
    probeMaterial.albedoColor = Color3.White();
    probeMaterial.metallic = 0;
    probeMaterial.roughness = 1;
    void this.loadGroundedProp(
      '/models/terrain/rusting-relic.glb',
      'terrain-rusting-relic',
      63,
      'horizontal',
      0,
      0,
    )
      .then(() => (this.relicReady = true))
      .catch((error: unknown) =>
        this.onError(`Rusting relic failed: ${error instanceof Error ? error.message : String(error)}`),
      );
    void this.loadGroundedProp(
      '/models/terrain/rusty-stop-sign.glb',
      'terrain-rusty-stop-sign',
      33,
      'height',
      -34,
      -18,
    )
      .then(() => (this.stopSignReady = true))
      .catch((error: unknown) =>
        this.onError(`Rusty stop sign failed: ${error instanceof Error ? error.message : String(error)}`),
      );

    this.interactionSphere = MeshBuilder.CreateSphere(
      'terrain-grass-interaction-sphere',
      { diameter: 2, segments: 24 },
      this.scene,
    );
    this.interactionSphere.position.set(46, initialConfig.blades.interactionSphereRadius, -46);
    this.interactionSphere.scaling.setAll(initialConfig.blades.interactionSphereRadius);
    this.interactionSphere.material = probeMaterial;
    this.interactionSphere.isPickable = true;
    this.interactionSphere.receiveShadows = true;
    this.shadowGenerator.addShadowCaster(this.interactionSphere);

    this.clearInteractionTrailData();
    this.interactionTrailTexture = new RawTexture(
      this.interactionTrailData,
      INTERACTION_TRAIL_RESOLUTION,
      INTERACTION_TRAIL_RESOLUTION,
      Engine.TEXTUREFORMAT_RGBA,
      this.scene,
      false,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    this.interactionTrailTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.interactionTrailTexture.wrapV = Texture.CLAMP_ADDRESSMODE;

    this.groundCover = new LabGroundCover(this.scene);
    this.bladeCover = new LabBladeCover(this.scene, this.interactionTrailTexture);
    this.flowerCover = new LabFlowerCover(this.scene, this.shadowGenerator, this.interactionTrailTexture);
    this.broadleafCover = new LabBroadleafCover(this.scene, this.shadowGenerator, this.interactionTrailTexture);
    this.bladeCover.setInteractionCenter(this.interactionSphere.position.x, this.interactionSphere.position.z);
    this.flowerCover.setInteractionCenter(this.interactionSphere.position.x, this.interactionSphere.position.z);
    this.broadleafCover.setInteractionCenter(
      this.interactionSphere.position.x,
      this.interactionSphere.position.z,
    );
    const sphereDrag = new PointerDragBehavior({ dragPlaneNormal: Vector3.Up() });
    sphereDrag.dragButtons = [0];
    sphereDrag.useObjectOrientationForDragging = false;
    sphereDrag.detachCameraControls = true;
    this.interactionSphere.addBehavior(sphereDrag);
    sphereDrag.onDragStartObservable.add(() => {
      this.canvas.style.cursor = 'grabbing';
    });
    sphereDrag.onDragObservable.add(() => {
      this.moveInteractionSphere(0, 0);
    });
    sphereDrag.onDragEndObservable.add(() => {
      this.canvas.style.cursor = '';
    });
    this.sceneInstrumentation = new SceneInstrumentation(this.scene);
    this.sceneInstrumentation.captureFrameTime = true;
    this.engineInstrumentation = new EngineInstrumentation(this.engine);
    this.engineInstrumentation.captureGPUFrameTime = true;
    this.engineInstrumentation.captureShaderCompilationTime = true;
    window.addEventListener('keydown', this.onInteractionKeyDown);
    window.addEventListener('keyup', this.onInteractionKeyUp);
    window.addEventListener('blur', this.onInteractionBlur);

    this.apply(initialConfig, 'final', false);
    this.engine.runRenderLoop(() => {
      const now = performance.now();
      this.frameCadence.add(now - this.previousFrameAt);
      this.previousFrameAt = now;
      const deltaSeconds = this.engine.getDeltaTime() / 1000;
      this.advanceAutoFlyby(deltaSeconds);
      this.bladeCover.advanceWind(deltaSeconds);
      this.flowerCover.advanceWind(deltaSeconds);
      this.broadleafCover.advanceWind(deltaSeconds);
      this.advanceInteractionSphere(deltaSeconds);
      this.scene.render();
    });
    this.resizeObserver = new ResizeObserver(() => this.engine.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
  }

  private advanceInteractionSphere(deltaSeconds: number): void {
    const lateralInput =
      Number(this.interactionMoveKeys.has('ArrowRight')) - Number(this.interactionMoveKeys.has('ArrowLeft'));
    const forwardInput =
      Number(this.interactionMoveKeys.has('ArrowUp')) - Number(this.interactionMoveKeys.has('ArrowDown'));
    if (lateralInput === 0 && forwardInput === 0) return;
    const direction = cameraRelativeGroundDirection(
      this.camera.position.x,
      this.camera.position.z,
      this.camera.target.x,
      this.camera.target.z,
      lateralInput,
      forwardInput,
    );
    const distance = 24 * Math.max(0, Math.min(0.05, deltaSeconds));
    this.moveInteractionSphere(direction.x * distance, direction.z * distance);
  }

  private moveInteractionSphere(deltaX: number, deltaZ: number): void {
    const radius = this.config.blades.interactionSphereRadius;
    const previousX = this.lastInteractionSphereX;
    const previousZ = this.lastInteractionSphereZ;
    const edge = 128 - radius;
    this.interactionSphere.position.x = Math.max(-edge, Math.min(edge, this.interactionSphere.position.x + deltaX));
    this.interactionSphere.position.y = radius;
    this.interactionSphere.position.z = Math.max(-edge, Math.min(edge, this.interactionSphere.position.z + deltaZ));
    const movementX = this.interactionSphere.position.x - previousX;
    const movementZ = this.interactionSphere.position.z - previousZ;
    const movementDistance = Math.hypot(movementX, movementZ);
    if (movementDistance > 0.0001) {
      this.stampInteractionTrailSegment(
        previousX,
        previousZ,
        this.interactionSphere.position.x,
        this.interactionSphere.position.z,
        radius,
        movementX / movementDistance,
        movementZ / movementDistance,
      );
    }
    this.lastInteractionSphereX = this.interactionSphere.position.x;
    this.lastInteractionSphereZ = this.interactionSphere.position.z;
    this.bladeCover.setInteractionCenter(this.interactionSphere.position.x, this.interactionSphere.position.z);
    this.flowerCover.setInteractionCenter(this.interactionSphere.position.x, this.interactionSphere.position.z);
    this.broadleafCover.setInteractionCenter(this.interactionSphere.position.x, this.interactionSphere.position.z);
  }

  private clearInteractionTrailData(): void {
    for (let offset = 0; offset < this.interactionTrailData.length; offset += 4) {
      this.interactionTrailData[offset] = 128;
      this.interactionTrailData[offset + 1] = 128;
      this.interactionTrailData[offset + 2] = 0;
      this.interactionTrailData[offset + 3] = 255;
    }
  }

  private stampInteractionTrailSegment(
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
    radius: number,
    directionX: number,
    directionZ: number,
  ): void {
    const distance = Math.hypot(endX - startX, endZ - startZ);
    const steps = Math.max(1, Math.ceil(distance / Math.max(radius * 0.5, 0.25)));
    for (let step = 0; step <= steps; step++) {
      const progress = step / steps;
      this.stampInteractionTrail(
        startX + (endX - startX) * progress,
        startZ + (endZ - startZ) * progress,
        radius,
        directionX,
        directionZ,
      );
    }
    this.interactionTrailTexture.update(this.interactionTrailData);
  }

  private stampInteractionTrail(
    worldX: number,
    worldZ: number,
    radius: number,
    directionX: number,
    directionZ: number,
  ): void {
    const resolution = INTERACTION_TRAIL_RESOLUTION;
    const worldSize = INTERACTION_TRAIL_WORLD_SIZE;
    const [encodedDirectionX, encodedDirectionZ] = encodeCrushDirection(directionX, directionZ);
    const centerX = (worldX / worldSize + 0.5) * resolution;
    const centerZ = (worldZ / worldSize + 0.5) * resolution;
    const radiusPixels = Math.max(1, (radius / worldSize) * resolution);
    const minimumX = Math.max(0, Math.floor(centerX - radiusPixels));
    const maximumX = Math.min(resolution - 1, Math.ceil(centerX + radiusPixels));
    const minimumZ = Math.max(0, Math.floor(centerZ - radiusPixels));
    const maximumZ = Math.min(resolution - 1, Math.ceil(centerZ + radiusPixels));
    for (let z = minimumZ; z <= maximumZ; z++) {
      for (let x = minimumX; x <= maximumX; x++) {
        const deltaX = x + 0.5 - centerX;
        const deltaZ = z + 0.5 - centerZ;
        const distance = Math.hypot(deltaX, deltaZ);
        if (distance >= radiusPixels) continue;
        const normalizedDistance = distance / radiusPixels;
        const smoothDistance = normalizedDistance * normalizedDistance * (3 - 2 * normalizedDistance);
        const influence = 1 - smoothDistance;
        const offset = (z * resolution + x) * 4;
        if (influence < this.interactionTrailData[offset + 2]! / 255) continue;
        this.interactionTrailData[offset] = encodedDirectionX;
        this.interactionTrailData[offset + 1] = encodedDirectionZ;
        this.interactionTrailData[offset + 2] = Math.round(influence * 255);
      }
    }
  }

  resetInteractionTrail(): void {
    this.clearInteractionTrailData();
    this.interactionTrailTexture.update(this.interactionTrailData);
    this.lastInteractionSphereX = this.interactionSphere.position.x;
    this.lastInteractionSphereZ = this.interactionSphere.position.z;
  }

  private loadTexture(url: string, gammaSpace: boolean): Texture {
    const existing = this.textures.get(url);
    if (existing) return existing;
    const texture = new Texture(
      url,
      this.scene,
      false,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      undefined,
      (message?: string, exception?: unknown) =>
        this.onError(`Texture failed: ${message || (exception instanceof Error ? exception.message : url)}`),
    );
    texture.gammaSpace = gammaSpace;
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    this.textures.set(url, texture);
    return texture;
  }

  private async loadGroundedProp(
    url: string,
    name: string,
    targetSize: number,
    fit: 'horizontal' | 'height',
    worldX: number,
    worldZ: number,
  ): Promise<void> {
    const container = await LoadAssetContainerAsync(url, this.scene);
    container.addAllToScene();
    const root = new TransformNode(`${name}-root`, this.scene);
    for (const node of container.rootNodes) node.parent = root;
    const renderMeshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
    if (renderMeshes.length === 0) throw new Error('the GLB contains no renderable mesh');

    const bounds = renderMeshes.map((mesh) => mesh.getHierarchyBoundingVectors(true));
    const minimum = bounds.reduce(
      (value, bound) => Vector3.Minimize(value, bound.min),
      new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
    );
    const maximum = bounds.reduce(
      (value, bound) => Vector3.Maximize(value, bound.max),
      new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY),
    );
    const size = maximum.subtract(minimum);
    const measuredSize = fit === 'height' ? size.y : Math.max(size.x, size.z);
    const scale = targetSize / Math.max(0.0001, measuredSize);
    const center = minimum.add(maximum).scale(0.5);
    root.scaling.setAll(scale);
    root.position.set(worldX - center.x * scale, -minimum.y * scale + 0.03, worldZ - center.z * scale);

    for (const mesh of renderMeshes) {
      mesh.name = `${name}:${mesh.name}`;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      this.shadowGenerator.addShadowCaster(mesh);
    }
    root.computeWorldMatrix(true);
    for (const mesh of renderMeshes) mesh.computeWorldMatrix(true);
  }

  apply(config: TerrainLabConfigV25, debugView: TerrainDebugView, referenceMode: boolean): void {
    this.config = structuredClone(config);
    this.debugView = debugView;
    this.referenceMode = referenceMode;
    const groundKey = JSON.stringify([config.seed, config.ground]);
    if (groundKey !== this.groundKey) {
      this.groundKey = groundKey;
      const groundBuildStartedAt = performance.now();
      const groundData = generateGroundTextureData(GROUND_TEXTURE_RESOLUTION, GROUND_WORLD_SIZE, config.seed, config.ground);
      this.groundTexture.update(groundData);
      this.lastGroundBuildMs = performance.now() - groundBuildStartedAt;
    }
    this.plugin.update(config, debugView, referenceMode);
    this.material.albedoTexture = referenceMode ? this.productionAlbedo : this.groundTexture;
    this.material.bumpTexture = referenceMode ? this.productionNormal : null;
    if (this.material.bumpTexture) this.material.bumpTexture.level = 0.55;
    this.material.metallicTexture = referenceMode ? this.productionOrm : null;
    this.material.useAmbientOcclusionFromMetallicTextureRed = referenceMode;
    this.material.useRoughnessFromMetallicTextureGreen = referenceMode;
    this.material.useMetallnessFromMetallicTextureBlue = referenceMode;
    this.material.metallic = config.pbr.metallic;
    this.material.roughness = config.pbr.baseRoughness;
    this.sharedDetail.uScale = config.detail.tiling;
    this.sharedDetail.vScale = config.detail.tiling;
    this.material.detailMap.texture = referenceMode || config.stages.detailPbr ? this.sharedDetail : null;
    this.material.detailMap.isEnabled = referenceMode || config.stages.detailPbr;
    this.material.detailMap.diffuseBlendLevel = config.detail.diffuse;
    this.material.detailMap.bumpLevel = config.detail.bump;
    this.material.detailMap.roughnessBlendLevel = config.detail.roughness;
    this.applyLighting(config);
    const sphereRadius = config.blades.interactionSphereRadius;
    this.interactionSphere.scaling.setAll(sphereRadius);
    this.interactionSphere.position.y = sphereRadius;
    this.bladeCover.setInteractionCenter(this.interactionSphere.position.x, this.interactionSphere.position.z);
    this.broadleafCover.setInteractionCenter(
      this.interactionSphere.position.x,
      this.interactionSphere.position.z,
    );
    this.groundCover.update(referenceMode ? { ...config, stages: { ...config.stages, groundCover: false } } : config);
    this.bladeCover.update(referenceMode ? { ...config, stages: { ...config.stages, bladeCover: false } } : config);
    this.flowerCover.update(referenceMode ? { ...config, stages: { ...config.stages, flowerCover: false } } : config);
    this.broadleafCover.update(referenceMode ? { ...config, stages: { ...config.stages, leafCover: false } } : config);
    if (this.photoOpMode) this.applyPhotoOpFraming();
  }

  private applyLighting(config: TerrainLabConfigV25): void {
    this.ambient.intensity = config.lighting.ambient;
    // Light colors arrive as sRGB hex from the color wells; convert to linear
    // so a picked tint scales the lit result the way the swatch suggests.
    this.ambient.diffuse = Color3.FromHexString(config.lighting.ambientColor).toLinearSpace();
    // Ground emission doubles as a cheap bounce-light approximation: a
    // dedicated from-below hemispheric carries the ground palette onto
    // nearby objects, with its own intensity so the effect actually reads
    // instead of drowning in the main ambient term.
    const groundBase = Color3.FromHexString(config.ground.baseColor).toLinearSpace();
    const groundHighlight = Color3.FromHexString(config.ground.highlightColor).toLinearSpace();
    this.groundBounce.diffuse = Color3.Lerp(groundBase, groundHighlight, 0.5);
    this.groundBounce.intensity = Math.max(0, Math.min(1, config.ground.emission)) * 2;
    this.scene.environmentIntensity = config.lighting.skylight;
    this.sun.intensity = config.lighting.sun;
    this.sun.diffuse = Color3.FromHexString(config.lighting.sunColor).toLinearSpace();
    this.sun.specular = this.sun.diffuse;
    const azimuth = (config.lighting.sunAzimuth * Math.PI) / 180;
    const elevation = (config.lighting.sunElevation * Math.PI) / 180;
    this.sun.direction.set(
      -Math.cos(elevation) * Math.cos(azimuth),
      -Math.sin(elevation),
      -Math.cos(elevation) * Math.sin(azimuth),
    );
    // Directional shadow maps still need a concrete light position to place
    // their orthographic camera. Keep it opposite the current direction so
    // the camera always looks through the world center as presets change.
    this.sun.position.copyFrom(this.sun.direction.scale(-180));
    this.scene.imageProcessingConfiguration.exposure = config.lighting.exposure;
    this.scene.imageProcessingConfiguration.contrast = config.lighting.contrast;
  }

  setCameraPreset(preset: CameraPreset): void {
    if (this.autoFlyby) this.setAutoFlyby(false);
    if (this.photoOpMode) this.setPhotoOpMode(false);
    const presets: Record<CameraPreset, [number, number, number]> = {
      // Babylon clamps beta away from exactly zero, so a tiny positive value
      // gives a visually orthographic overhead read without a polar singularity.
      top: [-Math.PI / 2, 0.001, 140],
      high: [-Math.PI / 2, 0.4, 165],
      rts: [-Math.PI / 2, 0.72, 210],
      close: [-Math.PI / 2.3, 1.04, 42],
      low: [-Math.PI / 2.45, 1.18, 72],
      grazing: [-Math.PI / 2.7, 1.34, 118],
    };
    const [alpha, beta, radius] = presets[preset];
    this.camera.setTarget(Vector3.Zero());
    this.camera.alpha = alpha;
    this.camera.beta = beta;
    this.camera.radius = radius;
  }

  setAutoFlyby(enabled: boolean): void {
    if (enabled === this.autoFlyby) return;
    if (enabled) {
      if (this.photoOpMode) this.setPhotoOpMode(false);
      this.savedFlybyCamera = {
        alpha: this.camera.alpha,
        beta: this.camera.beta,
        radius: this.camera.radius,
        target: this.camera.target.clone(),
      };
      this.autoFlybyTime = 0;
      this.autoFlyby = true;
      this.advanceAutoFlyby(0);
      return;
    }
    this.autoFlyby = false;
    if (this.savedFlybyCamera) {
      this.camera.alpha = this.savedFlybyCamera.alpha;
      this.camera.beta = this.savedFlybyCamera.beta;
      this.camera.radius = this.savedFlybyCamera.radius;
      this.camera.setTarget(this.savedFlybyCamera.target);
      this.savedFlybyCamera = null;
    }
  }

  private advanceAutoFlyby(deltaSeconds: number): void {
    if (!this.autoFlyby) return;
    this.autoFlybyTime += Math.max(0, Math.min(0.05, deltaSeconds));
    const time = this.autoFlybyTime;
    this.camera.alpha = -Math.PI / 2 + time * 0.22;
    this.camera.beta = 0.78 + Math.sin(time * 0.47) * 0.38;
    this.camera.radius = 126 + Math.sin(time * 0.31 - Math.PI / 2) * 78;
    this.autoFlybyTarget.set(Math.sin(time * 0.19) * 8, 6, Math.cos(time * 0.17) * 8);
    this.camera.setTarget(this.autoFlybyTarget);
  }

  setPhotoOpMode(enabled: boolean): void {
    if (enabled === this.photoOpMode) return;
    if (enabled && this.autoFlyby) this.setAutoFlyby(false);
    this.photoOpMode = enabled;
    if (enabled) {
      this.savedCamera = {
        alpha: this.camera.alpha,
        beta: this.camera.beta,
        radius: this.camera.radius,
        target: this.camera.getTarget().clone(),
      };
      this.applyPhotoOpFraming();
      return;
    }
    this.restoreTerrainFootprint();
    if (this.savedCamera) {
      this.camera.setTarget(this.savedCamera.target);
      this.camera.alpha = this.savedCamera.alpha;
      this.camera.beta = this.savedCamera.beta;
      this.camera.radius = this.savedCamera.radius;
      this.savedCamera = null;
    }
  }

  async capturePhotoOp(): Promise<void> {
    if (!this.photoOpMode) this.setPhotoOpMode(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const dataUrl = await CreateScreenshotAsync(
      this.engine,
      this.camera,
      { width: 1600, height: 900 },
      'image/png',
      1,
      true,
      true,
    );
    const download = document.createElement('a');
    download.href = dataUrl;
    download.download = 'terrain-lab-photo-op.png';
    download.click();
  }

  private activeCoverBounds(): PhotoOpBounds {
    const bounds: PhotoOpBounds[] = [];
    if (this.config.stages.bladeCover && this.config.blades.count > 0) {
      const half = this.config.blades.spread / 2;
      bounds.push({ minimumX: -half, maximumX: half, minimumZ: -half, maximumZ: half });
    }
    if (this.config.stages.groundCover && this.config.cover.count > 0) {
      const half = this.config.cover.spread / 2;
      bounds.push({
        minimumX: this.config.cover.offsetX - half,
        maximumX: this.config.cover.offsetX + half,
        minimumZ: this.config.cover.offsetZ - half,
        maximumZ: this.config.cover.offsetZ + half,
      });
    }
    if (this.config.stages.flowerCover && this.config.flowers.count > 0) {
      const half = this.config.flowers.spread / 2;
      bounds.push({ minimumX: -half, maximumX: half, minimumZ: -half, maximumZ: half });
    }
    if (this.config.stages.leafCover && this.config.leaves.clumpCount > 0) {
      const half = this.config.leaves.spread / 2;
      bounds.push({ minimumX: -half, maximumX: half, minimumZ: -half, maximumZ: half });
    }
    if (bounds.length === 0) return { minimumX: -128, maximumX: 128, minimumZ: -128, maximumZ: 128 };
    return bounds.reduce((combined, next) => ({
      minimumX: Math.min(combined.minimumX, next.minimumX),
      maximumX: Math.max(combined.maximumX, next.maximumX),
      minimumZ: Math.min(combined.minimumZ, next.minimumZ),
      maximumZ: Math.max(combined.maximumZ, next.maximumZ),
    }));
  }

  private applyPhotoOpFraming(): void {
    const bounds = this.activeCoverBounds();
    const width = Math.max(1, bounds.maximumX - bounds.minimumX);
    const depth = Math.max(1, bounds.maximumZ - bounds.minimumZ);
    this.terrain.scaling.set(width / GROUND_WORLD_SIZE, 1, depth / GROUND_WORLD_SIZE);
    this.terrain.position.set(
      (bounds.minimumX + bounds.maximumX) / 2,
      0,
      (bounds.minimumZ + bounds.maximumZ) / 2,
    );
    const minimumU = bounds.minimumX / GROUND_WORLD_SIZE + 0.5;
    const maximumU = bounds.maximumX / GROUND_WORLD_SIZE + 0.5;
    const minimumV = bounds.minimumZ / GROUND_WORLD_SIZE + 0.5;
    const maximumV = bounds.maximumZ / GROUND_WORLD_SIZE + 0.5;
    const croppedUvs = Float32Array.from(this.terrainBaseUvs, (value, index) =>
      index % 2 === 0
        ? minimumU + value * (maximumU - minimumU)
        : minimumV + value * (maximumV - minimumV),
    );
    this.terrain.updateVerticesData(VertexBuffer.UVKind, croppedUvs);

    const sphereRadius = this.config.blades.interactionSphereRadius;
    const compositionMinimumX = Math.min(bounds.minimumX, this.interactionSphere.position.x - sphereRadius, -6);
    const compositionMaximumX = Math.max(bounds.maximumX, this.interactionSphere.position.x + sphereRadius, 6);
    const compositionMinimumZ = Math.min(bounds.minimumZ, this.interactionSphere.position.z - sphereRadius, -6);
    const compositionMaximumZ = Math.max(bounds.maximumZ, this.interactionSphere.position.z + sphereRadius, 6);
    const compositionWidth = compositionMaximumX - compositionMinimumX;
    const compositionDepth = compositionMaximumZ - compositionMinimumZ;
    this.camera.setTarget(
      new Vector3(
        (compositionMinimumX + compositionMaximumX) / 2,
        15,
        (compositionMinimumZ + compositionMaximumZ) / 2,
      ),
    );
    this.camera.alpha = ((this.config.lighting.sunAzimuth - 90) * Math.PI) / 180;
    this.camera.beta = 1.02;
    this.camera.radius = Math.max(112, Math.max(compositionWidth, compositionDepth) * 1.35);
  }

  private restoreTerrainFootprint(): void {
    this.terrain.scaling.setAll(1);
    this.terrain.position.set(0, 0, 0);
    this.terrain.updateVerticesData(VertexBuffer.UVKind, this.terrainBaseUvs);
  }

  getDiagnostics(): TerrainLabDiagnostics {
    const cadence = this.frameCadence.snapshot();
    return {
      fps: this.engine.getFps(),
      frameMs: this.sceneInstrumentation.frameTimeCounter.lastSecAverage,
      frameP95Ms: cadence.frameP95Ms,
      frameP99Ms: cadence.frameP99Ms,
      frameMaxMs: cadence.frameMaxMs,
      framesOver25Ms: cadence.framesOver25Ms,
      framesOver33Ms: cadence.framesOver33Ms,
      gpuFrameMs: this.engineInstrumentation.gpuFrameTimeCounter.current * 0.000001,
      drawCalls: this.sceneInstrumentation.drawCallsCounter.current,
      activeMeshes: this.scene.getActiveMeshes().length,
      textures: this.scene.textures.length,
      shaderVariant: shaderVariantKey(this.config, this.referenceMode),
      textureSamples: this.referenceMode ? 4 : estimateTextureSamples(this.config),
      groundCoverInstances: this.groundCover.instanceCount,
      bladeCoverInstances: this.bladeCover.instanceCount,
      flowerCoverInstances: this.flowerCover.instanceCount,
      leafCoverInstances: this.broadleafCover.instanceCount,
      shaderCompileMs: this.engineInstrumentation.shaderCompilationTimeCounter.current,
      ready: this.relicReady && this.stopSignReady && this.scene.isReady() && this.material.isReady(this.terrain),
    };
  }

  private profileScenario(
    name: TerrainLabProfileScenario['name'],
    warmupFrames = 60,
    sampleFrames = 180,
    advance?: () => void,
  ): Promise<TerrainLabProfileScenario> {
    return new Promise((resolve) => {
      const frameTimes: number[] = [];
      const gpuTimes: number[] = [];
      const cpuTimes: number[] = [];
      const drawCalls: number[] = [];
      let remainingWarmup = warmupFrames;
      let previousAt = performance.now();
      const observer = this.scene.onAfterRenderObservable.add(() => {
        advance?.();
        const now = performance.now();
        const frameMs = now - previousAt;
        previousAt = now;
        if (remainingWarmup > 0) {
          remainingWarmup--;
          return;
        }
        frameTimes.push(frameMs);
        const gpuMs = this.engineInstrumentation.gpuFrameTimeCounter.current * 0.000001;
        if (gpuMs > 0) gpuTimes.push(gpuMs);
        cpuTimes.push(this.sceneInstrumentation.frameTimeCounter.current);
        drawCalls.push(this.sceneInstrumentation.drawCallsCounter.current);
        if (frameTimes.length < sampleFrames) return;
        this.scene.onAfterRenderObservable.remove(observer);
        const frameMedianMs = percentile(frameTimes, 0.5);
        const frameMaxMs = Math.max(...frameTimes);
        const framesOver25Ms = frameTimes.filter((value) => value >= 25).length;
        const framesOver33Ms = frameTimes.filter((value) => value >= 1000 / 30).length;
        resolve({
          name,
          samples: frameTimes.length,
          frameMedianMs: rounded(frameMedianMs),
          frameP95Ms: rounded(percentile(frameTimes, 0.95)),
          frameP99Ms: rounded(percentile(frameTimes, 0.99)),
          frameMaxMs: rounded(frameMaxMs),
          framesOver25Ms,
          framesOver33Ms,
          gpuMedianMs: rounded(percentile(gpuTimes, 0.5)),
          gpuP95Ms: rounded(percentile(gpuTimes, 0.95)),
          cpuMedianMs: rounded(percentile(cpuTimes, 0.5)),
          drawCallsMedian: Math.round(percentile(drawCalls, 0.5)),
          estimatedFps: rounded(frameMedianMs > 0 ? 1000 / frameMedianMs : 0),
          savedFrameMedianMs: 0,
          savedFrameP95Ms: 0,
          savedGpuMedianMs: 0,
          savedGpuP95Ms: 0,
        });
      });
    });
  }

  cancelStutterSoak(): void {
    this.stutterSoakCancelRequested = true;
  }

  async runStutterSoak(durationMs = 600_000, warmupMs = 5_000): Promise<TerrainLabStutterSoak> {
    if (this.stutterSoakRunning) throw new Error('A stutter soak is already running');
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Stutter soak duration must be positive');
    if (!Number.isFinite(warmupMs) || warmupMs < 0) throw new Error('Stutter soak warmup cannot be negative');
    if (document.hidden) throw new Error('Stutter soak requires a visible browser tab');

    this.stutterSoakRunning = true;
    this.stutterSoakCancelRequested = false;
    const originalAutoFlyby = this.autoFlyby;
    if (!originalAutoFlyby) this.setAutoFlyby(true);

    const maximumSamples = Math.ceil((durationMs / 1000) * 240) + 8;
    const cadence = new FrameCadenceTracker(maximumSamples);
    const gpuCadence = new FrameCadenceTracker(maximumSamples);
    const sampleStartsAt = performance.now() + warmupMs;
    let longTaskCount = 0;
    let longTaskMaxMs = 0;
    const longTaskObserver =
      typeof PerformanceObserver === 'undefined'
        ? null
        : new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.startTime < sampleStartsAt) continue;
              longTaskCount++;
              longTaskMaxMs = Math.max(longTaskMaxMs, entry.duration);
            }
          });
    try {
      longTaskObserver?.observe({ entryTypes: ['longtask'] });
    } catch {
      longTaskObserver?.disconnect();
    }

    try {
      await new Promise<void>((resolve, reject) => {
        let previousAt = performance.now();
        const onVisibilityChange = (): void => {
          if (document.hidden) finish(new Error('Stutter soak invalidated because the browser tab became hidden'));
        };
        const observer = this.scene.onAfterRenderObservable.add(() => {
          const now = performance.now();
          if (this.stutterSoakCancelRequested) {
            finish(new Error('Stutter soak cancelled'));
            return;
          }
          if (document.hidden) {
            finish(new Error('Stutter soak invalidated because the browser tab became hidden'));
            return;
          }
          if (now < sampleStartsAt) {
            previousAt = now;
            return;
          }
          cadence.add(now - previousAt);
          previousAt = now;
          const gpuMs = this.engineInstrumentation.gpuFrameTimeCounter.current * 0.000001;
          if (gpuMs > 0) gpuCadence.add(gpuMs);
          if (now - sampleStartsAt >= durationMs) finish();
        });
        let finished = false;
        const finish = (error?: Error): void => {
          if (finished) return;
          finished = true;
          this.scene.onAfterRenderObservable.remove(observer);
          document.removeEventListener('visibilitychange', onVisibilityChange);
          if (error) reject(error);
          else resolve();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
      });

      const snapshot = cadence.snapshot();
      const gpuSnapshot = gpuCadence.snapshot();
      const glInfo = this.engine.getGlInfo();
      return {
        capturedAt: new Date().toISOString(),
        renderer: glInfo.renderer,
        resolution: `${this.engine.getRenderWidth()}x${this.engine.getRenderHeight()}`,
        hardwareScaling: this.engine.getHardwareScalingLevel(),
        durationMs: rounded(durationMs),
        warmupMs: rounded(warmupMs),
        bladeInstances: this.bladeCover.instanceCount,
        flowerInstances: this.flowerCover.instanceCount,
        leafInstances: this.broadleafCover.instanceCount,
        samples: snapshot.samples,
        frameP95Ms: rounded(snapshot.frameP95Ms),
        frameP99Ms: rounded(snapshot.frameP99Ms),
        frameMaxMs: rounded(snapshot.frameMaxMs),
        framesOver25Ms: snapshot.framesOver25Ms,
        framesOver33Ms: snapshot.framesOver33Ms,
        rateOver25Ms: rounded(snapshot.rateOver25Ms),
        rateOver33Ms: rounded(snapshot.rateOver33Ms),
        gpuP95Ms: rounded(gpuSnapshot.frameP95Ms),
        longTaskCount,
        longTaskMaxMs: rounded(longTaskMaxMs),
        target60: passesSixtyHertzCadence(snapshot),
      };
    } finally {
      longTaskObserver?.disconnect();
      if (!originalAutoFlyby) this.setAutoFlyby(false);
      this.stutterSoakRunning = false;
      this.stutterSoakCancelRequested = false;
    }
  }

  async runProfileSuite(): Promise<TerrainLabProfileSuite> {
    const originalConfig = structuredClone(this.config);
    const originalDebugView = this.debugView;
    const originalReferenceMode = this.referenceMode;
    const originalShadowEnabled = this.sun.shadowEnabled;
    const originalCameraAlpha = this.camera.alpha;
    const originalCameraBeta = this.camera.beta;
    const originalCameraRadius = this.camera.radius;
    const originalAutoFlyby = this.autoFlyby;
    this.autoFlyby = false;
    const scenarios: TerrainLabProfileScenario[] = [];
    const run = async (
      name: TerrainLabProfileScenario['name'],
      mutate?: (config: TerrainLabConfigV25) => void,
      shadowsEnabled = true,
      advance?: () => void,
    ): Promise<void> => {
      const scenarioConfig = structuredClone(originalConfig);
      mutate?.(scenarioConfig);
      this.sun.shadowEnabled = shadowsEnabled;
      this.apply(scenarioConfig, originalDebugView, originalReferenceMode);
      scenarios.push(await this.profileScenario(name, 60, 180, advance));
    };
    try {
      await run('baseline');
      const cameraAlpha = this.camera.alpha;
      const cameraBeta = this.camera.beta;
      const cameraRadius = this.camera.radius;
      await run('camera-orbit', undefined, true, () => (this.camera.alpha += 0.006));
      this.camera.alpha = cameraAlpha;
      let cameraSweepFrame = 0;
      await run('camera-sweep', undefined, true, () => {
        cameraSweepFrame++;
        this.camera.alpha += 0.006;
        this.camera.beta = 0.32 + (0.96 * (Math.sin(cameraSweepFrame * 0.035) + 1)) / 2;
      });
      this.camera.alpha = cameraAlpha;
      this.camera.beta = cameraBeta;
      this.camera.radius = cameraRadius;
      let cameraZoomFrame = 0;
      await run('camera-zoom', undefined, true, () => {
        cameraZoomFrame++;
        this.camera.alpha += 0.004;
        this.camera.beta = 0.92;
        this.camera.radius = 42 + (168 * (Math.sin(cameraZoomFrame * 0.035) + 1)) / 2;
      });
      this.camera.alpha = cameraAlpha;
      this.camera.beta = cameraBeta;
      this.camera.radius = cameraRadius;
      let cameraZoomNoFacingFrame = 0;
      await run(
        'camera-zoom-no-facing',
        (config) => (config.blades.viewFacing = 0),
        true,
        () => {
          cameraZoomNoFacingFrame++;
          this.camera.alpha += 0.004;
          this.camera.beta = 0.92;
          this.camera.radius = 42 + (168 * (Math.sin(cameraZoomNoFacingFrame * 0.035) + 1)) / 2;
        },
      );
      this.camera.alpha = cameraAlpha;
      this.camera.beta = cameraBeta;
      this.camera.radius = cameraRadius;
      await run('no-shadows', undefined, false);
      await run('no-view-facing', (config) => (config.blades.viewFacing = 0));
      await run('no-wind', (config) => (config.blades.windTiltDegrees = 0));
      await run('no-interaction', (config) => (config.blades.interactionSphereRadius = 0));
      await run('no-blades', (config) => (config.stages.bladeCover = false));
      await run('no-flowers', (config) => (config.stages.flowerCover = false));
      await run('no-leaves', (config) => (config.stages.leafCover = false));
      await run('baseline-repeat');
    } finally {
      this.sun.shadowEnabled = originalShadowEnabled;
      this.camera.alpha = originalCameraAlpha;
      this.camera.beta = originalCameraBeta;
      this.camera.radius = originalCameraRadius;
      this.autoFlyby = originalAutoFlyby;
      this.apply(originalConfig, originalDebugView, originalReferenceMode);
    }
    const baseline = scenarios[0]!;
    for (const scenario of scenarios.slice(1)) {
      scenario.savedFrameMedianMs = rounded(baseline.frameMedianMs - scenario.frameMedianMs);
      scenario.savedFrameP95Ms = rounded(baseline.frameP95Ms - scenario.frameP95Ms);
      scenario.savedGpuMedianMs = rounded(baseline.gpuMedianMs - scenario.gpuMedianMs);
      scenario.savedGpuP95Ms = rounded(baseline.gpuP95Ms - scenario.gpuP95Ms);
    }
    const glInfo = this.engine.getGlInfo();
    return {
      capturedAt: new Date().toISOString(),
      renderer: glInfo.renderer,
      resolution: `${this.engine.getRenderWidth()}x${this.engine.getRenderHeight()}`,
      hardwareScaling: this.engine.getHardwareScalingLevel(),
      bladeInstances: this.bladeCover.instanceCount,
      flowerInstances: this.flowerCover.instanceCount,
      leafInstances: this.broadleafCover.instanceCount,
      bladeBuildMs: rounded(this.bladeCover.lastBuildMs),
      groundBuildMs: rounded(this.lastGroundBuildMs),
      target60:
        baseline.framesOver33Ms === 0 &&
        baseline.framesOver25Ms / Math.max(1, baseline.samples) <= 0.001,
      target90: baseline.frameP95Ms <= 1000 / 90,
      gpuHeadroom60: baseline.gpuP95Ms > 0 && baseline.gpuP95Ms <= 1000 / 60,
      gpuHeadroom90: baseline.gpuP95Ms > 0 && baseline.gpuP95Ms <= 1000 / 90,
      scenarios,
    };
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onInteractionKeyDown);
    window.removeEventListener('keyup', this.onInteractionKeyUp);
    window.removeEventListener('blur', this.onInteractionBlur);
    this.engine.stopRenderLoop();
    this.groundTexture.dispose();
    this.interactionTrailTexture.dispose();
    this.groundCover.dispose();
    this.bladeCover.dispose();
    this.flowerCover.dispose();
    this.broadleafCover.dispose();
    this.shadowGenerator.dispose();
    this.sceneInstrumentation.dispose();
    this.engineInstrumentation.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
