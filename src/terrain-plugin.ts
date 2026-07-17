import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import { Material } from '@babylonjs/core/Materials/material.js';
import type { MaterialDefines } from '@babylonjs/core/Materials/materialDefines.js';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import type { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh.js';
import { TERRAIN_DEBUG_VIEWS, type TerrainDebugView, type TerrainLabConfigV25, shaderVariantKey } from './config.js';

interface TerrainLabDefines extends MaterialDefines {
  TERRAIN_LAB_ACTIVE: boolean;
  TERRAIN_LAB_BOMBING: boolean;
  TERRAIN_LAB_FBM: boolean;
  TERRAIN_LAB_WARP: boolean;
  TERRAIN_LAB_SURFACE_BLEND: boolean;
  TERRAIN_LAB_PROC_GROUND: boolean;
  TERRAIN_LAB_FBM_OCTAVES: number;
}

const EXTERNAL_UNIFORMS = [
  'labSeed',
  'labDebugView',
  'labBombingA',
  'labBombingB',
  'labFbmParams',
  'labWarpParams',
  'labBlendParams',
  'labSlot0',
  'labSlot1',
  'labSlot2',
  'labSlot3',
  'labTint0',
  'labTint1',
  'labTint2',
  'labTint3',
  'labPbrParams',
  'labGroundEmission',
];

function hexRgb(value: string): [number, number, number] {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (!match) return [1, 1, 1];
  return [
    Number.parseInt(match[1]!, 16) / 255,
    Number.parseInt(match[2]!, 16) / 255,
    Number.parseInt(match[3]!, 16) / 255,
  ];
}

/** Live, lab-only terrain composition injected into Babylon's regular PBR material. */
export class TerrainLabMaterialPlugin extends MaterialPluginBase {
  private config: TerrainLabConfigV25;
  private debugView: TerrainDebugView = 'final';
  private referenceMode = false;
  private variant = '';

  constructor(
    private material: PBRMaterial,
    private slots: [Texture, Texture, Texture, Texture],
    private sharedDetail: Texture,
    private groundTexture: Texture,
    config: TerrainLabConfigV25,
  ) {
    super(
      material,
      'TerrainLabComposer',
      176,
      {
        TERRAIN_LAB_ACTIVE: true,
        TERRAIN_LAB_BOMBING: false,
        TERRAIN_LAB_FBM: false,
        TERRAIN_LAB_WARP: false,
        TERRAIN_LAB_SURFACE_BLEND: false,
        TERRAIN_LAB_PROC_GROUND: false,
        TERRAIN_LAB_FBM_OCTAVES: 1,
      },
      true,
      true,
    );
    this.config = structuredClone(config);
    this.variant = shaderVariantKey(config);
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL;
  }
  override getClassName(): string {
    return 'TerrainLabMaterialPlugin';
  }

  update(
    config: TerrainLabConfigV25,
    slots: [Texture, Texture, Texture, Texture],
    debugView: TerrainDebugView,
    referenceMode: boolean,
  ): void {
    const nextVariant = shaderVariantKey(config, referenceMode);
    this.config = structuredClone(config);
    this.slots = slots;
    this.debugView = debugView;
    this.referenceMode = referenceMode;
    if (nextVariant !== this.variant) {
      this.variant = nextVariant;
      this.material.markAsDirty(Material.AllDirtyFlag);
    }
  }

  override prepareDefines(defines: MaterialDefines): void {
    const target = defines as TerrainLabDefines;
    target.TERRAIN_LAB_ACTIVE = !this.referenceMode;
    target.TERRAIN_LAB_BOMBING = !this.referenceMode && this.config.stages.randomization;
    target.TERRAIN_LAB_FBM = !this.referenceMode && this.config.stages.fbm;
    target.TERRAIN_LAB_WARP = !this.referenceMode && this.config.stages.warp;
    target.TERRAIN_LAB_SURFACE_BLEND = !this.referenceMode && this.config.stages.surfaceBlend;
    target.TERRAIN_LAB_PROC_GROUND = !this.referenceMode && this.config.ground.enabled;
    target.TERRAIN_LAB_FBM_OCTAVES = Math.max(1, Math.min(8, Math.round(this.config.fbm.octaves)));
  }

  override prepareDefinesBeforeAttributes(defines: MaterialDefines): void {
    const target = defines as MaterialDefines & { _needUVs: boolean; MAINUV1: boolean };
    target._needUVs = true;
    target.MAINUV1 = true;
  }

  override getSamplers(samplers: string[]): void {
    samplers.push('labSurface0', 'labSurface1', 'labSurface2', 'labSurface3', 'labDetail', 'labGround');
  }

  override getActiveTextures(activeTextures: Texture[]): void {
    activeTextures.push(...this.slots, this.sharedDetail, this.groundTexture);
  }

  override hasTexture(texture: Texture): boolean {
    return this.slots.includes(texture) || texture === this.sharedDetail || texture === this.groundTexture;
  }

  override getUniforms(): { externalUniforms?: string[] } {
    return { externalUniforms: EXTERNAL_UNIFORMS };
  }

  override bindForSubMesh(
    _uniformBuffer: UniformBuffer,
    _scene: Scene,
    _engine: AbstractEngine,
    subMesh: SubMesh,
  ): void {
    const effect = subMesh.effect;
    if (!effect || this.referenceMode) return;
    effect.setTexture('labSurface0', this.slots[0]);
    effect.setTexture('labSurface1', this.slots[1]);
    effect.setTexture('labSurface2', this.slots[2]);
    effect.setTexture('labSurface3', this.slots[3]);
    effect.setTexture('labDetail', this.sharedDetail);
    effect.setTexture('labGround', this.groundTexture);
    effect.setFloat('labSeed', this.config.seed);
    effect.setFloat('labDebugView', TERRAIN_DEBUG_VIEWS.indexOf(this.debugView));
    effect.setFloat4(
      'labBombingA',
      this.config.bombing.cells,
      this.config.bombing.scaleMin,
      this.config.bombing.scaleMax,
      this.config.bombing.offset,
    );
    effect.setFloat4(
      'labBombingB',
      this.config.bombing.rotation,
      this.config.bombing.mirror,
      this.config.bombing.cellBlend,
      0,
    );
    effect.setFloat4(
      'labFbmParams',
      this.config.fbm.scale,
      this.config.fbm.strength,
      this.config.fbm.lacunarity,
      this.config.fbm.gain,
    );
    effect.setFloat3(
      'labWarpParams',
      this.config.warp.scale,
      this.config.warp.strength,
      this.config.warp.secondaryScale,
    );
    effect.setFloat2('labBlendParams', this.config.blend.macroTint, this.config.blend.edgeBreakup);
    for (let index = 0; index < 4; index++) {
      const slot = this.config.slots[index]!;
      const tint = hexRgb(slot.tint);
      effect.setFloat4(`labSlot${index}`, slot.tiling, slot.coverage, slot.threshold, slot.softness);
      effect.setFloat3(`labTint${index}`, tint[0], tint[1], tint[2]);
    }
    effect.setFloat3('labPbrParams', this.config.pbr.baseRoughness, this.config.pbr.ao, this.config.pbr.metallic);
    effect.setFloat('labGroundEmission', this.config.ground.emission);
  }

  override getCustomCode(shaderType: string, shaderLanguage = ShaderLanguage.GLSL): Record<string, string> | null {
    if (shaderLanguage !== ShaderLanguage.GLSL || shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef TERRAIN_LAB_ACTIVE
uniform sampler2D labSurface0;uniform sampler2D labSurface1;uniform sampler2D labSurface2;uniform sampler2D labSurface3;
uniform sampler2D labDetail;uniform sampler2D labGround;
uniform float labSeed;uniform float labDebugView;
uniform vec4 labBombingA;uniform vec4 labBombingB;
uniform vec4 labFbmParams;uniform vec3 labWarpParams;uniform vec2 labBlendParams;
uniform vec4 labSlot0;uniform vec4 labSlot1;uniform vec4 labSlot2;uniform vec4 labSlot3;
uniform vec3 labTint0;uniform vec3 labTint1;uniform vec3 labTint2;uniform vec3 labTint3;uniform vec3 labPbrParams;
uniform float labGroundEmission;
vec3 labDebugOutput=vec3(0.0);float labDebugOverride=0.0;vec3 labGroundAlbedo=vec3(0.0);

vec2 labHash22(vec2 p,float salt){
  p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));
  return fract(sin(p+salt+labSeed*0.017)*43758.5453123);
}
float labValueNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  float a=labHash22(i,17.0).x,b=labHash22(i+vec2(1.0,0.0),17.0).x;
  float c=labHash22(i+vec2(0.0,1.0),17.0).x,d=labHash22(i+vec2(1.0),17.0).x;
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
float labFbmNoise(vec2 p){
  float sum=0.0,amplitude=0.5,normalizer=0.0;
  sum+=labValueNoise(p)*amplitude;normalizer+=amplitude;p*=labFbmParams.z;amplitude*=labFbmParams.w;
#if TERRAIN_LAB_FBM_OCTAVES > 1
  sum+=labValueNoise(p)*amplitude;normalizer+=amplitude;p*=labFbmParams.z;amplitude*=labFbmParams.w;
#endif
#if TERRAIN_LAB_FBM_OCTAVES > 2
  sum+=labValueNoise(p)*amplitude;normalizer+=amplitude;p*=labFbmParams.z;amplitude*=labFbmParams.w;
#endif
#if TERRAIN_LAB_FBM_OCTAVES > 3
  sum+=labValueNoise(p)*amplitude;normalizer+=amplitude;p*=labFbmParams.z;amplitude*=labFbmParams.w;
#endif
#if TERRAIN_LAB_FBM_OCTAVES > 4
  sum+=labValueNoise(p)*amplitude;normalizer+=amplitude;p*=labFbmParams.z;amplitude*=labFbmParams.w;
#endif
#if TERRAIN_LAB_FBM_OCTAVES > 5
  sum+=labValueNoise(p)*amplitude;normalizer+=amplitude;p*=labFbmParams.z;amplitude*=labFbmParams.w;
#endif
#if TERRAIN_LAB_FBM_OCTAVES > 6
  sum+=labValueNoise(p)*amplitude;normalizer+=amplitude;p*=labFbmParams.z;amplitude*=labFbmParams.w;
#endif
#if TERRAIN_LAB_FBM_OCTAVES > 7
  sum+=labValueNoise(p)*amplitude;normalizer+=amplitude;
#endif
  return sum/max(normalizer,0.0001);
}
vec3 labBombCell(sampler2D source,vec2 baseUv,vec2 cell,float salt){
  vec2 random=labHash22(cell,salt);float scale=mix(labBombingA.y,labBombingA.z,random.x);
  vec2 uv=baseUv*scale+(random-0.5)*labBombingA.w;
  if(labBombingB.y>0.5&&random.y>0.5)uv.x=-uv.x;
  if(labBombingB.x>0.5){
    float quadrant=floor(random.y*4.0);vec2 centered=fract(uv)-0.5;
    if(quadrant==1.0)centered=vec2(-centered.y,centered.x);
    else if(quadrant==2.0)centered=-centered;
    else if(quadrant==3.0)centered=vec2(centered.y,-centered.x);
    uv=floor(uv)+centered+0.5;
  }
  return pow(max(texture2D(source,uv).rgb,vec3(0.0)),vec3(2.2));
}
vec3 labSample(sampler2D source,vec2 uv,float tiling,float salt){
  vec2 tiled=uv*tiling;
#ifdef TERRAIN_LAB_BOMBING
  vec2 grid=uv*labBombingA.x,cell=floor(grid),f=fract(grid);f=f*f*(3.0-2.0*f);
  vec3 a=mix(labBombCell(source,tiled,cell,salt),labBombCell(source,tiled,cell+vec2(1.0,0.0),salt),f.x);
  vec3 b=mix(labBombCell(source,tiled,cell+vec2(0.0,1.0),salt),labBombCell(source,tiled,cell+vec2(1.0),salt),f.x);
  vec3 base=pow(max(texture2D(source,tiled).rgb,vec3(0.0)),vec3(2.2));
  return mix(base,mix(a,b,f.y),labBombingB.z);
#else
  return pow(max(texture2D(source,tiled).rgb,vec3(0.0)),vec3(2.2));
#endif
}
#endif`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
#ifdef TERRAIN_LAB_ACTIVE
vec2 labUv=vAlbedoUV;float procedural=0.5;float secondary=0.5;
#ifdef TERRAIN_LAB_FBM
procedural=labFbmNoise(labUv*labFbmParams.x);
secondary=labFbmNoise(labUv*labFbmParams.x*1.73+vec2(23.4,9.1));
#endif
#ifdef TERRAIN_LAB_WARP
vec2 warpVector=vec2(labValueNoise(labUv*labWarpParams.x),labValueNoise(labUv*labWarpParams.x*labWarpParams.z+19.7))-0.5;
labUv+=warpVector*labWarpParams.y;
#endif
vec3 slot0=labSample(labSurface0,labUv,labSlot0.x,11.0)*labTint0;
vec3 slot1=labSample(labSurface1,labUv,labSlot1.x,31.0)*labTint1;
vec3 slot2=labSample(labSurface2,labUv,labSlot2.x,53.0)*labTint2;
vec3 slot3=labSample(labSurface3,labUv,labSlot3.x,79.0)*labTint3;
vec4 weights=vec4(1.0,0.0,0.0,0.0);
#ifdef TERRAIN_LAB_SURFACE_BLEND
float edge=(labValueNoise(labUv*labFbmParams.x*3.1+41.0)-0.5)*labBlendParams.y;
weights.y=smoothstep(labSlot1.z-labSlot1.w,labSlot1.z+labSlot1.w,procedural+edge)*labSlot1.y;
weights.z=smoothstep(labSlot2.z-labSlot2.w,labSlot2.z+labSlot2.w,secondary-edge)*labSlot2.y;
weights.w=smoothstep(labSlot3.z-labSlot3.w,labSlot3.z+labSlot3.w,(procedural+secondary)*0.5+edge)*labSlot3.y;
weights.x=max(0.04,1.0-max(max(weights.y,weights.z),weights.w));weights/=max(dot(weights,vec4(1.0)),0.0001);
#endif
vec3 composed=slot0*weights.x+slot1*weights.y+slot2*weights.z+slot3*weights.w;
#ifdef TERRAIN_LAB_PROC_GROUND
// CPU-generated procedural ground replaces the image-slot composition. The
// texture is sampled after the warp offset so Domain warp still applies, and
// FBM variation plus the detail/PBR stages continue to layer on top.
composed=pow(max(texture2D(labGround,labUv).rgb,vec3(0.0)),vec3(2.2));
#endif
float variation=1.0;
#ifdef TERRAIN_LAB_FBM
variation+=(procedural-0.5)*labFbmParams.y;
#endif
composed*=mix(1.0,variation,labBlendParams.x+0.45);
surfaceAlbedo=clamp(composed,0.0,1.0);
labGroundAlbedo=surfaceAlbedo;
if(labDebugView==1.0){labDebugOutput=surfaceAlbedo;labDebugOverride=1.0;}
else if(labDebugView==2.0){labDebugOutput=vec3(procedural);labDebugOverride=1.0;}
else if(labDebugView==3.0){labDebugOutput=vec3(fract(labUv),0.0);labDebugOverride=1.0;}
else if(labDebugView>=4.0&&labDebugView<=7.0){
  float index=labDebugView-4.0;labDebugOutput=vec3(index==0.0?weights.x:index==1.0?weights.y:index==2.0?weights.z:weights.w);labDebugOverride=1.0;
}else if(labDebugView==8.0){labDebugOutput=texture2D(labDetail,labUv*32.0).rgb;labDebugOverride=1.0;}
else if(labDebugView==9.0){labDebugOutput=normalW*0.5+0.5;labDebugOverride=1.0;}
else if(labDebugView==10.0){labDebugOutput=vec3(labPbrParams.x);labDebugOverride=1.0;}
else if(labDebugView==11.0){labDebugOutput=vec3(labPbrParams.y);labDebugOverride=1.0;}
#endif`,
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#ifdef TERRAIN_LAB_ACTIVE
finalColor.rgb+=labGroundAlbedo*labGroundEmission;
if(labDebugOverride>0.5)finalColor=vec4(labDebugOutput,1.0);
#endif`,
    };
  }
}
