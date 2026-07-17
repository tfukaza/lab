import { expect, test } from '@playwright/test';

test('terrain laboratory composes, inspects, and exports terrain independently', async ({ context, page }, testInfo) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Terrain Laboratory' })).toBeVisible();
  await expect(page.locator('.terrain-lab')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  await expect(page.locator('.terrain-lab')).toHaveAttribute('data-profile-status', 'idle');
  await expect(page.locator('.terrain-lab')).toHaveAttribute('data-soak-status', 'idle');
  await expect(page.locator('.terrain-lab')).toHaveAttribute('data-auto-flyby', 'false');
  await expect(page.locator('.terrain-lab')).toHaveAttribute('data-flower-instances', '280');
  await expect
    .poll(async () => Number(await page.locator('.terrain-lab').getAttribute('data-leaf-instances')))
    .toBeGreaterThanOrEqual(144);
  await expect(page.getByRole('button', { name: 'Run profiler', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run stutter soak (10 min)', exact: true })).toBeVisible();
  await expect(page.getByText('GPU', { exact: true })).toBeVisible();
  await expect(page.getByText('Surface slots', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Detail / PBR', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: 'Grass count' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'fbm', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Auto flyby', exact: true }).click();
  await expect(page.locator('.terrain-lab')).toHaveAttribute('data-auto-flyby', 'true');
  await page.getByRole('button', { name: 'rts', exact: true }).click();
  await expect(page.locator('.terrain-lab')).toHaveAttribute('data-auto-flyby', 'false');

  await page.getByRole('button', { name: 'Photo Op', exact: true }).click();
  await expect(page.locator('.terrain-lab')).toHaveAttribute('data-photo-op', 'true');
  const photoDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Capture PNG', exact: true }).click();
  const downloadedPhoto = await photoDownload;
  expect(downloadedPhoto.suggestedFilename()).toBe('terrain-lab-photo-op.png');
  const photoStream = await downloadedPhoto.createReadStream();
  const photoChunks: Buffer[] = [];
  for await (const chunk of photoStream) photoChunks.push(Buffer.from(chunk));
  const photoPng = Buffer.concat(photoChunks);
  expect(photoPng.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect(photoPng.readUInt32BE(16)).toBe(1600);
  expect(photoPng.readUInt32BE(20)).toBe(900);
  await downloadedPhoto.saveAs(testInfo.outputPath('terrain-photo-op.png'));
  await page.getByRole('button', { name: 'rts', exact: true }).click();
  await expect(page.getByRole('button', { name: 'top', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'high', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'low', exact: true })).toBeVisible();
  await expect(page.locator('.terrain-lab')).toHaveAttribute('data-photo-op', 'false');

  await page.getByRole('button', { name: 'close', exact: true }).click();
  const bladeCount = page.getByRole('spinbutton', { name: 'Blade count' });
  await bladeCount.fill('1000');
  await bladeCount.dispatchEvent('change');
  await expect(bladeCount).toHaveValue('1000');
  await page.getByRole('button', { name: /Blades/ }).click();
  await expect(page.locator('.terrain-lab')).toHaveAttribute('data-cover-instances', '0');
  await expect
    .poll(async () => Number(await page.locator('.terrain-lab').getAttribute('data-blade-instances')), {
      timeout: 20_000,
    })
    .toBeGreaterThan(50);
  expect(Number(await page.locator('.terrain-lab').getAttribute('data-blade-instances'))).toBeLessThan(1000);
  const bladeInstancesBeforeWindTuning = await page.locator('.terrain-lab').getAttribute('data-blade-instances');
  await page.getByRole('spinbutton', { name: 'Maximum wind tilt' }).fill('20');
  await page.getByRole('spinbutton', { name: 'Maximum wind tilt' }).dispatchEvent('change');
  await expect(page.locator('.terrain-lab')).toHaveAttribute('data-blade-instances', bladeInstancesBeforeWindTuning!);
  await page.getByRole('button', { name: /Flowers/ }).click();
  await expect(page.locator('.terrain-lab')).toHaveAttribute('data-flower-instances', '280');
  await expect(page.locator('.terrain-lab')).toHaveAttribute('data-shader-variant', /flowerCover/);
  const copyFlowers = page.getByRole('button', { name: 'Copy Flower cover JSON' });
  await copyFlowers.click();
  await expect(copyFlowers).toHaveText('Copied');
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual({
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
      blueClumpFraction: 0.06,
      yellowClumpFraction: 0.25,
      pocketClumpFraction: 0.55,
      pocketGrowthThreshold: 0.42,
      petalColor: '#f4f1dd',
      bluePetalColor: '#2f6dff',
      yellowPetalColor: '#ffd84a',
      centerColor: '#a97651',
    },
  });
  await page.getByRole('button', { name: /Leaves/ }).click();
  await expect(page.locator('.terrain-lab')).toHaveAttribute('data-shader-variant', /leafCover/);
  const leafInstances = Number(await page.locator('.terrain-lab').getAttribute('data-leaf-instances'));
  expect(leafInstances).toBeGreaterThanOrEqual(144);
  expect(leafInstances).toBeLessThanOrEqual(640);
  const copyLeaves = page.getByRole('button', { name: 'Copy Broadleaf cover JSON' });
  await copyLeaves.click();
  await expect(copyLeaves).toHaveText('Copied');
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual({
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
  });
  await page.getByRole('button', { name: 'rts', exact: true }).click();

  await page.getByLabel('Debug view').selectOption('weight1');
  await expect(page.locator('.terrain-lab')).toHaveAttribute('data-reference', 'false');
  await page.getByRole('button', { name: 'Baked production reference' }).click();
  await expect(page.locator('.terrain-lab')).toHaveAttribute('data-shader-variant', 'production-reference');

  const copyBladePatches = page.getByRole('button', { name: 'Copy Blade patches JSON' });
  await copyBladePatches.click();
  await expect(copyBladePatches).toHaveText('Copied');
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual({
    blades: {
      tiltNoisePatchSize: 12,
      tiltCellJitter: 0.5,
      tiltTransitionWidth: 0.32,
      tiltNoiseStrength: 0.1,
      tiltVariationDegrees: 7,
      tiltDirectionJitterDegrees: 90,
      bendHeightInfluence: 0.7,
      bendJitterDegrees: 8,
      tintNoisePatchSize: 25,
      tintNoiseStrength: 1.35,
      groundBlend: 0.4,
      rootGroundBlend: 0.7,
      growthSyncToGround: 1,
      growthNoisePatchSize: 21,
      growthHeightVariation: 1.2,
      growthMinimumHeightScale: 0.6,
      growthDensityVariation: 1,
      growthDensityExponent: 1.75,
      tintNoiseColor: '#ffde0a',
    },
  });

  const copyBladeInteraction = page.getByRole('button', { name: 'Copy Blade interaction JSON' });
  await copyBladeInteraction.click();
  await expect(copyBladeInteraction).toHaveText('Copied');
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual({
    blades: {
      interactionSphereRadius: 6,
      interactionPushStrength: 0.85,
      interactionSquashStrength: 0.9,
      interactionMaxTiltDegrees: 38,
      interactionGroundClearance: 0.04,
    },
  });

  const copyBladeWind = page.getByRole('button', { name: 'Copy Blade wind JSON' });
  await copyBladeWind.click();
  await expect(copyBladeWind).toHaveText('Copied');
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual({
    blades: {
      windNoisePatchSize: 14,
      windTiltDegrees: 20,
      windSpeed: 11,
      windAzimuth: 99,
      windDirectionBias: 0.75,
      windBendExponent: 1.9,
    },
  });

  await page.getByRole('button', { name: 'Copy JSON', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as {
    version: number;
    slots: unknown[];
    cover: { count: number; width: number; groundOffset: number };
    ground: { baseColor: string; highlightColor: string; accentColor: string; accentStrength: number };
    lighting: { ambient: number; skylight: number };
    blades: {
      tintNoisePatchSize: number;
      tiltNoisePatchSize: number;
      tiltCellJitter: number;
      tiltTransitionWidth: number;
      tiltNoiseStrength: number;
      tiltVariationDegrees: number;
      tiltDirectionJitterDegrees: number;
      tintNoiseStrength: number;
      tintNoiseColor: string;
      rootColor: string;
      tipColor: string;
      rootGroundBlend: number;
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
      glintTipBias: number;
      sideLightEvenness: number;
    };
    flowers: {
      count: number;
      clumpCount: number;
      radius: number;
      petalColor: string;
      bluePetalColor: string;
      yellowPetalColor: string;
      centerColor: string;
      grassHeightRatioVariation: number;
      windInfluence: number;
    };
    leaves: {
      clumpCount: number;
      maxPlantsPerClump: number;
      maxLeavesPerPlant: number;
      shortGrassThreshold: number;
      edgeColor: string;
      bodyColor: string;
      centerColor: string;
    };
  };
  expect(copied.version).toBe(25);
  expect(copied.slots).toHaveLength(4);
  expect(copied.cover).toMatchObject({ count: 1200, width: 7, groundOffset: -0.08 });
  expect(copied.blades).toMatchObject({
    width: 0.29,
    topWidth: 0.07,
    rootOcclusion: 0.88,
    roughness: 0.14,
    specularIntensity: 0.06,
    glintSpread: 0.37,
    glintTipBias: 0.85,
    sideLightEvenness: 1,
    tiltDegrees: 35,
    tiltNoisePatchSize: 12,
    tiltCellJitter: 0.5,
    tiltTransitionWidth: 0.32,
    tiltNoiseStrength: 0.1,
    tiltVariationDegrees: 7,
    tiltDirectionJitterDegrees: 90,
    tintNoisePatchSize: 25,
    tintNoiseStrength: 1.35,
    tintNoiseColor: '#ffde0a',
    rootColor: '#587f49',
    tipColor: '#91b86f',
    rootGroundBlend: 0.7,
    growthNoisePatchSize: 21,
    growthHeightVariation: 1.2,
    growthMinimumHeightScale: 0.6,
    growthDensityVariation: 1,
    growthDensityExponent: 1.75,
    windNoisePatchSize: 14,
    windTiltDegrees: 20,
    windSpeed: 11,
    windAzimuth: 99,
    windDirectionBias: 0.75,
    windBendExponent: 1.9,
    interactionSphereRadius: 6,
    interactionPushStrength: 0.85,
    interactionSquashStrength: 0.9,
    interactionMaxTiltDegrees: 38,
    interactionGroundClearance: 0.04,
  });
  expect(copied.flowers).toMatchObject({
    count: 280,
    clumpCount: 20,
    radius: 0.48,
    petalColor: '#f4f1dd',
    bluePetalColor: '#2f6dff',
    yellowPetalColor: '#ffd84a',
    centerColor: '#a97651',
    grassHeightRatioVariation: 0.25,
    windInfluence: 1.04,
  });
  expect(copied.leaves).toMatchObject({
    clumpCount: 16,
    maxPlantsPerClump: 8,
    maxLeavesPerPlant: 5,
    shortGrassThreshold: 0.42,
    edgeColor: '#6b9654',
    bodyColor: '#7faa62',
    centerColor: '#acca7a',
  });
  expect(copied.ground).toMatchObject({
    baseColor: '#2f542b',
    highlightColor: '#648d50',
    accentColor: '#7daa62',
    accentStrength: 0.48,
  });
  expect(copied.lighting).toMatchObject({
    ambient: 0.15,
    skylight: 0.07,
    sun: 2.21,
    sunAzimuth: 293,
    sunElevation: 63,
    exposure: 2.38,
    contrast: 1.36,
    sunColor: '#fffce5',
    ambientColor: '#b8f3ff',
  });
  expect(consoleErrors).toEqual([]);
});
