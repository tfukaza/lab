import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import type { MaterialDefines } from '@babylonjs/core/Materials/materialDefines.js';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import type { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh.js';
import type { Scene } from '@babylonjs/core/scene.js';

// Plugin custom-code keys starting with "!" are regular expressions applied to
// the FINAL shader code, after all #include<> statements have been expanded
// (see materialPluginManager._injectCustomCode + effect.functions
// _ProcessShaderCode: processFinalCode runs on the migrated code). Patterns
// against "#include<...>" lines therefore never match; the patches below
// target the expanded statements themselves.
// These declarations are consumed inside the (include-expanded) lighting
// functions near the top of the fragment shader — before the spot where
// CUSTOM_FRAGMENT_DEFINITIONS gets injected — so they are anchored to the
// preLightingInfo struct declaration instead.
const BLADE_FRAGMENT_DECLARATIONS = `
uniform float bladeDiffuseDirectionality;
uniform float bladeGlintSpread;
uniform float bladeSideLightEvenness;
uniform vec3 bladeGlintColor;
varying vec3 vBladeSpecW;
varying float vBladeGlintWeight;
float bladeDiffuseFacing(vec3 N, vec3 L) {
  float visibleFace = abs(dot(N, L));
  // Normal flattening preserves +Y while reversing XZ for the duplicated
  // opposite face. Average that paired response at full evenness so both
  // faces receive identical diffuse light without discarding vertical form.
  vec3 pairedNormal = normalize(vec3(-N.x, N.y, -N.z));
  float oppositeFace = abs(dot(pairedNormal, L));
  return mix(visibleFace, 0.5 * (visibleFace + oppositeFace), bladeSideLightEvenness);
}
float bladeGlintGate(vec3 L) {
  // Compare horizontal facing only: the curved spec normal tilts up toward
  // the tip, so a full-vector test would pass for tips on the shadow side
  // of every blade whenever the sun is high.
  vec2 faceH = vBladeSpecW.xz;
  vec2 lightH = L.xz;
  float faceLen = length(faceH);
  float lightLen = length(lightH);
  if (faceLen < 0.0001 || lightLen < 0.0001) return 1.0;
  float sunFacing = smoothstep(0.1, 0.5, dot(faceH / faceLen, lightH / lightLen));
  return mix(sunFacing, 1.0, bladeSideLightEvenness);
}
struct preLightingInfo`;

const BLADE_VERTEX_DEFINITIONS = `
uniform float bladeViewFacing;
uniform float bladeGlintTipBias;
uniform vec3 bladeCameraPosition;
uniform float bladeWindSeed;
uniform vec2 bladeWindOffset;
uniform float bladeWindPatchSize;
uniform float bladeWindTiltRadians;
uniform float bladeWindAzimuthRadians;
uniform float bladeWindDirectionBias;
uniform float bladeWindBendExponent;
uniform vec2 bladeInteractionCenter;
uniform float bladeInteractionRadius;
uniform float bladeInteractionPushStrength;
uniform float bladeInteractionSquashStrength;
uniform float bladeInteractionMaxTiltRadians;
uniform float bladeInteractionGroundClearance;
uniform sampler2D bladeInteractionTrail;
uniform float bladeInteractionWorldSize;
uniform float bladeStemMode;
uniform float bladeRootOcclusion;
uniform float bladeAuthoredHeight;
uniform vec3 bladeFoldOrigin;
uniform vec3 bladeFoldAxis;
uniform float bladeRootGroundBlend;
attribute vec3 bladeSpecNormal;
attribute vec3 bladeRootGround;
attribute float bladeBend;
attribute float bladeFoldWeight;
varying vec3 vBladeSpecW;
varying float vBladeGlintWeight;

vec3 bladeWindHash(vec2 lattice) {
  vec3 projections = vec3(
    dot(lattice, vec2(127.1, 311.7)),
    dot(lattice, vec2(269.5, 183.3)),
    dot(lattice, vec2(419.2, 371.9))
  );
  vec3 seedOffset = bladeWindSeed * vec3(0.1031, 0.11369, 0.13787);
  return fract(sin(projections + seedOffset) * 43758.5453);
}

vec3 bladeWindRgbNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 smoothLocal = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
  vec3 lower = mix(bladeWindHash(cell), bladeWindHash(cell + vec2(1.0, 0.0)), smoothLocal.x);
  vec3 upper = mix(bladeWindHash(cell + vec2(0.0, 1.0)), bladeWindHash(cell + vec2(1.0)), smoothLocal.x);
  return mix(lower, upper, smoothLocal.y);
}

vec3 bladeRotateAroundAxis(vec3 value, vec3 axis, float angle) {
  float cosine = cos(angle);
  float sine = sin(angle);
  return value * cosine + cross(axis, value) * sine + axis * dot(axis, value) * (1.0 - cosine);
}
`;

// Yaws each blade around its root axis toward the camera, in local space so
// the thin-instance batch is untouched. world0..world3 are the per-instance
// matrix columns; the blade mesh itself has an identity world transform. The
// yaw is wrapped to (-90deg, 90deg]: the mesh is double-faced and lit with
// abs(N.L), so snapping to the nearer face is invisible. atan(target) is zero
// for blades already facing the camera, so the correction self-weights toward
// edge-on blades.
const BLADE_VERTEX_UPDATE_POSITION = `
float bladeStaticBendAngle = bladeBend * bladeFoldWeight;
positionUpdated = bladeFoldOrigin + bladeRotateAroundAxis(
  positionUpdated - bladeFoldOrigin,
  bladeFoldAxis,
  bladeStaticBendAngle
);
float bladeFacingCos = 1.0;
float bladeFacingSin = 0.0;
#ifdef INSTANCES
if (bladeViewFacing > 0.0) {
  vec3 bladeToCamera = bladeCameraPosition - world3.xyz;
  float bladeLocalX = dot(world0.xyz, bladeToCamera);
  float bladeLocalZ = dot(world2.xyz, bladeToCamera);
  if (abs(bladeLocalX) + abs(bladeLocalZ) > 0.0001) {
    float bladeYaw = atan(bladeLocalX, bladeLocalZ);
    bladeYaw -= 3.14159265 * floor(bladeYaw / 3.14159265 + 0.5);
    bladeYaw *= bladeViewFacing;
    bladeFacingCos = cos(bladeYaw);
    bladeFacingSin = sin(bladeYaw);
    positionUpdated.xz = vec2(
      bladeFacingCos * positionUpdated.x + bladeFacingSin * positionUpdated.z,
      -bladeFacingSin * positionUpdated.x + bladeFacingCos * positionUpdated.z
    );
  }
}
#endif
`;

// The diffuse normal is flattened toward up for even fields, which erases the
// blade's authored curvature. The specular path instead uses the unflattened
// curved face normal (bladeSpecNormal attribute) so glints band along each
// blade and respond to side-on viewing, not just top-down.
const BLADE_VERTEX_UPDATE_NORMAL = `
normalUpdated = bladeRotateAroundAxis(normalUpdated, bladeFoldAxis, bladeStaticBendAngle);
normalUpdated.xz = vec2(
  bladeFacingCos * normalUpdated.x + bladeFacingSin * normalUpdated.z,
  -bladeFacingSin * normalUpdated.x + bladeFacingCos * normalUpdated.z
);
vec3 bladeBentSpecNormal = bladeRotateAroundAxis(
  bladeSpecNormal,
  bladeFoldAxis,
  bladeStaticBendAngle
);
vec3 bladeSpecLocal = vec3(
  bladeFacingCos * bladeBentSpecNormal.x + bladeFacingSin * bladeBentSpecNormal.z,
  bladeBentSpecNormal.y,
  -bladeFacingSin * bladeBentSpecNormal.x + bladeFacingCos * bladeBentSpecNormal.z
);
#ifdef INSTANCES
vBladeSpecW = normalize(mat3(world0.xyz, world1.xyz, world2.xyz) * bladeSpecLocal);
#else
vBladeSpecW = bladeSpecLocal;
#endif
`;

// The animated RGB field is sampled from the thin-instance root, so every
// vertex on one blade receives one coherent direction/magnitude. RG decodes
// to a signed local direction, B to bend magnitude. The deformation is
// applied after instancing in world space: this layers over the seeded static
// lean, keeps both root vertices pinned, and lets diffuse/specular normals
// follow the same height-weighted bend.
const BLADE_VERTEX_UPDATE_WORLDPOS = `
#ifdef INSTANCES
// Stem mode (flower heads): the instance origin floats at the top of an
// invisible stem, so the deformation anchors to the ground point beneath it
// and every vertex sways. Blades/leaves anchor at their own instance root and
// keep their y<=0 root vertices pinned.
vec3 bladeAnchor = mix(world3.xyz, vec3(world3.x, 0.0, world3.z), bladeStemMode);
float bladeWindTipWeight = max(step(0.0001, position.y), bladeStemMode);
if (bladeWindTiltRadians > 0.0 && bladeWindTipWeight > 0.0) {
  vec2 bladeWindTravelDirection = vec2(cos(bladeWindAzimuthRadians), sin(bladeWindAzimuthRadians));
  vec2 bladeWindPoint = (world3.xz - bladeWindOffset) / max(bladeWindPatchSize, 0.0001);
  vec3 bladeWindRgb = bladeWindRgbNoise(bladeWindPoint);
  vec2 bladeWindEncodedDirection = bladeWindRgb.rg * 2.0 - 1.0;
  float bladeWindEncodedLength = length(bladeWindEncodedDirection);
  vec2 bladeWindLocalDirection = bladeWindEncodedLength > 0.0001
    ? bladeWindEncodedDirection / bladeWindEncodedLength
    : bladeWindTravelDirection;
  vec2 bladeWindMixedDirection = mix(
    bladeWindLocalDirection,
    bladeWindTravelDirection,
    bladeWindDirectionBias
  );
  float bladeWindMixedLength = length(bladeWindMixedDirection);
  vec2 bladeWindDirection = bladeWindMixedLength > 0.0001
    ? bladeWindMixedDirection / bladeWindMixedLength
    : bladeWindTravelDirection;
  // Both vertices of the asymmetric tip must share exactly one bend angle.
  // Using their unequal authored Y values stretches the top edge as the wind
  // rises. The exponent instead shapes the RGB magnitude response while the
  // semantic root/tip weight keeps the four-vertex cross-section coherent.
  float bladeWindMagnitude = pow(bladeWindRgb.b, bladeWindBendExponent);
  float bladeWindAngle = bladeWindTiltRadians * bladeWindMagnitude * bladeWindTipWeight;
  vec3 bladeWindAxis = normalize(vec3(bladeWindDirection.y, 0.0, -bladeWindDirection.x));
  // Rotate the complete root-relative vertex offset. Translating only the
  // center stem leaves the blade width behind and shears the quad wider as
  // it bends, while rotating the full offset preserves its cross-section.
  vec3 bladeWindRoot = bladeAnchor;
  vec3 bladeWindRootOffset = worldPos.xyz - bladeWindRoot;
  vec3 bladeWindBentOffset = bladeRotateAroundAxis(bladeWindRootOffset, bladeWindAxis, bladeWindAngle);
  worldPos.xyz = bladeWindRoot + bladeWindBentOffset;
  vPositionW = worldPos.xyz;
#ifdef NORMAL
  vNormalW = normalize(bladeRotateAroundAxis(vNormalW, bladeWindAxis, bladeWindAngle));
#endif
  vBladeSpecW = normalize(bladeRotateAroundAxis(vBladeSpecW, bladeWindAxis, bladeWindAngle));
}
if (bladeInteractionRadius > 0.0) {
  // Combine persistent B-weighted trail contact and the live radial field,
  // then rotate the complete root-relative shape once so width is preserved
  // and the configured contact-angle cap applies to their total response.
  vec2 bladeInteractionTrailUv = world3.xz / bladeInteractionWorldSize + 0.5;
  vec3 bladeInteractionTrailRgb = texture2D(bladeInteractionTrail, bladeInteractionTrailUv).rgb;
  float bladeInteractionTrailInfluence = bladeInteractionTrailRgb.b;
  vec2 bladeInteractionTrailDirection = bladeInteractionTrailRgb.rg * 2.0 - 1.0;
  float bladeInteractionTrailDirectionLength = length(bladeInteractionTrailDirection);
  vec2 bladeCombinedInteraction = vec2(0.0);
  float bladeCombinedInteractionInfluence = 0.0;
  if (bladeInteractionTrailInfluence > 0.001 && bladeInteractionTrailDirectionLength > 0.001) {
    bladeInteractionTrailDirection /= bladeInteractionTrailDirectionLength;
    bladeCombinedInteraction += bladeInteractionTrailDirection * bladeInteractionTrailInfluence;
    bladeCombinedInteractionInfluence = bladeInteractionTrailInfluence;
  }
  vec2 bladeInteractionFromCenter = world3.xz - bladeInteractionCenter;
  float bladeInteractionDistance = length(bladeInteractionFromCenter);
  if (bladeInteractionDistance < bladeInteractionRadius) {
    vec2 bladeInteractionDirection = bladeInteractionDistance > 0.0001
      ? bladeInteractionFromCenter / bladeInteractionDistance
      : vec2(1.0, 0.0);
    float bladeInteractionInfluence = 1.0 - smoothstep(
      0.0,
      bladeInteractionRadius,
      bladeInteractionDistance
    );
    bladeCombinedInteraction += bladeInteractionDirection * bladeInteractionInfluence;
    bladeCombinedInteractionInfluence = max(bladeCombinedInteractionInfluence, bladeInteractionInfluence);
  }
  float bladeCombinedInteractionLength = length(bladeCombinedInteraction);
  if (bladeCombinedInteractionInfluence > 0.001 && bladeCombinedInteractionLength > 0.001) {
    vec2 bladeCombinedInteractionDirection = bladeCombinedInteraction / bladeCombinedInteractionLength;
    float bladeCombinedInteractionAngle = bladeInteractionMaxTiltRadians * clamp(
      bladeInteractionPushStrength * bladeInteractionSquashStrength * bladeCombinedInteractionInfluence,
      0.0,
      1.0
    );
    vec3 bladeCombinedInteractionAxis = normalize(vec3(
      bladeCombinedInteractionDirection.y,
      0.0,
      -bladeCombinedInteractionDirection.x
    ));
    vec3 bladeInteractionOffset = worldPos.xyz - bladeAnchor;
    worldPos.xyz = bladeAnchor + bladeRotateAroundAxis(
      bladeInteractionOffset,
      bladeCombinedInteractionAxis,
      bladeCombinedInteractionAngle * bladeWindTipWeight
    );
    vPositionW = worldPos.xyz;
#ifdef NORMAL
    vNormalW = normalize(bladeRotateAroundAxis(
      vNormalW,
      bladeCombinedInteractionAxis,
      bladeCombinedInteractionAngle * bladeWindTipWeight
    ));
#endif
    vBladeSpecW = normalize(bladeRotateAroundAxis(
      vBladeSpecW,
      bladeCombinedInteractionAxis,
      bladeCombinedInteractionAngle * bladeWindTipWeight
    ));
  }
  if (bladeWindTipWeight > 0.0) {
    worldPos.y = max(worldPos.y, bladeAnchor.y + bladeInteractionGroundClearance);
    vPositionW = worldPos.xyz;
  }
}
#endif
`;

// Root occlusion is applied here instead of being baked into vertex colors so
// it can scale with each instance's height: shorter blades sit lower in the
// canopy and receive proportionally less darkening. world1's length is the
// instance's Y scale (authored height multiplier). Afterwards the root is
// blended toward the procedural ground color sampled at this instance (the
// bladeRootGround attribute) so blades appear to grow out of the ground; the
// mix runs after occlusion so a fully-blended root matches the ground exactly.
const BLADE_VERTEX_MAIN_END = `
float bladeGlintHeightRatio = clamp(position.y / max(bladeAuthoredHeight, 0.0001), 0.0, 1.0);
vBladeGlintWeight = mix(
  1.0,
  smoothstep(0.45, 1.0, bladeGlintHeightRatio),
  bladeGlintTipBias
);
#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
{
  float bladeHeightRatio = clamp(position.y / max(bladeAuthoredHeight, 0.0001), 0.0, 1.0);
  float bladeOcclusionScale = 1.0;
  #ifdef INSTANCES
  bladeOcclusionScale = clamp(length(world1.xyz), 0.0, 1.0);
  #endif
  vColor.rgb *= 1.0 - bladeRootOcclusion * bladeOcclusionScale * (1.0 - bladeHeightRatio);
  #ifdef INSTANCES
  vColor.rgb = mix(vColor.rgb, bladeRootGround, bladeRootGroundBlend * (1.0 - bladeHeightRatio));
  #endif
}
#endif
`;

export interface BladeWindSettings {
  noisePatchSize: number;
  tiltDegrees: number;
  speed: number;
  azimuth: number;
  directionBias: number;
  bendExponent: number;
}

export interface BladeInteractionSettings {
  radius: number;
  pushStrength: number;
  squashStrength: number;
  maxTiltDegrees: number;
  groundClearance: number;
}

/**
 * Stabilizes foliage diffuse (flattened-normal wrap), keeps stylized sun-gated
 * specular glints on the true curved blade normal, and yaws blades toward the
 * camera so edge-on blades stay visible.
 */
export class BladeLightingPlugin extends MaterialPluginBase {
  private diffuseDirectionality: number;
  private viewFacing: number;
  private glintSpread: number;
  private glintTipBias = 0;
  private sideLightEvenness = 0;
  private rootOcclusion = 0;
  private authoredHeight = 1;
  private foldOrigin = { x: -0.5, y: 0, z: 0 };
  private foldAxis = { x: 1, y: 1, z: 0 };
  private rootGroundBlend = 0;
  private glintColor = { r: 1, g: 1, b: 1 };
  private windSeed = 0;
  private windOffsetX = 0;
  private windOffsetZ = 0;
  private interactionCenterX = 12;
  private interactionCenterZ = 0;
  private interaction: BladeInteractionSettings = {
    radius: 6,
    pushStrength: 0.85,
    squashStrength: 0.9,
    maxTiltDegrees: 38,
    groundClearance: 0.04,
  };
  private wind: BladeWindSettings = {
    noisePatchSize: 14,
    tiltDegrees: 18,
    speed: 11,
    azimuth: 99,
    directionBias: 0.75,
    bendExponent: 1.9,
  };

  constructor(
    material: PBRMaterial,
    diffuseDirectionality: number,
    viewFacing: number,
    glintSpread: number,
    private interactionTrail: Texture,
    private stemMode = false,
  ) {
    super(material, 'BladeWrappedLighting', 177, {} as MaterialDefines, true, true);
    this.diffuseDirectionality = diffuseDirectionality;
    this.viewFacing = viewFacing;
    this.glintSpread = glintSpread;
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL;
  }

  override getClassName(): string {
    return 'BladeLightingPlugin';
  }

  update(
    diffuseDirectionality: number,
    viewFacing: number,
    glintSpread: number,
    glintColor: { r: number; g: number; b: number },
    glintTipBias: number,
    sideLightEvenness: number,
    rootOcclusion: number,
    authoredHeight: number,
    authoredWidth: number,
    authoredTopWidth: number,
    tipDropRatio: number,
    rootGroundBlend: number,
    wind: BladeWindSettings,
    interaction: BladeInteractionSettings,
    windSeed: number,
  ): void {
    this.diffuseDirectionality = Math.max(0, Math.min(1, diffuseDirectionality));
    this.viewFacing = Math.max(0, Math.min(1, viewFacing));
    this.glintSpread = Math.max(0, Math.min(1, glintSpread));
    this.glintColor = { r: glintColor.r, g: glintColor.g, b: glintColor.b };
    this.glintTipBias = Math.max(0, Math.min(1, glintTipBias));
    this.sideLightEvenness = Math.max(0, Math.min(1, sideLightEvenness));
    this.rootOcclusion = Math.max(0, Math.min(1, rootOcclusion));
    this.authoredHeight = Math.max(0.0001, authoredHeight);
    const halfWidth = Math.max(0.001, authoredWidth) * 0.5;
    const halfTop = Math.min(Math.max(0.001, authoredWidth), Math.max(0.001, authoredTopWidth)) * 0.5;
    const shoulderHeight = this.authoredHeight * (1 - Math.max(0, Math.min(0.8, tipDropRatio)));
    const axisX = halfWidth + halfTop;
    const axisLength = Math.hypot(axisX, shoulderHeight) || 1;
    this.foldOrigin = { x: -halfWidth, y: 0, z: 0 };
    this.foldAxis = { x: axisX / axisLength, y: shoulderHeight / axisLength, z: 0 };
    this.rootGroundBlend = Math.max(0, Math.min(1, rootGroundBlend));
    if (windSeed !== this.windSeed) {
      this.windOffsetX = 0;
      this.windOffsetZ = 0;
    }
    this.windSeed = windSeed;
    this.wind = {
      noisePatchSize: Math.max(0.0001, wind.noisePatchSize),
      tiltDegrees: Math.max(0, Math.min(45, wind.tiltDegrees)),
      speed: Math.max(0, wind.speed),
      azimuth: wind.azimuth,
      directionBias: Math.max(0, Math.min(1, wind.directionBias)),
      bendExponent: Math.max(0.01, wind.bendExponent),
    };
    this.interaction = {
      radius: Math.max(0, interaction.radius),
      pushStrength: Math.max(0, interaction.pushStrength),
      squashStrength: Math.max(0, Math.min(1, interaction.squashStrength)),
      maxTiltDegrees: Math.max(0, Math.min(60, interaction.maxTiltDegrees)),
      groundClearance: Math.max(0, Math.min(0.5, interaction.groundClearance)),
    };
  }

  setInteractionCenter(x: number, z: number): void {
    this.interactionCenterX = x;
    this.interactionCenterZ = z;
  }

  advanceWind(deltaSeconds: number): void {
    const step = Math.max(0, Math.min(0.05, Number.isFinite(deltaSeconds) ? deltaSeconds : 0));
    const azimuth = (this.wind.azimuth * Math.PI) / 180;
    const distance = this.wind.speed * step;
    this.windOffsetX += Math.cos(azimuth) * distance;
    this.windOffsetZ += Math.sin(azimuth) * distance;
  }

  override getUniforms(): { externalUniforms?: string[] } {
    return {
      externalUniforms: [
        'bladeDiffuseDirectionality',
        'bladeGlintSpread',
        'bladeGlintColor',
        'bladeGlintTipBias',
        'bladeSideLightEvenness',
        'bladeViewFacing',
        'bladeCameraPosition',
        'bladeWindSeed',
        'bladeWindOffset',
        'bladeWindPatchSize',
        'bladeWindTiltRadians',
        'bladeWindAzimuthRadians',
        'bladeWindDirectionBias',
        'bladeWindBendExponent',
        'bladeInteractionCenter',
        'bladeInteractionRadius',
        'bladeInteractionPushStrength',
        'bladeInteractionSquashStrength',
        'bladeInteractionMaxTiltRadians',
        'bladeInteractionGroundClearance',
        'bladeInteractionWorldSize',
        'bladeStemMode',
        'bladeRootOcclusion',
        'bladeAuthoredHeight',
        'bladeFoldOrigin',
        'bladeFoldAxis',
        'bladeRootGroundBlend',
      ],
    };
  }

  override getAttributes(attributes: string[], _scene: Scene, _mesh: AbstractMesh): void {
    attributes.push('bladeSpecNormal', 'bladeRootGround', 'bladeBend', 'bladeFoldWeight');
  }

  override getSamplers(samplers: string[]): void {
    samplers.push('bladeInteractionTrail');
  }

  override getActiveTextures(activeTextures: BaseTexture[]): void {
    activeTextures.push(this.interactionTrail);
  }

  override hasTexture(texture: BaseTexture): boolean {
    return texture === this.interactionTrail;
  }

  override bindForSubMesh(
    _uniformBuffer: UniformBuffer,
    scene: Scene,
    _engine: AbstractEngine,
    subMesh: SubMesh,
  ): void {
    const effect = subMesh.effect;
    if (!effect) return;
    effect.setFloat('bladeDiffuseDirectionality', this.diffuseDirectionality);
    effect.setFloat('bladeGlintSpread', this.glintSpread);
    effect.setFloat3('bladeGlintColor', this.glintColor.r, this.glintColor.g, this.glintColor.b);
    effect.setFloat('bladeGlintTipBias', this.glintTipBias);
    effect.setFloat('bladeSideLightEvenness', this.sideLightEvenness);
    effect.setFloat('bladeViewFacing', this.viewFacing);
    effect.setFloat('bladeWindSeed', this.windSeed);
    effect.setFloat2('bladeWindOffset', this.windOffsetX, this.windOffsetZ);
    effect.setFloat('bladeWindPatchSize', this.wind.noisePatchSize);
    effect.setFloat('bladeWindTiltRadians', (this.wind.tiltDegrees * Math.PI) / 180);
    effect.setFloat('bladeWindAzimuthRadians', (this.wind.azimuth * Math.PI) / 180);
    effect.setFloat('bladeWindDirectionBias', this.wind.directionBias);
    effect.setFloat('bladeWindBendExponent', this.wind.bendExponent);
    effect.setFloat2('bladeInteractionCenter', this.interactionCenterX, this.interactionCenterZ);
    effect.setFloat('bladeInteractionRadius', this.interaction.radius);
    effect.setFloat('bladeInteractionPushStrength', this.interaction.pushStrength);
    effect.setFloat('bladeInteractionSquashStrength', this.interaction.squashStrength);
    effect.setFloat('bladeInteractionMaxTiltRadians', (this.interaction.maxTiltDegrees * Math.PI) / 180);
    effect.setFloat('bladeInteractionGroundClearance', this.interaction.groundClearance);
    effect.setTexture('bladeInteractionTrail', this.interactionTrail);
    effect.setFloat('bladeInteractionWorldSize', 256);
    effect.setFloat('bladeStemMode', this.stemMode ? 1 : 0);
    effect.setFloat('bladeRootOcclusion', this.rootOcclusion);
    effect.setFloat('bladeAuthoredHeight', this.authoredHeight);
    effect.setFloat3('bladeFoldOrigin', this.foldOrigin.x, this.foldOrigin.y, this.foldOrigin.z);
    effect.setFloat3('bladeFoldAxis', this.foldAxis.x, this.foldAxis.y, this.foldAxis.z);
    effect.setFloat('bladeRootGroundBlend', this.rootGroundBlend);
    const camera = scene.activeCamera;
    if (camera) {
      const eye = camera.globalPosition;
      effect.setFloat3('bladeCameraPosition', eye.x, eye.y, eye.z);
    }
  }

  override getCustomCode(shaderType: string, shaderLanguage = ShaderLanguage.GLSL): Record<string, string> | null {
    if (shaderLanguage !== ShaderLanguage.GLSL) return null;
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: BLADE_VERTEX_DEFINITIONS,
        CUSTOM_VERTEX_UPDATE_POSITION: BLADE_VERTEX_UPDATE_POSITION,
        CUSTOM_VERTEX_UPDATE_NORMAL: BLADE_VERTEX_UPDATE_NORMAL,
        CUSTOM_VERTEX_UPDATE_WORLDPOS: BLADE_VERTEX_UPDATE_WORLDPOS,
        CUSTOM_VERTEX_MAIN_END: BLADE_VERTEX_MAIN_END,
      };
    }
    if (shaderType === 'fragment') {
      return {
        '!struct preLightingInfo': BLADE_FRAGMENT_DECLARATIONS,
        // Double-sided diffuse: light both faces, with directionality mixing
        // the response between flat (0.5) and full |N.L| (1.0).
        '!result\\.NdotLUnclamped=dot\\(N,result\\.L\\);':
          'result.NdotLUnclamped=bladeDiffuseFacing(N,result.L);',
        '!result\\.NdotL=saturateEps\\(result\\.NdotLUnclamped\\);':
          'result.NdotL=saturateEps(mix(0.5,result.NdotLUnclamped,bladeDiffuseDirectionality));',
        '!result\\.NdotL=dot\\(N,lightData\\.xyz\\)\\*0\\.5\\+0\\.5;':
          'result.NdotL=mix(0.5,bladeDiffuseFacing(N,lightData.xyz)*0.5+0.5,bladeDiffuseDirectionality);',
        // Specular: evaluate the GGX highlight against the unflattened curved
        // blade normal, floor its roughness with the glint-spread control so
        // patches fire together, and gate it to faces pointing at the sun.
        '!float NdotH=saturateEps\\(dot\\(N,info\\.H\\)\\);':
          'float NdotH=saturateEps(dot(normalize(vBladeSpecW),info.H));',
        '!float roughness=max\\(info\\.roughness,geometricRoughnessFactor\\);':
          'float roughness=max(max(info.roughness,geometricRoughnessFactor),bladeGlintSpread);',
        '!return specTerm\\*info\\.attenuation\\*info\\.NdotL\\*lightColor;':
          'return specTerm*info.attenuation*info.NdotL*lightColor*bladeGlintColor*bladeGlintGate(info.L)*vBladeGlintWeight;',
      };
    }
    return null;
  }
}
