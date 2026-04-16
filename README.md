<h1 align="center">Factory Island</h1>

A 2D factory-building game. Mine resources, transport them via conveyor belts,
process them in machines, and build an energy grid to power your island.

Built with React, TypeScript, Phaser 3, and Vite.

---

# Getting Started

### Prerequisites

- Node.js 22+
- Yarn 1.x (`npm install -g yarn`)

### Install

```bash
yarn install
```

### Development

```bash
yarn dev
```

Opens the game at `http://localhost:3000/`.

### Production Build

```bash
yarn build
```

Output goes to `dist-factory/`.

### Preview Production Build

```bash
yarn preview
```

### Run Tests

```bash
yarn test
```

---

# Project Structure

```
src/game/          ← All game code (standalone, zero external dependencies)
  entry/           App shell, entry point
  store/           Reducer, state, types, constants
  simulation/      Save/load, recipes
  grid/            Camera, rendering, click handling
  world/           Phaser background rendering
  ui/              Panels, HUD, menus, styles
  assets/          Sprites, images
  debug/           Debug system (tree-shaken in production)
  constants/       Grid dimensions
  types/           Type re-exports
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for full technical documentation.

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues and fixes.

See [AGENTS.md](AGENTS.md) for AI coding agent guidelines.

---

# Build

| Command | Purpose | Config |
|---------|---------|--------|
| `yarn dev` | Development server | `vite.factory.config.ts` |
| `yarn build` | Production build | `vite.factory.config.ts` + `tsconfig.factory.json` |
| `yarn preview` | Preview production build | `vite.factory.config.ts` |
| `yarn test` | Run tests | `jest.config.js` |
| `yarn lint` | Lint source files | ESLint |
