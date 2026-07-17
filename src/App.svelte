<script lang="ts">
import { onMount } from 'svelte';
import {
  applyGuidedStage,
  CONTROL_SCHEMA,
  createDefaultTerrainConfig,
  GUIDED_STAGES,
  getNumericValue,
  type NumericControl,
  setNumericValue,
  TERRAIN_DEBUG_VIEWS,
  type TerrainDebugView,
  type TerrainLabConfigV25,
  type TerrainStageKey,
} from './config.js';
import {
  CAMERA_PRESETS,
  type CameraPreset,
  type TerrainLabDiagnostics,
  type TerrainLabProfileSuite,
  type TerrainLabStutterSoak,
  TerrainLabScene,
} from './scene.js';

const controlGroups = [...new Set(CONTROL_SCHEMA.map((control) => control.group))];
const legacyControlGroups = new Set([
  'Randomization',
  'Procedural FBM',
  'Domain warp',
  'Surface blend',
  'Detail / PBR',
  'Grass placement',
]);
const visibleControlGroups = controlGroups.filter((group) => !legacyControlGroups.has(group));
const visibleStageKeys: readonly TerrainStageKey[] = ['bladeCover', 'flowerCover', 'leafCover'];
const visibleGuidedStages = GUIDED_STAGES
  .filter((stage) => stage.key !== 'base' && visibleStageKeys.includes(stage.key))
  .map((stage) => ({ ...stage, label: stage.label.replace(/^\d+\s+/, '') }));
const emptyDiagnostics: TerrainLabDiagnostics = {
  fps: 0,
  frameMs: 0,
  frameP95Ms: 0,
  frameP99Ms: 0,
  frameMaxMs: 0,
  framesOver25Ms: 0,
  framesOver33Ms: 0,
  gpuFrameMs: 0,
  drawCalls: 0,
  activeMeshes: 0,
  textures: 0,
  shaderVariant: 'loading',
  textureSamples: 0,
  groundCoverInstances: 0,
  bladeCoverInstances: 0,
  flowerCoverInstances: 0,
  leafCoverInstances: 0,
  shaderCompileMs: 0,
  ready: false,
};

let canvas: HTMLCanvasElement;
let renderer: TerrainLabScene | null = null;
let config = createDefaultTerrainConfig();
let debugView: TerrainDebugView = 'final';
let guidedStage: TerrainStageKey | 'base' | null = null;
let referenceMode = false;
let photoOpMode = false;
let autoFlyby = false;
let captureLabel = 'Capture PNG';
let diagnostics = emptyDiagnostics;
let errorMessage = '';
let copyLabel = 'Copy JSON';
let copiedSection: string | null = null;
let profileStatus: 'idle' | 'running' | 'complete' | 'failed' = 'idle';
let profileResult: TerrainLabProfileSuite | null = null;
let soakStatus: 'idle' | 'running' | 'complete' | 'failed' = 'idle';
let soakResult: TerrainLabStutterSoak | null = null;
let soakCopyLabel = 'Copy soak JSON';
$: configJson = JSON.stringify(config, null, 2);

onMount(() => {
  try {
    renderer = new TerrainLabScene(canvas, config, (message) => (errorMessage = message));
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }
  let idlePending = false;
  let idleId: number | null = null;
  let idleUsesCallback = false;
  const refreshDiagnostics = (): void => {
    if (idlePending || profileStatus === 'running' || captureLabel === 'Capturing…') return;
    idlePending = true;
    const update = (): void => {
      idlePending = false;
      idleId = null;
      if (renderer) diagnostics = renderer.getDiagnostics();
    };
    if (typeof window.requestIdleCallback === 'function') {
      idleUsesCallback = true;
      idleId = window.requestIdleCallback(update, { timeout: 500 });
    } else {
      idleUsesCallback = false;
      idleId = window.setTimeout(update, 0);
    }
  };
  refreshDiagnostics();
  const interval = window.setInterval(refreshDiagnostics, 1000);
  return () => {
    window.clearInterval(interval);
    if (idleId !== null) {
      if (idleUsesCallback) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    }
    renderer?.dispose();
    renderer = null;
  };
});

function apply(next: TerrainLabConfigV25, keepReference = false): void {
  config = next;
  if (!keepReference) referenceMode = false;
  renderer?.apply(config, debugView, referenceMode);
}

function chooseGuidedStage(stage: TerrainStageKey | 'base'): void {
  guidedStage = stage;
  apply(applyGuidedStage(config, stage));
}

function toggleStage(stage: TerrainStageKey): void {
  const next = structuredClone(config);
  next.stages[stage] = !next.stages[stage];
  guidedStage = null;
  apply(next);
}

function changeNumber(control: NumericControl, event: Event): void {
  const value = Number((event.currentTarget as HTMLInputElement).value);
  apply(setNumericValue(config, control, value));
}

function setBladeColor(key: 'rootColor' | 'tipColor' | 'tintNoiseColor' | 'glintColor', event: Event): void {
  const next = structuredClone(config);
  next.blades[key] = (event.currentTarget as HTMLInputElement).value;
  apply(next);
}

function setFlowerColor(key: 'petalColor' | 'bluePetalColor' | 'yellowPetalColor' | 'centerColor', event: Event): void {
  const next = structuredClone(config);
  next.flowers[key] = (event.currentTarget as HTMLInputElement).value;
  apply(next);
}

function setLeafColor(key: 'edgeColor' | 'bodyColor' | 'centerColor', event: Event): void {
  const next = structuredClone(config);
  next.leaves[key] = (event.currentTarget as HTMLInputElement).value;
  apply(next);
}

function setLightingColor(key: 'sunColor' | 'ambientColor', event: Event): void {
  const next = structuredClone(config);
  next.lighting[key] = (event.currentTarget as HTMLInputElement).value;
  apply(next);
}

function setGroundColor(key: 'baseColor' | 'highlightColor' | 'accentColor', event: Event): void {
  const next = structuredClone(config);
  next.ground[key] = (event.currentTarget as HTMLInputElement).value;
  apply(next);
}

function toggleProceduralGround(): void {
  const next = structuredClone(config);
  next.ground.enabled = !next.ground.enabled;
  apply(next);
}

function chooseDebugView(event: Event): void {
  debugView = (event.currentTarget as HTMLSelectElement).value as TerrainDebugView;
  referenceMode = false;
  renderer?.apply(config, debugView, false);
}

function showProductionReference(): void {
  referenceMode = true;
  debugView = 'final';
  renderer?.apply(config, debugView, true);
}

function resetAll(): void {
  if (autoFlyby) renderer?.setAutoFlyby(false);
  autoFlyby = false;
  debugView = 'final';
  guidedStage = null;
  apply(createDefaultTerrainConfig());
}

function togglePhotoOp(): void {
  if (!photoOpMode && autoFlyby) {
    renderer?.setAutoFlyby(false);
    autoFlyby = false;
  }
  photoOpMode = !photoOpMode;
  renderer?.setPhotoOpMode(photoOpMode);
}

function chooseCameraPreset(preset: CameraPreset): void {
  autoFlyby = false;
  photoOpMode = false;
  renderer?.setCameraPreset(preset);
}

function toggleAutoFlyby(): void {
  autoFlyby = !autoFlyby;
  if (autoFlyby) photoOpMode = false;
  renderer?.setAutoFlyby(autoFlyby);
}

async function capturePhotoOp(): Promise<void> {
  if (!renderer) return;
  if (autoFlyby) {
    renderer.setAutoFlyby(false);
    autoFlyby = false;
  }
  photoOpMode = true;
  captureLabel = 'Capturing…';
  try {
    await renderer.capturePhotoOp();
    captureLabel = 'Saved';
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    captureLabel = 'Capture failed';
  }
  window.setTimeout(() => (captureLabel = 'Capture PNG'), 1200);
}

async function runProfiler(): Promise<void> {
  if (!renderer || profileStatus === 'running' || soakStatus === 'running') return;
  profileStatus = 'running';
  profileResult = null;
  try {
    profileResult = await renderer.runProfileSuite();
    profileStatus = 'complete';
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    profileStatus = 'failed';
  }
}

async function runOrCancelStutterSoak(): Promise<void> {
  if (!renderer) return;
  if (soakStatus === 'running') {
    renderer.cancelStutterSoak();
    return;
  }
  if (profileStatus === 'running') return;
  const previousAutoFlyby = autoFlyby;
  soakStatus = 'running';
  soakResult = null;
  autoFlyby = true;
  try {
    soakResult = await renderer.runStutterSoak();
    soakStatus = 'complete';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Stutter soak cancelled') soakStatus = 'idle';
    else {
      errorMessage = message;
      soakStatus = 'failed';
    }
  } finally {
    autoFlyby = previousAutoFlyby;
  }
}

async function copySoakJson(): Promise<void> {
  if (!soakResult) return;
  await navigator.clipboard.writeText(JSON.stringify(soakResult, null, 2));
  soakCopyLabel = 'Copied';
  window.setTimeout(() => (soakCopyLabel = 'Copy soak JSON'), 1200);
}

function lightingPreset(name: 'neutral' | 'production' | 'overcast' | 'grazing'): void {
  const next = structuredClone(config);
  const presets = {
    neutral: {
      ambient: 0.55,
      skylight: 0.75,
      sun: 2.8,
      sunAzimuth: 135,
      sunElevation: 48,
      exposure: 1.15,
      contrast: 1.05,
    },
    production: {
      ambient: 0.41,
      skylight: 0.53,
      sun: 2.21,
      sunAzimuth: 134,
      sunElevation: 63,
      exposure: 2,
      contrast: 1.58,
    },
    overcast: {
      ambient: 0.8,
      skylight: 1.15,
      sun: 0.65,
      sunAzimuth: 120,
      sunElevation: 62,
      exposure: 1.15,
      contrast: 0.88,
    },
    grazing: {
      ambient: 0.22,
      skylight: 0.42,
      sun: 5.5,
      sunAzimuth: 215,
      sunElevation: 14,
      exposure: 1.25,
      contrast: 1.25,
    },
  } as const;
  next.lighting = { ...next.lighting, ...presets[name] };
  apply(next);
}

async function copyJson(): Promise<void> {
  await navigator.clipboard.writeText(configJson);
  copyLabel = 'Copied';
  window.setTimeout(() => (copyLabel = 'Copy JSON'), 1200);
}

function selectConfigPaths(paths: readonly string[]): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  for (const path of paths) {
    const parts = path.split('.');
    let source: unknown = config;
    for (const part of parts) source = (source as Record<string, unknown>)[part];
    let target = selected;
    for (const part of parts.slice(0, -1)) {
      if (!target[part]) target[part] = {};
      target = target[part] as Record<string, unknown>;
    }
    target[parts.at(-1)!] = structuredClone(source);
  }
  return selected;
}

function controlGroupConfig(group: string, extraPaths: readonly string[] = []): Record<string, unknown> {
  return selectConfigPaths([
    ...CONTROL_SCHEMA.filter((control) => control.group === group).map((control) => control.path),
    ...extraPaths,
  ]);
}

async function copySectionJson(section: string, value: unknown): Promise<void> {
  await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
  copiedSection = section;
  window.setTimeout(() => {
    if (copiedSection === section) copiedSection = null;
  }, 1200);
}
</script>

<main class="terrain-lab" data-ready={diagnostics.ready} data-shader-variant={diagnostics.shaderVariant} data-reference={referenceMode} data-photo-op={photoOpMode} data-auto-flyby={autoFlyby} data-cover-instances={diagnostics.groundCoverInstances} data-blade-instances={diagnostics.bladeCoverInstances} data-flower-instances={diagnostics.flowerCoverInstances} data-leaf-instances={diagnostics.leafCoverInstances} data-profile-status={profileStatus} data-soak-status={soakStatus}>
  <header class="lab-header">
    <div>
      <p class="eyebrow">Independent rendering experiment</p>
      <h1>Terrain Laboratory</h1>
    </div>
    <div class="header-actions">
      <button class:active={referenceMode} on:click={showProductionReference}>Baked production reference</button>
      <button class:active={photoOpMode} aria-pressed={photoOpMode} disabled={soakStatus === 'running'} on:click={togglePhotoOp}>Photo Op</button>
      <button class="primary" disabled={soakStatus === 'running'} on:click={capturePhotoOp}>{captureLabel}</button>
      <button disabled={soakStatus === 'running'} on:click={resetAll}>Reset all</button>
      <button on:click={copyJson}>{copyLabel}</button>
    </div>
  </header>

  <nav class="stage-strip" aria-label="Guided terrain stages">
    {#each visibleGuidedStages as stage}
      <button class:active={guidedStage === stage.key && !referenceMode} title={stage.description} on:click={() => chooseGuidedStage(stage.key)}>
        <span>{stage.label}</span><small>{stage.description}</small>
      </button>
    {/each}
  </nav>

  {#if errorMessage}
    <div class="error-banner" role="alert">{errorMessage}</div>
  {/if}

  <div class="workspace">
    <section class="viewport" aria-label="Terrain preview">
      <canvas bind:this={canvas} aria-label="Rendered terrain preview"></canvas>
      <div class="viewport-toolbar">
        <div class="camera-presets" aria-label="Camera presets">
          {#each CAMERA_PRESETS as preset}
            <button disabled={soakStatus === 'running'} on:click={() => chooseCameraPreset(preset)}>{preset}</button>
          {/each}
          <button class:active={autoFlyby} aria-pressed={autoFlyby} disabled={soakStatus === 'running'} on:click={toggleAutoFlyby}>Auto flyby</button>
        </div>
        <label>Debug view
          <select value={debugView} on:change={chooseDebugView}>
            {#each TERRAIN_DEBUG_VIEWS as view}<option value={view}>{view}</option>{/each}
          </select>
        </label>
      </div>
      <aside class="diagnostics" aria-label="Rendering diagnostics">
        <strong>{diagnostics.ready ? 'Ready' : 'Compiling'}</strong>
        <dl>
          <div><dt>FPS</dt><dd>{diagnostics.fps.toFixed(0)}</dd></div>
          <div><dt>Frame</dt><dd>{diagnostics.frameMs.toFixed(2)} ms</dd></div>
          <div><dt>p95</dt><dd>{diagnostics.frameP95Ms.toFixed(2)} ms</dd></div>
          <div><dt>p99</dt><dd>{diagnostics.frameP99Ms.toFixed(2)} ms</dd></div>
          <div><dt>Max</dt><dd>{diagnostics.frameMaxMs.toFixed(2)} ms</dd></div>
          <div><dt>≥25 ms</dt><dd>{diagnostics.framesOver25Ms}</dd></div>
          <div><dt>≥33 ms</dt><dd>{diagnostics.framesOver33Ms}</dd></div>
          <div><dt>GPU</dt><dd>{diagnostics.gpuFrameMs.toFixed(2)} ms</dd></div>
          <div><dt>Draw calls</dt><dd>{diagnostics.drawCalls}</dd></div>
          <div><dt>Active meshes</dt><dd>{diagnostics.activeMeshes}</dd></div>
          <div><dt>Textures</dt><dd>{diagnostics.textures}</dd></div>
          <div><dt>Est. samples</dt><dd>{diagnostics.textureSamples}</dd></div>
          <div><dt>Cover</dt><dd>{diagnostics.groundCoverInstances}</dd></div>
          <div><dt>Blades</dt><dd>{diagnostics.bladeCoverInstances}</dd></div>
          <div><dt>Flowers</dt><dd>{diagnostics.flowerCoverInstances}</dd></div>
          <div><dt>Leaves</dt><dd>{diagnostics.leafCoverInstances}</dd></div>
          <div><dt>Compile</dt><dd>{diagnostics.shaderCompileMs.toFixed(2)} ms</dd></div>
        </dl>
        <code>{diagnostics.shaderVariant}</code>
        <button class="profile-button" disabled={profileStatus === 'running' || soakStatus === 'running'} on:click={runProfiler}>
          {profileStatus === 'running' ? 'Profiling…' : 'Run profiler'}
        </button>
        {#if profileResult}
          <p class:target-hit={profileResult.target60} class="profile-target">
            p95 {profileResult.scenarios[0]!.frameP95Ms.toFixed(2)} ms · {profileResult.target60 ? 'no missed 60 Hz refreshes' : profileResult.gpuHeadroom60 ? 'GPU fits 60; refresh misses detected' : 'GPU below 60'}
          </p>
          <pre class="profile-results">{JSON.stringify(profileResult, null, 2)}</pre>
        {/if}
        <button class="profile-button" disabled={profileStatus === 'running'} on:click={runOrCancelStutterSoak}>
          {soakStatus === 'running' ? 'Stop stutter soak' : 'Run stutter soak (10 min)'}
        </button>
        {#if soakResult}
          <p class:target-hit={soakResult.target60} class="profile-target">
            {soakResult.target60 ? '60 Hz soak passed' : 'Refresh misses detected'} · max {soakResult.frameMaxMs.toFixed(2)} ms
          </p>
          <button class="profile-button" on:click={copySoakJson}>{soakCopyLabel}</button>
          <pre class="profile-results soak-results">{JSON.stringify(soakResult, null, 2)}</pre>
        {/if}
      </aside>
      <p class="viewport-help">{photoOpMode ? 'Photo Op · Ground clipped to active grass · 1600 × 900 PNG' : 'Arrow keys move sphere · Middle-drag camera · Wheel to zoom · 256 × 256 units'}</p>
    </section>

    <aside class="inspector" aria-label="Terrain editor">
      <details open>
        <summary>
          Foliage layers
          <button class="section-copy" aria-label="Copy Foliage layers JSON" on:click|preventDefault|stopPropagation={() => copySectionJson('stages', selectConfigPaths(visibleStageKeys.map((stage) => `stages.${stage}`)))}>{copiedSection === 'stages' ? 'Copied' : 'Copy JSON'}</button>
        </summary>
        <div class="toggle-grid">
          {#each visibleStageKeys as stage}
            <button class:active={config.stages[stage]} aria-pressed={config.stages[stage]} on:click={() => toggleStage(stage)}>{stage}</button>
          {/each}
        </div>
      </details>

      <details open class="blade-tuning">
        <summary>
          Blade cover
          <button class="section-copy" aria-label="Copy Blade cover JSON" on:click|preventDefault|stopPropagation={() => copySectionJson('blades', controlGroupConfig('Blade cover', ['blades.rootColor', 'blades.tipColor']))}>{copiedSection === 'blades' ? 'Copied' : 'Copy JSON'}</button>
        </summary>
        <p class="note">One thin-instanced, double-sided two-triangle blade. Its tall fourth vertex folds around the diagonal crease.</p>
        <div class="slot-controls blade-colors">
          <label>Root color <input aria-label="Blade root color" type="color" value={config.blades.rootColor} on:input={(event) => setBladeColor('rootColor', event)} /></label>
          <label>Tip color <input aria-label="Blade tip color" type="color" value={config.blades.tipColor} on:input={(event) => setBladeColor('tipColor', event)} /></label>
          <label>Glint color <input aria-label="Blade glint color" type="color" value={config.blades.glintColor} on:input={(event) => setBladeColor('glintColor', event)} /></label>
        </div>
        <div class="control-list">
          {#each CONTROL_SCHEMA.filter((control) => control.group === 'Blade cover') as control}
            <label class="number-control">
              <span>{control.label}</span>
              <input aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={getNumericValue(config, control.path)} on:input={(event) => changeNumber(control, event)} />
              <input aria-label={control.label} type="number" min={control.min} max={control.max} step={control.step} value={getNumericValue(config, control.path)} on:change={(event) => changeNumber(control, event)} />
            </label>
          {/each}
        </div>
      </details>

      <details open class="blade-patch-tuning">
        <summary>
          Blade patches
          <button class="section-copy" aria-label="Copy Blade patches JSON" on:click|preventDefault|stopPropagation={() => copySectionJson('blade-patches', controlGroupConfig('Blade patches', ['blades.tintNoiseColor']))}>{copiedSection === 'blade-patches' ? 'Copied' : 'Copy JSON'}</button>
        </summary>
        <p class="note">Granular cellular RGB patches create distinct tilt-direction clumps with adjustable boundary softness, while broad noise adds green tint and correlated height/density growth. Per-blade tilt and direction jitter keep each clump organic. Blade count is the maximum candidate count.</p>
        <div class="slot-controls blade-colors">
          <label>Patch tint <input aria-label="Blade patch tint" type="color" value={config.blades.tintNoiseColor} on:input={(event) => setBladeColor('tintNoiseColor', event)} /></label>
        </div>
        <div class="control-list">
          {#each CONTROL_SCHEMA.filter((control) => control.group === 'Blade patches') as control}
            <label class="number-control">
              <span>{control.label}</span>
              <input aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={getNumericValue(config, control.path)} on:input={(event) => changeNumber(control, event)} />
              <input aria-label={control.label} type="number" min={control.min} max={control.max} step={control.step} value={getNumericValue(config, control.path)} on:change={(event) => changeNumber(control, event)} />
            </label>
          {/each}
        </div>
      </details>

      <details open class="flower-tuning">
        <summary>
          Flower cover
          <button class="section-copy" aria-label="Copy Flower cover JSON" on:click|preventDefault|stopPropagation={() => copySectionJson('flowers', controlGroupConfig('Flower cover', ['flowers.petalColor', 'flowers.bluePetalColor', 'flowers.yellowPetalColor', 'flowers.centerColor']))}>{copiedSection === 'flowers' ? 'Copied' : 'Copy JSON'}</button>
        </summary>
        <p class="note">Tight clumps of tiny, stemless white octagonal flower heads. Authored normals make the outer disc read as a faceted cone and the raised brown center read as a bump.</p>
        <div class="slot-controls blade-colors">
          <label>Petal color <input aria-label="Flower petal color" type="color" value={config.flowers.petalColor} on:input={(event) => setFlowerColor('petalColor', event)} /></label>
          <label>Blue variant <input aria-label="Flower blue petal color" type="color" value={config.flowers.bluePetalColor} on:input={(event) => setFlowerColor('bluePetalColor', event)} /></label>
          <label>Yellow variant <input aria-label="Flower yellow petal color" type="color" value={config.flowers.yellowPetalColor} on:input={(event) => setFlowerColor('yellowPetalColor', event)} /></label>
          <label>Center color <input aria-label="Flower center color" type="color" value={config.flowers.centerColor} on:input={(event) => setFlowerColor('centerColor', event)} /></label>
        </div>
        <div class="control-list">
          {#each CONTROL_SCHEMA.filter((control) => control.group === 'Flower cover') as control}
            <label class="number-control">
              <span>{control.label}</span>
              <input aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={getNumericValue(config, control.path)} on:input={(event) => changeNumber(control, event)} />
              <input aria-label={control.label} type="number" min={control.min} max={control.max} step={control.step} value={getNumericValue(config, control.path)} on:change={(event) => changeNumber(control, event)} />
            </label>
          {/each}
        </div>
      </details>

      <details open class="broadleaf-tuning">
        <summary>
          Broadleaf cover
          <button class="section-copy" aria-label="Copy Broadleaf cover JSON" on:click|preventDefault|stopPropagation={() => copySectionJson('leaves', controlGroupConfig('Broadleaf cover', ['leaves.edgeColor', 'leaves.bodyColor', 'leaves.centerColor']))}>{copiedSection === 'leaves' ? 'Copied' : 'Copy JSON'}</button>
        </summary>
        <p class="note">Procedural 16-vertex leaves form spaced rosette plants only in short-grass patches. The duplicated centerline creates a lit seam; the oval gradient is generated in memory and is never saved as an image.</p>
        <div class="slot-controls blade-colors">
          <label>Edge color <input aria-label="Broadleaf edge color" type="color" value={config.leaves.edgeColor} on:input={(event) => setLeafColor('edgeColor', event)} /></label>
          <label>Body color <input aria-label="Broadleaf body color" type="color" value={config.leaves.bodyColor} on:input={(event) => setLeafColor('bodyColor', event)} /></label>
          <label>Center color <input aria-label="Broadleaf center color" type="color" value={config.leaves.centerColor} on:input={(event) => setLeafColor('centerColor', event)} /></label>
        </div>
        <div class="control-list">
          {#each CONTROL_SCHEMA.filter((control) => control.group === 'Broadleaf cover') as control}
            <label class="number-control">
              <span>{control.label}</span>
              <input aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={getNumericValue(config, control.path)} on:input={(event) => changeNumber(control, event)} />
              <input aria-label={control.label} type="number" min={control.min} max={control.max} step={control.step} value={getNumericValue(config, control.path)} on:change={(event) => changeNumber(control, event)} />
            </label>
          {/each}
        </div>
      </details>

      <details>
        <summary>
          Lighting presets
          <button class="section-copy" aria-label="Copy Lighting presets JSON" on:click|preventDefault|stopPropagation={() => copySectionJson('lighting-presets', { lighting: config.lighting })}>{copiedSection === 'lighting-presets' ? 'Copied' : 'Copy JSON'}</button>
        </summary>
        <div class="preset-row">
          <button on:click={() => lightingPreset('neutral')}>Neutral</button>
          <button on:click={() => lightingPreset('production')}>Production</button>
          <button on:click={() => lightingPreset('overcast')}>Overcast</button>
          <button on:click={() => lightingPreset('grazing')}>Grazing</button>
        </div>
      </details>

      {#each visibleControlGroups.filter((group) => group !== 'Blade cover' && group !== 'Blade patches' && group !== 'Flower cover' && group !== 'Broadleaf cover') as group}
        <details open={group === 'Blade wind' || group === 'Blade interaction' || group === 'Procedural ground'}>
          <summary>
            {group}
            <button class="section-copy" aria-label={`Copy ${group} JSON`} on:click|preventDefault|stopPropagation={() => copySectionJson(`group:${group}`, controlGroupConfig(group, group === 'Lighting' ? ['lighting.sunColor', 'lighting.ambientColor'] : []))}>{copiedSection === `group:${group}` ? 'Copied' : 'Copy JSON'}</button>
          </summary>
          {#if group === 'Blade wind'}
            <p class="note">Procedural RGB wind: RG encodes local tilt direction, B encodes magnitude, the exponent shapes that magnitude, and the field travels along the configured azimuth.</p>
          {/if}
          {#if group === 'Blade interaction'}
            <p class="note">Use the arrow keys to move the white sphere relative to the camera: Up rolls away from the camera. Middle-click and drag anywhere to rotate the camera. The persistent GPU trail stores the sphere's travel direction in RG and crush influence in B; maximum tilt and ground clearance keep foliage above the surface.</p>
            <div class="preset-row">
              <button aria-label="Reset crushed grass" on:click={() => renderer?.resetInteractionTrail()}>Reset crushed grass</button>
            </div>
          {/if}
          {#if group === 'Lighting'}
            <div class="slot-controls blade-colors">
              <label>Sun color <input aria-label="Sun color" type="color" value={config.lighting.sunColor} on:input={(event) => setLightingColor('sunColor', event)} /></label>
              <label>Ambient color <input aria-label="Ambient color" type="color" value={config.lighting.ambientColor} on:input={(event) => setLightingColor('ambientColor', event)} /></label>
            </div>
          {/if}
          {#if group === 'Procedural ground'}
            <p class="note">CPU-generated Perlin ground color; the same sampler tints blades via Ground blend so grass patches align with the ground.</p>
            <div class="toggle-grid">
              <button class:active={config.ground.enabled} aria-pressed={config.ground.enabled} on:click={toggleProceduralGround}>proceduralGround</button>
            </div>
            <div class="slot-controls blade-colors">
              <label>Base color <input aria-label="Ground base color" type="color" value={config.ground.baseColor} on:input={(event) => setGroundColor('baseColor', event)} /></label>
              <label>Highlight <input aria-label="Ground highlight color" type="color" value={config.ground.highlightColor} on:input={(event) => setGroundColor('highlightColor', event)} /></label>
              <label>Accent <input aria-label="Ground accent color" type="color" value={config.ground.accentColor} on:input={(event) => setGroundColor('accentColor', event)} /></label>
            </div>
          {/if}
          <div class="control-list">
            {#each CONTROL_SCHEMA.filter((control) => control.group === group) as control}
              <label class="number-control">
                <span>{control.label}</span>
                <input aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={getNumericValue(config, control.path)} on:input={(event) => changeNumber(control, event)} />
                <input aria-label={control.label} type="number" min={control.min} max={control.max} step={control.step} value={getNumericValue(config, control.path)} on:change={(event) => changeNumber(control, event)} />
              </label>
            {/each}
          </div>
        </details>
      {/each}

      <details>
        <summary>
          Configuration JSON
          <button class="section-copy" aria-label="Copy Configuration JSON" on:click|preventDefault|stopPropagation={() => copySectionJson('configuration', config)}>{copiedSection === 'configuration' ? 'Copied' : 'Copy JSON'}</button>
        </summary>
        <p class="note">Versioned terrain settings only. Camera and inspector state are intentionally excluded.</p>
        <pre>{configJson}</pre>
      </details>
    </aside>
  </div>
</main>
