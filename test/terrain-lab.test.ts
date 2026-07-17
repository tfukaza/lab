import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { buildBladeVertexData } from '../src/blade-geometry.js';
import { buildBroadleafVertexData, generateBroadleafGradientData } from '../src/broadleaf-geometry.js';
import { buildFlowerDiscVertexData } from '../src/flower-geometry.js';
import { bladeDensityProbability, perlinNoise2D, sampleBladePatch, sampleBladeTiltPatch } from '../src/blade-patch-noise.js';
import { TERRAIN_TEXTURE_CATALOG } from '../src/catalog.js';
import { FrameCadenceTracker, passesSixtyHertzCadence } from '../src/frame-cadence.js';
import { cameraRelativeGroundDirection, encodeCrushDirection } from '../src/interaction-motion.js';
import {
  applyGuidedStage,
  CONTROL_SCHEMA,
  createDefaultTerrainConfig,
  estimateTextureSamples,
  shaderVariantKey,
  TERRAIN_STAGE_KEYS,
} from '../src/config.js';

describe('independent terrain laboratory', () => {
  it('ships terrain props with embedded 1024-square textures', async () => {
    const io = new NodeIO();
    for (const file of [
      'public/models/terrain/rusting-relic.glb',
      'public/models/terrain/rusty-stop-sign.glb',
    ]) {
      const document = await io.read(file);
      const textures = document.getRoot().listTextures();
      assert.equal(textures.length, 4);
      for (const texture of textures) {
        const image = texture.getImage();
        assert.ok(image, `${file}:${texture.getName()} image`);
        const metadata = await sharp(image).metadata();
        assert.equal(metadata.width, 1024, `${file}:${texture.getName()} width`);
        assert.equal(metadata.height, 1024, `${file}:${texture.getName()} height`);
      }
    }
  });

  it('maps sphere controls to the camera ground plane and encodes travel-directed crushing', () => {
    assert.deepEqual(cameraRelativeGroundDirection(0, -10, 0, 0, 0, 1), { x: 0, z: 1 });
    assert.deepEqual(cameraRelativeGroundDirection(0, -10, 0, 0, 1, 0), { x: 1, z: 0 });
    const rotatedForward = cameraRelativeGroundDirection(10, 0, 0, 0, 0, 1);
    assert.ok(Math.abs(rotatedForward.x + 1) < 1e-9);
    assert.ok(Math.abs(rotatedForward.z) < 1e-9);
    assert.deepEqual(encodeCrushDirection(1, 0), [255, 128]);
    assert.deepEqual(encodeCrushDirection(0, -1), [128, 0]);
  });

  it('tracks missed refreshes in a fixed-capacity cadence ring', () => {
    const wrapped = new FrameCadenceTracker(5);
    for (const frameMs of [10, 20, 25, 34, 40, 15]) wrapped.add(frameMs);
    const wrappedSnapshot = wrapped.snapshot();
    assert.equal(wrappedSnapshot.samples, 5);
    assert.equal(wrappedSnapshot.framesOver25Ms, 3);
    assert.equal(wrappedSnapshot.framesOver33Ms, 2);
    assert.equal(wrappedSnapshot.frameMaxMs, 40);
    assert.equal(passesSixtyHertzCadence(wrappedSnapshot), false);

    const passing = new FrameCadenceTracker(1000);
    for (let index = 0; index < 999; index++) passing.add(16.7);
    passing.add(25);
    assert.equal(passesSixtyHertzCadence(passing.snapshot()), true);
    passing.add(25);
    assert.equal(passesSixtyHertzCadence(passing.snapshot()), false);
  });

  it('catalogs every current v4 terrain surface without duplicate ids or missing files', () => {
    assert.equal(TERRAIN_TEXTURE_CATALOG.length, 4);
    assert.equal(new Set(TERRAIN_TEXTURE_CATALOG.map((entry) => entry.id)).size, TERRAIN_TEXTURE_CATALOG.length);
    for (const entry of TERRAIN_TEXTURE_CATALOG) assert.equal(fs.existsSync(fileURLToPath(entry.url)), true, entry.id);
  });

  it('enables guided stages cumulatively while retaining edited values', () => {
    const original = createDefaultTerrainConfig();
    original.fbm.scale = 7.25;
    const throughWarp = applyGuidedStage(original, 'warp');
    assert.deepEqual(
      TERRAIN_STAGE_KEYS.map((key) => throughWarp.stages[key]),
      [true, true, true, false, false, false, false, false, false],
    );
    assert.equal(throughWarp.fbm.scale, 7.25);
    assert.equal(original.stages.randomization, true);
    assert.ok(shaderVariantKey(throughWarp).includes('warp'));
  });

  it('keeps low-poly blade cover separate from sprite cards', () => {
    const defaults = createDefaultTerrainConfig();
    assert.equal(defaults.stages.randomization, true);
    assert.equal(defaults.stages.bladeCover, true);
    assert.equal(defaults.stages.groundCover, false);
    const config = applyGuidedStage(createDefaultTerrainConfig(), 'bladeCover');
    assert.equal(config.version, 25);
    assert.equal(config.stages.groundCover, false);
    assert.equal(config.stages.bladeCover, true);
    assert.equal(config.blades.count, 100000);
    assert.equal(config.blades.spread, 104);
    assert.equal(config.blades.width, 0.29);
    assert.equal(config.blades.topWidth, 0.07);
    assert.equal(config.blades.tipDropRatio, 0.25);
    assert.ok(config.blades.diffuseDirectionality >= 0 && config.blades.diffuseDirectionality <= 1);
    assert.equal(config.blades.tintNoisePatchSize, 25);
    assert.equal(config.blades.tintNoiseStrength, 1.35);
    assert.equal(config.blades.tintNoiseColor, '#ffde0a');
    assert.equal(config.blades.growthNoisePatchSize, 21);
    assert.equal(config.blades.growthHeightVariation, 1.2);
    assert.equal(config.blades.growthMinimumHeightScale, 0.6);
    assert.equal(config.blades.growthDensityVariation, 1);
    assert.equal(config.blades.growthDensityExponent, 1.75);
    assert.deepEqual(
      {
        windNoisePatchSize: config.blades.windNoisePatchSize,
        windTiltDegrees: config.blades.windTiltDegrees,
        windSpeed: config.blades.windSpeed,
        windAzimuth: config.blades.windAzimuth,
        windDirectionBias: config.blades.windDirectionBias,
        windBendExponent: config.blades.windBendExponent,
      },
      {
        windNoisePatchSize: 14,
        windTiltDegrees: 18,
        windSpeed: 11,
        windAzimuth: 99,
        windDirectionBias: 0.75,
        windBendExponent: 1.9,
      },
    );
    assert.deepEqual(
      {
        radius: config.blades.interactionSphereRadius,
        push: config.blades.interactionPushStrength,
        squash: config.blades.interactionSquashStrength,
        maximumTilt: config.blades.interactionMaxTiltDegrees,
        groundClearance: config.blades.interactionGroundClearance,
      },
      { radius: 6, push: 0.85, squash: 0.9, maximumTilt: 38, groundClearance: 0.04 },
    );
    assert.ok(config.blades.topWidth < config.blades.width);
    assert.deepEqual(
      {
        height: config.blades.height,
        scaleVariation: config.blades.scaleVariation,
        tiltDegrees: config.blades.tiltDegrees,
        bendDegrees: config.blades.bendDegrees,
        bendHeightInfluence: config.blades.bendHeightInfluence,
        bendJitterDegrees: config.blades.bendJitterDegrees,
        tiltNoisePatchSize: config.blades.tiltNoisePatchSize,
        tiltCellJitter: config.blades.tiltCellJitter,
        tiltTransitionWidth: config.blades.tiltTransitionWidth,
        tiltNoiseStrength: config.blades.tiltNoiseStrength,
        tiltVariationDegrees: config.blades.tiltVariationDegrees,
        tiltDirectionJitterDegrees: config.blades.tiltDirectionJitterDegrees,
        normalCurveDegrees: config.blades.normalCurveDegrees,
        normalFlatten: config.blades.normalFlatten,
        viewFacing: config.blades.viewFacing,
        rootOcclusion: config.blades.rootOcclusion,
        roughness: config.blades.roughness,
        specularIntensity: config.blades.specularIntensity,
        glintSpread: config.blades.glintSpread,
        glintTipBias: config.blades.glintTipBias,
        sideLightEvenness: config.blades.sideLightEvenness,
        diffuseDirectionality: config.blades.diffuseDirectionality,
        rootColor: config.blades.rootColor,
        tipColor: config.blades.tipColor,
      },
      {
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
        diffuseDirectionality: 1,
        rootColor: '#587f49',
        tipColor: '#91b86f',
      },
    );
    assert.deepEqual(
      {
        ambient: config.lighting.ambient,
        skylight: config.lighting.skylight,
        sun: config.lighting.sun,
        sunAzimuth: config.lighting.sunAzimuth,
        sunElevation: config.lighting.sunElevation,
        exposure: config.lighting.exposure,
        contrast: config.lighting.contrast,
        sunColor: config.lighting.sunColor,
        ambientColor: config.lighting.ambientColor,
      },
      {
        ambient: 0.15,
        skylight: 0.07,
        sun: 2.21,
        sunAzimuth: 293,
        sunElevation: 63,
        exposure: 2.38,
        contrast: 1.36,
        sunColor: '#fffce5',
        ambientColor: '#b8f3ff',
      },
    );
    for (const path of [
      'blades.count',
      'blades.spread',
      'blades.width',
      'blades.topWidth',
      'blades.height',
      'blades.tiltDegrees',
      'blades.bendDegrees',
      'blades.bendHeightInfluence',
      'blades.bendJitterDegrees',
      'blades.tiltNoisePatchSize',
      'blades.tiltCellJitter',
      'blades.tiltTransitionWidth',
      'blades.tiltNoiseStrength',
      'blades.tiltVariationDegrees',
      'blades.tiltDirectionJitterDegrees',
      'blades.tipDropRatio',
      'blades.diffuseDirectionality',
      'blades.glintTipBias',
      'blades.sideLightEvenness',
      'blades.tintNoisePatchSize',
      'blades.tintNoiseStrength',
      'blades.growthNoisePatchSize',
      'blades.growthHeightVariation',
      'blades.growthMinimumHeightScale',
      'blades.growthDensityVariation',
      'blades.growthDensityExponent',
      'blades.windNoisePatchSize',
      'blades.windTiltDegrees',
      'blades.windSpeed',
      'blades.windAzimuth',
      'blades.windDirectionBias',
      'blades.windBendExponent',
      'blades.interactionSphereRadius',
      'blades.interactionPushStrength',
      'blades.interactionSquashStrength',
      'blades.interactionMaxTiltDegrees',
      'blades.interactionGroundClearance',
    ])
      assert.ok(
        CONTROL_SCHEMA.some((control) => control.path === path),
        path,
      );
    assert.equal(
      CONTROL_SCHEMA.find((control) => control.path === 'blades.tiltDirectionJitterDegrees')?.max,
      90,
    );
    const scene = fs.readFileSync('src/scene.ts', 'utf8');
    const bladeGeometry = fs.readFileSync('src/blade-geometry.ts', 'utf8');
    assert.match(bladeGeometry, /indices: \[0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6\]/);
    assert.match(scene, /thinInstanceSetBuffer\('matrix', matrices\.subarray/);
    assert.match(scene, /thinInstanceSetBuffer\('instanceColor', instanceColors\.subarray/);
    assert.match(scene, /thinInstanceSetBuffer\('bladeBend', bendAngles\.subarray/);
    assert.match(scene, /baseBend \* heightBendMultiplier \+ bladeBendJitter/);
    const bladeLighting = fs.readFileSync('src/blade-lighting-plugin.ts', 'utf8');
    assert.match(bladeLighting, /bladeBend \* bladeFoldWeight/);
    assert.match(bladeLighting, /positionUpdated - bladeFoldOrigin/);
    assert.match(bladeLighting, /attributes\.push\('bladeSpecNormal', 'bladeRootGround', 'bladeBend', 'bladeFoldWeight'\)/);
    assert.match(scene, /this\.material = new PBRMaterial\('blade-cover-material'/);
    assert.match(scene, /this\.material\.albedoColor = Color3\.White\(\)/);
    assert.match(scene, /this\.material\.emissiveColor = Color3\.FromHexString\('#52663a'\)/);
    assert.match(scene, /this\.material\.emissiveIntensity = 0\.08/);
    assert.match(scene, /this\.material\.roughness = config\.blades\.roughness/);
    assert.match(scene, /this\.material\.specularIntensity = config\.blades\.specularIntensity/);
    assert.match(bladeLighting, /vBladeGlintWeight = mix/);
    assert.match(bladeLighting, /smoothstep\(0\.45, 1\.0, bladeGlintHeightRatio\)/);
    assert.match(bladeLighting, /bladeGlintGate\(info\.L\)\*vBladeGlintWeight/);
    assert.match(bladeLighting, /mix\(sunFacing, 1\.0, bladeSideLightEvenness\)/);
    assert.match(bladeLighting, /0\.5 \* \(visibleFace \+ oppositeFace\)/);
    assert.match(bladeLighting, /bladeDiffuseFacing\(N,result\.L\)/);
    assert.match(bladeLighting, /bladeDiffuseFacing\(N,lightData\.xyz\)/);
    assert.match(bladeLighting, /effect\.setFloat\('bladeSideLightEvenness', this\.sideLightEvenness\)/);
    assert.match(scene, /this\.material\.environmentIntensity = 0/);
    assert.match(scene, /this\.material\.metallic = 0/);
    assert.match(scene, /this\.mesh\.receiveShadows = true/);
    assert.match(scene, /data\.colors = blade\.colors/);
    assert.match(scene, /mesh\.useVertexColors = true/);
    assert.match(scene, /new ShadowGenerator\(2048, this\.sun, true\)/);
    assert.match(scene, /'\/models\/terrain\/rusting-relic\.glb',[\s\S]*?63,[\s\S]*?'horizontal'/);
    assert.match(scene, /'\/models\/terrain\/rusty-stop-sign\.glb',[\s\S]*?33,[\s\S]*?'height',[\s\S]*?-34,[\s\S]*?-18/);
    assert.match(scene, /const measuredSize = fit === 'height' \? size\.y : Math\.max\(size\.x, size\.z\)/);
    assert.match(scene, /root\.position\.set\(worldX - center\.x \* scale, -minimum\.y \* scale \+ 0\.03, worldZ - center\.z \* scale\)/);
    assert.match(scene, /this\.shadowGenerator\.addShadowCaster\(mesh\)/);
    assert.doesNotMatch(scene, /MeshBuilder\.CreateBox\('terrain-shadow-probe'/);
    const relic = fs.readFileSync('public/models/terrain/rusting-relic.glb');
    assert.equal(relic.subarray(0, 4).toString('ascii'), 'glTF');
    const stopSign = fs.readFileSync('public/models/terrain/rusty-stop-sign.glb');
    assert.equal(stopSign.subarray(0, 4).toString('ascii'), 'glTF');
    assert.match(scene, /this\.sun\.position\.copyFrom\(this\.sun\.direction\.scale\(-180\)\)/);
    assert.doesNotMatch(scene, /this\.material\.disableLighting = true/);
  });

  it('builds clustered octagonal flower heads with procedural cone and bump normals', () => {
    const defaults = createDefaultTerrainConfig();
    assert.equal(defaults.stages.flowerCover, true);
    assert.deepEqual(
      {
        count: defaults.flowers.count,
        clumps: defaults.flowers.clumpCount,
        radius: defaults.flowers.radius,
        centerRadius: defaults.flowers.centerRadius,
        petalColor: defaults.flowers.petalColor,
        centerColor: defaults.flowers.centerColor,
      },
      { count: 280, clumps: 20, radius: 0.48, centerRadius: 0.17, petalColor: '#f4f1dd', centerColor: '#a97651' },
    );
    assert.equal(defaults.flowers.bluePetalColor, '#2f6dff');
    assert.equal(defaults.flowers.yellowPetalColor, '#ffd84a');
    assert.equal(defaults.flowers.blueClumpFraction, 0.06);
    assert.equal(defaults.flowers.yellowClumpFraction, 0.25);
    assert.equal(defaults.flowers.pocketClumpFraction, 0.55);
    assert.equal(defaults.flowers.pocketGrowthThreshold, 0.42);
    assert.equal(defaults.flowers.grassHeightRatio, 0.8);
    assert.equal(defaults.flowers.grassHeightRatioVariation, 0.25);
    assert.equal(defaults.flowers.windInfluence, 1.04);
    const cone = buildFlowerDiscVertexData({ radius: 1.6, segments: 8, normalStrength: 0.85, profile: 'cone' });
    const bump = buildFlowerDiscVertexData({ radius: 0.55, segments: 8, normalStrength: 1.4, profile: 'bump' });
    assert.equal(cone.positions.length / 3, 24);
    assert.equal(cone.indices.length, 24);
    assert.equal(bump.positions.length / 3, 24);
    assert.ok(cone.normals[0] !== 0 || cone.normals[2] !== 0);
    assert.deepEqual(bump.normals.slice(0, 3), [0, 1, 0]);
    const scene = fs.readFileSync('src/scene.ts', 'utf8');
    const foliageWind = fs.readFileSync('src/blade-lighting-plugin.ts', 'utf8');
    assert.match(scene, /const clumpCenters: Vector3\[\] = \[\]/);
    assert.match(scene, /petalMesh\.thinInstanceAdd\(matrices\)/);
    assert.match(scene, /centerMesh\.thinInstanceAdd\(matrices\)/);
    assert.match(scene, /petalMesh\.thinInstanceSetBuffer\('color', petalColors, 4, true\)/);
    assert.match(scene, /const colorRandom = seeded\(config\.seed \^ 0xc01045\)/);
    assert.match(scene, /growth <= flower\.pocketGrowthThreshold/);
    assert.match(scene, /const scatterRandom = seeded\(config\.seed \^ 0xf10e32\)/);
    assert.match(scene, /flower\.grassHeightRatio \+ \(random\(\) \* 2 - 1\) \* flower\.grassHeightRatioVariation/);
    assert.match(scene, /Math\.max\(config\.blades\.growthMinimumHeightScale, scale \* heightFactor\)/);
    assert.match(scene, /this\.shadowGenerator\.addShadowCaster\(mesh\)/);
    assert.match(scene, /mesh\.receiveShadows = true/);
    assert.match(scene, /this\.flowerCover\.advanceWind\(deltaSeconds\)/);
    assert.match(scene, /config\.blades\.windTiltDegrees \* config\.flowers\.windInfluence/);
    assert.match(scene, /new BladeLightingPlugin\(this\.petalMaterial, 1, 0, 0, interactionTrail, true\)/);
    assert.match(foliageWind, /vec3 bladeAnchor = mix\(world3\.xyz, vec3\(world3\.x, 0\.0, world3\.z\), bladeStemMode\)/);
    assert.match(foliageWind, /bladeWindTipWeight = max\(step\(0\.0001, position\.y\), bladeStemMode\)/);
  });

  it('builds procedural 16-vertex seamed broad leaves and an in-memory oval gradient', () => {
    const settings = { length: 2.4, width: 1.1, rise: 0.72, seamStrength: 0.75, curveStrength: 0.55 };
    const leaf = buildBroadleafVertexData(settings);
    assert.equal(leaf.positions.length / 3, 16);
    assert.equal(leaf.indices.length / 3, 12);
    assert.equal(leaf.uvs.length / 2, 16);
    assert.equal(leaf.colors.length / 4, 16);
    assert.deepEqual(leaf.positions.slice(0, 15), leaf.positions.slice(24, 39));
    assert.ok(leaf.normals[0]! * leaf.normals[24]! < 0);
    assert.equal(leaf.positions[1], 0);
    assert.equal(leaf.positions[25], 0);
    assert.ok(leaf.positions.at(-2)! > 0);
    assert.ok(leaf.foldWeights.every((weight) => weight === 0));

    const gradient = generateBroadleafGradientData(32, 64, '#6b9654', '#7faa62', '#acca7a');
    assert.equal(gradient.length, 32 * 64 * 4);
    assert.ok(gradient[0]! < gradient[(32 * 32 + 16) * 4]!);
    for (let alpha = 3; alpha < gradient.length; alpha += 4) assert.equal(gradient[alpha], 255);

    const config = createDefaultTerrainConfig();
    assert.equal(config.stages.leafCover, true);
    assert.equal(config.leaves.colorVariation, 0.4);
    assert.equal(config.leaves.pocketClumpFraction, 0.65);
    assert.equal(config.leaves.clumpRadius, 5);
    assert.equal(config.leaves.plantSpacing, 1.75);
    assert.deepEqual(
      {
        clumps: config.leaves.clumpCount,
        plants: [config.leaves.minPlantsPerClump, config.leaves.maxPlantsPerClump],
        leaves: [config.leaves.minLeavesPerPlant, config.leaves.maxLeavesPerPlant],
        threshold: config.leaves.shortGrassThreshold,
      },
      { clumps: 16, plants: [3, 8], leaves: [3, 5], threshold: 0.42 },
    );
    const scene = fs.readFileSync('src/scene.ts', 'utf8');
    assert.match(scene, /generateBroadleafGradientData\(32, 64/);
    assert.match(scene, /growth <= leaf\.shortGrassThreshold/);
    assert.match(scene, /Math\.min\(8, Math\.round\(leaf\.maxPlantsPerClump\)\)/);
    assert.match(scene, /Math\.min\(5, Math\.round\(leaf\.maxLeavesPerPlant\)\)/);
    assert.match(scene, /this\.broadleafCover\.advanceWind\(deltaSeconds\)/);
    assert.match(scene, /this\.broadleafCover\.setInteractionCenter/);
    assert.match(scene, /this\.mesh\.thinInstanceRefreshBoundingInfo\(true\);\s+this\.shadowGenerator\.addShadowCaster\(this\.mesh\)/);
    assert.match(scene, /this\.mesh\.thinInstanceSetBuffer\('color', instanceColors\.subarray/);
    assert.match(scene, /const colorRandom = seeded\(config\.seed \^ 0xc01eaf\)/);
    assert.match(scene, /const scatterRandom = seeded\(config\.seed \^ 0x1eaf252\)/);
  });

  it('animates root-pinned RGB vector wind entirely in the blade vertex shader', () => {
    const plugin = fs.readFileSync('src/blade-lighting-plugin.ts', 'utf8');
    const scene = fs.readFileSync('src/scene.ts', 'utf8');
    assert.match(plugin, /vec3 bladeWindRgbNoise\(vec2 point\)/);
    assert.match(plugin, /bladeWindRgb\.rg \* 2\.0 - 1\.0/);
    assert.match(plugin, /bladeWindTiltRadians \* bladeWindMagnitude \* bladeWindTipWeight/);
    assert.match(plugin, /world3\.xz - bladeWindOffset/);
    assert.match(plugin, /bladeWindTipWeight = max\(step\(0\.0001, position\.y\), bladeStemMode\)/);
    assert.match(plugin, /pow\(bladeWindRgb\.b, bladeWindBendExponent\)/);
    assert.match(plugin, /bladeWindRootOffset = worldPos\.xyz - bladeWindRoot/);
    assert.match(plugin, /worldPos\.xyz = bladeWindRoot \+ bladeWindBentOffset/);
    assert.match(plugin, /vNormalW = normalize\(bladeRotateAroundAxis/);
    assert.match(plugin, /vBladeSpecW = normalize\(bladeRotateAroundAxis/);
    assert.deepEqual(plugin.match(/uniform sampler2D \w+/g), ['uniform sampler2D bladeInteractionTrail']);
    assert.match(
      scene,
      /const deltaSeconds = this\.engine\.getDeltaTime\(\) \/ 1000;\s+this\.advanceAutoFlyby\(deltaSeconds\);\s+this\.bladeCover\.advanceWind\(deltaSeconds\);\s+this\.flowerCover\.advanceWind\(deltaSeconds\);\s+this\.broadleafCover\.advanceWind\(deltaSeconds\)/,
    );
    assert.match(scene, /Shader-only blade settings update uniforms above/);
  });

  it('drags a ground sphere that sends RGB contact displacement to blade uniforms', () => {
    const plugin = fs.readFileSync('src/blade-lighting-plugin.ts', 'utf8');
    const scene = fs.readFileSync('src/scene.ts', 'utf8');
    assert.match(plugin, /texture2D\(bladeInteractionTrail, bladeInteractionTrailUv\)/);
    assert.match(plugin, /bladeInteractionOffset = worldPos\.xyz - bladeAnchor/);
    assert.match(plugin, /bladeCombinedInteractionInfluence = max/);
    assert.equal(plugin.match(/bladeInteractionMaxTiltRadians \* clamp/g)?.length, 1);
    assert.match(plugin, /bladeInteractionMaxTiltRadians \* clamp/);
    assert.match(plugin, /worldPos\.y = max\(worldPos\.y, bladeAnchor\.y \+ bladeInteractionGroundClearance\)/);
    assert.doesNotMatch(plugin, /worldPos\.xz \+= bladeInteraction(?:TrailDisplacement|Rgb)\.rg/);
    assert.match(plugin, /effect\.setFloat2\('bladeInteractionCenter'/);
    assert.match(scene, /MeshBuilder\.CreateSphere/);
    assert.match(scene, /this\.interactionSphere\.position\.set\(46, initialConfig\.blades\.interactionSphereRadius, -46\)/);
    assert.match(scene, /new PointerDragBehavior\(\{ dragPlaneNormal: Vector3\.Up\(\) \}\)/);
    assert.match(scene, /entry\.source !== 'pointer' && entry\.source !== 'keyboard'/);
    assert.match(scene, /addEntry\(\{ source: 'pointer', button: 1, interaction: 'rotate' \}\)/);
    assert.match(scene, /sphereDrag\.dragButtons = \[0\]/);
    assert.match(scene, /sphereDrag\.detachCameraControls = true/);
    assert.match(scene, /sphereDrag\.onDragObservable\.add/);
    assert.match(scene, /this\.interactionSphere\.position\.y = radius/);
    assert.match(scene, /window\.addEventListener\('keydown', this\.onInteractionKeyDown\)/);
    assert.match(scene, /this\.interactionMoveKeys\.has\('ArrowRight'\)/);
    assert.match(scene, /this\.interactionMoveKeys\.has\('ArrowUp'\)/);
    assert.match(scene, /this\.advanceInteractionSphere\(deltaSeconds\)/);
    assert.match(scene, /cameraRelativeGroundDirection\(/);
    assert.match(scene, /this\.stampInteractionTrailSegment\(/);
    assert.match(scene, /movementX \/ movementDistance/);
    assert.match(scene, /const \[encodedDirectionX, encodedDirectionZ\] = encodeCrushDirection/);
    assert.match(scene, /resetInteractionTrail\(\): void/);
    assert.match(scene, /this\.interactionTrailTexture\.update/);
    assert.match(scene, /window\.removeEventListener\('keydown', this\.onInteractionKeyDown\)/);
    assert.match(scene, /this\.bladeCover\.setInteractionCenter/);
    assert.match(scene, /this\.flowerCover\.setInteractionCenter/);
  });

  it('samples smooth color/growth noise and locally softened cellular tilt clumps', () => {
    const value = perlinNoise2D(0.37, -1.21, 1337);
    assert.equal(value, perlinNoise2D(0.37, -1.21, 1337));
    assert.notEqual(value, perlinNoise2D(0.37, -1.21, 7331));
    assert.ok(Math.abs(value - perlinNoise2D(0.371, -1.209, 1337)) < 0.01);
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        const sample = perlinNoise2D(x * 0.31, z * 0.27, 91);
        assert.ok(sample >= 0 && sample <= 1);
      }
    }

    const patch = sampleBladePatch(12.5, -8.75, 1337, 24, 24, 0.3, 0.65, 4);
    assert.notEqual(patch.tint, patch.growth);
    assert.ok(patch.heightFactor >= 0.7 && patch.heightFactor <= 1.3);
    assert.ok(patch.densityProbability >= 0.35 && patch.densityProbability <= 1);
    assert.ok(bladeDensityProbability(0.42, 1, 1.75) > 0.2);
    assert.ok(bladeDensityProbability(0.42, 1, 1.75) < 0.25);
    assert.ok(bladeDensityProbability(0.2, 1, 1.75) < 0.07);
    const disabled = sampleBladePatch(12.5, -8.75, 1337, 24, 24, 0, 0, 4);
    assert.equal(disabled.heightFactor, 1);
    assert.equal(disabled.densityProbability, 1);

    const tilt = sampleBladeTiltPatch(12.5, -8.75, 1337, 12, 0.5, 0.32);
    assert.deepEqual(tilt, sampleBladeTiltPatch(12.5, -8.75, 1337, 12, 0.5, 0.32));
    assert.notDeepEqual(tilt.rgb, sampleBladeTiltPatch(12.5, -8.75, 7331, 12, 0.5, 0.32).rgb);
    assert.ok(tilt.rgb.every((channel) => channel >= 0 && channel <= 1));
    assert.ok(tilt.strength >= 0 && tilt.strength <= 1);
    assert.ok(Math.abs(Math.hypot(tilt.directionX, tilt.directionZ) - 1) < 1e-9);
    let sawConstantCellInterior = false;
    let sawSoftTransition = false;
    let maximumSoftDelta = 0;
    let maximumHardDelta = 0;
    let previousTilt = sampleBladeTiltPatch(-36, -8.75, 1337, 12, 0.5, 0.32);
    let previousHardTilt = sampleBladeTiltPatch(-36, -8.75, 1337, 12, 0.5, 0);
    for (let x = -35.95; x <= 36; x += 0.05) {
      const currentTilt = sampleBladeTiltPatch(x, -8.75, 1337, 12, 0.5, 0.32);
      const currentHardTilt = sampleBladeTiltPatch(x, -8.75, 1337, 12, 0.5, 0);
      const directionDelta = Math.hypot(
        currentTilt.directionX - previousTilt.directionX,
        currentTilt.directionZ - previousTilt.directionZ,
      );
      const hardDirectionDelta = Math.hypot(
        currentHardTilt.directionX - previousHardTilt.directionX,
        currentHardTilt.directionZ - previousHardTilt.directionZ,
      );
      if (directionDelta < 1e-12) sawConstantCellInterior = true;
      if (directionDelta > 1e-5 && directionDelta < 0.15) sawSoftTransition = true;
      maximumSoftDelta = Math.max(maximumSoftDelta, directionDelta);
      maximumHardDelta = Math.max(maximumHardDelta, hardDirectionDelta);
      previousTilt = currentTilt;
      previousHardTilt = currentHardTilt;
    }
    assert.equal(sawConstantCellInterior, true);
    assert.equal(sawSoftTransition, true);
    assert.ok(maximumSoftDelta < maximumHardDelta);
  });

  it('builds height-aware asymmetric blades with paired two-sided normals', () => {
    const settings = createDefaultTerrainConfig().blades;
    const flat = buildBladeVertexData({
      ...settings,
      normalCurveDegrees: 0,
      normalFlatten: 0,
    });
    assert.ok(Math.abs(flat.positions[7]! - settings.height * (1 - settings.tipDropRatio)) < 1e-9);
    assert.equal(flat.positions[10], settings.height);
    assert.deepEqual(flat.foldWeights, [0, 0, 0, 1, 0, 0, 0, 1]);
    for (let vertex = 0; vertex < 4; vertex++) {
      assert.deepEqual(flat.normals.slice(vertex * 3, vertex * 3 + 3), [0, 0, -1]);
      assert.deepEqual(flat.normals.slice((vertex + 4) * 3, (vertex + 4) * 3 + 3), [0, 0, 1]);
    }

    const curved = buildBladeVertexData({
      ...settings,
      normalCurveDegrees: 40,
      normalFlatten: 0,
    });
    const shoulder = curved.normals.slice(6, 9);
    const fullTip = curved.normals.slice(9, 12);
    assert.ok(Math.abs(fullTip[1]! - Math.sin((40 * Math.PI) / 180)) < 1e-6);
    assert.ok(Math.abs(shoulder[1]! - Math.sin((40 * (1 - settings.tipDropRatio) * Math.PI) / 180)) < 1e-6);
    for (let component = 0; component < 3; component++)
      assert.ok(Math.abs(curved.normals[9 + component]! + curved.normals[21 + component]!) < 1e-6);
    assert.ok(curved.colors[8]! > curved.colors[0]!);
    assert.ok(curved.colors[8]! < curved.colors[12]!);

    const flattened = buildBladeVertexData(settings);
    assert.ok(flattened.normals[1]! > 0.9);
    assert.ok(flattened.normals[13]! > 0.9);
  });

  it('exposes every non-slot numeric tuning value in one unique control schema', () => {
    const paths = CONTROL_SCHEMA.map((control) => control.path);
    assert.equal(new Set(paths).size, paths.length);
    const config = createDefaultTerrainConfig() as unknown as Record<string, unknown>;
    const numericPaths: string[] = [];
    const visit = (value: unknown, prefix: string): void => {
      if (typeof value === 'number') {
        if (prefix !== 'version') numericPaths.push(prefix);
        return;
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      for (const [key, child] of Object.entries(value)) visit(child, prefix ? `${prefix}.${key}` : key);
    };
    visit(config, '');
    assert.deepEqual(numericPaths.sort(), [...paths].sort());
  });

  it('reports shader sampling cost from the active stages', () => {
    const config = createDefaultTerrainConfig();
    assert.equal(estimateTextureSamples(config), 4);
    config.stages.randomization = true;
    config.stages.surfaceBlend = true;
    config.stages.detailPbr = true;
    assert.equal(estimateTextureSamples(config), 19);
    assert.equal(shaderVariantKey(config, true), 'production-reference');
  });

  it('starts with visible, grounded, exactly countable grass controls', () => {
    const cover = createDefaultTerrainConfig().cover;
    assert.equal(cover.count, 1200);
    assert.equal(cover.variant, -1);
    assert.ok(cover.width >= 5 && cover.height >= 3);
    assert.ok(cover.groundOffset < 0);
    for (const path of [
      'cover.count',
      'cover.variant',
      'cover.width',
      'cover.height',
      'cover.groundOffset',
      'cover.offsetX',
      'cover.offsetZ',
      'cover.spread',
      'cover.cropPadding',
    ]) {
      assert.ok(
        CONTROL_SCHEMA.some((control) => control.path === path),
        path,
      );
    }
  });

  it('does not import the production client, simulation, HUD, multiplayer, or audio', () => {
    const files = fs.readdirSync('src').filter((file) => /\.(ts|svelte)$/.test(file));
    const source = files.map((file) => fs.readFileSync(path.join('src', file), 'utf8')).join('\n');
    assert.doesNotMatch(source, /src\/client|src\/shared|GameScreen|Renderer3D|battle-audio|Colyseus/);
  });

  it('offers scoped JSON copying from every terrain inspector section', () => {
    const app = fs.readFileSync('src/App.svelte', 'utf8');
    for (const section of [
      'Foliage layers',
      'Blade cover',
      'Blade patches',
      'Flower cover',
      'Broadleaf cover',
      'Lighting presets',
      'Configuration',
    ]) {
      assert.match(app, new RegExp(`aria-label="Copy ${section} JSON"`), section);
    }
    assert.match(app, /aria-label={`Copy \${group} JSON`}/);
    assert.match(app, /controlGroupConfig\('Blade patches', \['blades\.tintNoiseColor'\]\)/);
    assert.match(app, /group === 'Blade wind'/);
    assert.match(app, /group === 'Blade interaction'/);
    assert.match(app, /aria-label="Reset crushed grass"/);
  });

  it('offers an ordered ladder of terrain camera angles with a true overhead preset', () => {
    const scene = fs.readFileSync('src/scene.ts', 'utf8');
    const app = fs.readFileSync('src/App.svelte', 'utf8');
    assert.match(scene, /CAMERA_PRESETS = \['top', 'high', 'rts', 'close', 'low', 'grazing'\] as const/);
    assert.match(scene, /top: \[-Math\.PI \/ 2, 0\.001, 140\]/);
    assert.match(scene, /high: \[-Math\.PI \/ 2, 0\.4, 165\]/);
    assert.match(scene, /rts: \[-Math\.PI \/ 2, 0\.72, 210\]/);
    assert.match(scene, /low: \[-Math\.PI \/ 2\.45, 1\.18, 72\]/);
    assert.match(scene, /setAutoFlyby\(enabled: boolean\)/);
    assert.match(scene, /this\.camera\.radius = 126 \+ Math\.sin\(time \* 0\.31 - Math\.PI \/ 2\) \* 78/);
    assert.match(scene, /'camera-zoom-no-facing'/);
    assert.match(scene, /'no-view-facing'/);
    assert.match(scene, /config\.blades\.viewFacing = 0/);
    assert.doesNotMatch(scene, /frameSamples\.shift\(\)/);
    assert.match(scene, /new FrameCadenceTracker\(512\)/);
    assert.match(app, /'Run stutter soak \(10 min\)'/);
    assert.match(app, /#each CAMERA_PRESETS as preset/);
    assert.match(app, />Auto flyby<\/button>/);
  });
});
