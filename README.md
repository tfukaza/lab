# Terrain Laboratory

An independent Svelte and Babylon.js client for authoring and profiling Wollosseum's procedural terrain and foliage. The project contains its own source textures, reference assets, tests, and build configuration; it does not import the game client, simulation, multiplayer, HUD, or audio code.

## Requirements

- Node.js 20 or newer
- npm

## Development

```sh
npm install
npm run dev
```

The app is served at the Vite root URL. Production output is written to `dist/` with `npm run build`.

## Verification

```sh
npm run check
npm run test:e2e
```

Playwright's browser binaries must be installed before the end-to-end suite (`npx playwright install chromium`).

The large files under `public/` and `src/assets/terrain/` are runtime inputs copied into this repository so the lab remains self-contained.
