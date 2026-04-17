# ARCHITECTURE.md — Factory Island

Technische Architektur des eigenständigen Factory-Island-Projekts.

---

## 1. Projektüberblick

| Eigenschaft      | Wert |
|------------------|------|
| Name             | Factory Island |
| Engine           | React 19 + Vite 5, Phaser 3 für Welt-Rendering |
| Sprache          | TypeScript (strict), TSX für React-Komponenten |
| Tile-Größe       | `CELL_PX = 64` px |
| Grid             | 80 × 50 Tiles (`GRID_W`, `GRID_H` in `constants/grid.ts`) |
| State            | `useReducer` mit `gameReducer` in `store/reducer.ts` |
| Persistenz       | `localStorage`, Key `"factory-island-save"`, versionierte Migration |
| Standalone-Entry | `index.factory.html` → `src/game/entry/main.factory.tsx` |
| Build-Output     | `dist-factory/` |

Das Projekt ist ein 2D-Fabrik-Aufbauspiel. Der Spieler baut Maschinen, Förderbänder und ein
Energienetz auf. Rohstoffe werden abgebaut, transportiert und verarbeitet. Der gesamte
Spielzustand wird in einem einzigen React-State-Tree verwaltet.

---

## 2. Ordnerstruktur

```
src/game/                    ← gesamter Factory-Island-Code
├── assets/sprites/          Sprite-Definitionen & PNGs
├── constants/
│   └── grid.ts              GRID_W, GRID_H, CELL_PX
├── debug/                   Debug-System (tree-shaken in Production)
│   ├── debugConfig.ts       IS_DEV-Flag
│   ├── debugLogger.ts       Strukturierter Logger (Kategorien)
│   ├── DebugPanel.tsx       Debug-UI (nur DEV)
│   ├── hmrState.ts          HMR-State via window.__FI_HMR_STATE__
│   ├── mockData.ts          Mock-Presets
│   └── index.ts             Barrel-Export
├── entry/
│   ├── main.factory.tsx     Standalone-Einstiegspunkt (createRoot)
│   └── FactoryApp.tsx       App-Root: useReducer, Tick-Timer, Panel-Routing
├── grid/
│   └── Grid.tsx             Kamera (Pan/Zoom), Klick-Handler, Phaser-Mount
├── simulation/
│   ├── game.ts              Re-Export-Wrapper → store/reducer
│   ├── save.ts              Serialisierung, Migration, loadAndHydrate()
│   ├── __tests__/           Unit-Tests
│   └── recipes/             Rezepte (eigene Datei pro Typ)
│       ├── index.ts          Barrel-Re-Export
│       ├── SmeltingRecipes.ts
│       ├── WorkbenchRecipes.ts
│       └── ManualAssemblerRecipes.ts
├── store/
│   ├── reducer.ts           Haupt-Reducer, alle Typen, Konstanten, Logik
│   └── actions.ts           GameAction-Type-Facade
├── types/
│   └── game.ts              Type-Facade (re-exportiert aus store/reducer)
├── ui/
│   ├── hud/                 Hotbar, Notifications, ResourceBar, AutoDeliveryFeed
│   ├── menus/               BuildMenu, ModeSelect
│   ├── panels/              Ein Panel pro Maschine/Gebäude
│   └── styles/              factory-game.css (BEM, Präfix fi-)
└── world/
    ├── PhaserHost.tsx        React-Wrapper für Phaser-Game
    └── PhaserGame.ts         WorldScene (Tilemap, Sprites)
```

### Wichtige Dateien außerhalb von `src/game/`

| Datei | Zweck |
|---|---|
| `index.factory.html` | Standalone-HTML-Entry |
| `vite.factory.config.ts` | Eigene Vite-Konfiguration (unabhängig von Haupt-Config) |
| `tsconfig.factory.json` | Eigene TS-Config (`include: src/game/**/*`) |
| `AGENTS.md` | Regeln für KI-Agenten |

---

## 3. Build-Pfad

### Entwicklung

```bash
yarn dev
# → vite --config vite.factory.config.ts (port 3000 + host via server-Config)
```

### Produktion

```bash
yarn build
# → tsc --project tsconfig.factory.json && vite build --config vite.factory.config.ts
```

### Konfiguration

- **Vite-Config** (`vite.factory.config.ts`):
  - Plugin: `@vitejs/plugin-react` mit `babel-plugin-react-compiler`
  - Keine Pfad-Aliase (`src/game/**` nutzt nur relative Imports)
  - Phaser wird als separater Chunk gebaut (`manualChunks: { phaser: ["phaser"] }`)
  - Output: `dist-factory/`, `base: "./"`

- **TypeScript-Config** (`tsconfig.factory.json`):
  - `target: ESNext`, `strict: true`, `jsx: react-jsx`
  - Pfad-Alias: `game/* → src/game/*`
  - Include: `src/game/**/*`
  - Exclude: `__tests__/**`

---

## 4. Zentrale Spielmodule

### 4.1 State & Reducer (`store/reducer.ts`)

**Einzige Quelle** für State-Interface, Typen, Konstanten und Reducer-Logik.

- `GameState` — vollständiger Spielzustand (Assets, Inventar, Maschinen, UI, Energie)
- `GameAction` — Union-Typ aller ~50 Dispatch-Aktionen
- `gameReducer(state, action) → GameState` — reine Funktion, kein Side-Effect

Zugriffspfade (Facades):
- `simulation/game.ts` → Kompatibilitäts-Wrapper: `export * from "../store/reducer"`
- `store/actions.ts` → Action-Type-Facade: `export type { GameAction } from "./reducer"`
- `types/game.ts` → Type-Facade (re-exportiert alle Domain-Typen)

### 4.2 Save/Load (`simulation/save.ts`)

Versioniertes Migrationssystem:

```
loadAndHydrate(raw, mode)
  → migrateSave(raw)          // v0 → v1 → ... → CURRENT
  → deserializeState(save)    // GameState aufbauen, Derived State berechnen
```

- `CURRENT_SAVE_VERSION = 1`
- `serializeState()` extrahiert nur persistierbare Felder
- `deserializeState()` berechnet `connectedAssetIds` neu via `computeConnectedAssetIds()`
- Transiente Felder (UI-State, Notifications, Debug) werden nicht persistiert

### 4.3 Timer-System (`entry/FactoryApp.tsx`)

Alle Ticks laufen als `setInterval` in der Root-Komponente:

| Timer | Intervall | Aktion |
|---|---|---|
| `NATURAL_SPAWN_MS` | 60 000 ms | Bäume/Ressourcen spawnen |
| Sapling Growth | 1 000 ms | `GROW_SAPLINGS` (prüft Timestamps) |
| `SMITHY_TICK_MS` | 100 ms | Schmiede-Verarbeitung |
| `MANUAL_ASSEMBLER_TICK_MS` | 100 ms | Assembler-Verarbeitung |
| `GENERATOR_TICK_MS` | 200 ms | Generator-Brennstoffverbrauch |
| `ENERGY_NET_TICK_MS` | 2 000 ms | Energienetz-Berechnung |
| `LOGISTICS_TICK_MS` | 500 ms | Auto-Miner, Förderbänder, Auto-Smelter |
| Notification Cleanup | 500 ms | Abgelaufene Notifications entfernen |

---

## 5. Rendering-Architektur

### Duale Rendering-Strategie

| Ebene | Technologie | Rendert |
|---|---|---|
| Welt (Boden, Gebäude, Sprites) | Phaser 3 (Canvas) | Tilemap, statische Assets |
| UI (Panels, HUD, Overlays) | React (DOM) | Hotbar, Panels, Menüs, Debug |
| Kamera | CSS `transform` in `Grid.tsx` | Einheitliche Pan/Zoom-Basis |

### Phaser-Integration

- `PhaserHost.tsx` mountet Phaser in einem `<div>` innerhalb von `Grid.tsx`
- Canvas hat `pointer-events: none` — alle Klicks gehen durch React
- `WorldScene` empfängt Daten via Phaser-Events (`FLOOR_MAP_EVENT`, `STATIC_ASSETS_EVENT`)
- Sprites werden in `PhaserGame.ts` via `preload()` geladen

### Kamera (`Grid.tsx`)

- Pan: Maus-Drag → CSS `transform: translate()`
- Zoom: Mausrad → CSS `transform: scale()` (Bereich: 0.3–3)
- Koordinaten-Umrechnung: Screen → World → Grid
- Build-Richtung: R-Taste rotiert (`north → east → south → west`)

### Architekturregeln (Rendering)

- Phaser = Welt. React = UI/Overlay.
- Nur ein World-Root, nur eine Transform-Basis.
- Kein doppeltes Rendering desselben Inhalts.
- React-Overlays liegen im gemeinsamen World-Root.

---

## 6. Energie-Netz

- Berechnung per 2-Phasen-BFS in `computeConnectedAssetIds()`:
  1. **Kabel-BFS**: Expandiert von Generatoren durch Kabel & Poles via Adjacency
  2. **Pole-Range-BFS**: Power Poles verteilen drahtlos (Chebyshev, `POWER_POLE_RANGE = 3`)
- Kein zentraler Energie-Pool — Batterien (`BATTERY_CAPACITY = 1000`) sind einziger Speicher
- Generator benötigt Steinboden (`REQUIRES_STONE_FLOOR`)
- `machinePowerRatio[id]` = Versorgungsgrad (0–1) pro Maschine
- Prioritätssystem: `MachinePriority = 1 | 2 | 3 | 4 | 5` (1 = höchste)
- Neue Verbraucher: in `ENERGY_DRAIN` eintragen

### Registrierte Verbraucher

```typescript
ENERGY_DRAIN = {
  smithy: 2, workbench: 3, auto_miner: 5,
  conveyor: 1, conveyor_corner: 1, auto_smelter: 10,
}
```

---

## 7. Maschinen

### Übersicht

| Maschine | Größe | Typ | Referenz |
|---|---|---|---|
| Auto-Miner | 1×1 | Automatisch, auf Deposit | Referenz-Implementierung |
| Auto-Smelter | 2×1 rotierbar | Automatisch, Input/Output | Vorlage für neue Auto-Maschinen |
| Förderband | 1×1 | Transport | `conveyor`, `conveyor_corner` |
| Generator | 2×2 | Energieerzeugung | Benötigt Steinboden |
| Batterie | 2×2 | Energiespeicher | |
| Power Pole | 1×1 | Energieverteilung | Chebyshev-Reichweite |
| Smithy | 2×2 | Manuell (UI) | |
| Workbench | 2×2 | Crafting (UI) | |
| Warehouse | 2×2 | Lager (max. 2) | Eigenes Inventar |
| Manual Assembler | 2×2 | Manuell (UI) | |

### Maschinenzustände (Pflicht für automatische Maschinen)

```
IDLE → PROCESSING → OUTPUT_BLOCKED
                  → MISCONFIGURED
NO_POWER (bei 0 % Energie)
```

### IO-Zellen

Rotierbare Maschinen berechnen Input/Output-Zellen anhand von `direction`.
Beispiel: `getAutoSmelterIoCells()` gibt Input- und Output-Position basierend auf Richtung zurück.

---

## 8. Rezepte

Alle Rezepte liegen in `src/game/simulation/recipes/`:

| Datei | Inhalt |
|---|---|
| `SmeltingRecipes.ts` | iron → ironIngot, copper → copperIngot |
| `WorkbenchRecipes.ts` | Werkzeug-Rezepte (Pickaxes etc.) |
| `ManualAssemblerRecipes.ts` | ironIngot → metalPlate, metalPlate → gear |
| `index.ts` | Barrel-Re-Export (einziger erlaubter Import-Pfad) |

Import-Regel:
```typescript
// ✅ korrekt
import { getSmeltingRecipe } from "./recipes";
// ❌ verboten — kein Direkt-Import aus Unter-Dateien
import { getSmeltingRecipe } from "./recipes/SmeltingRecipes";
```

---

## 9. UI-Struktur

### Panels (`ui/panels/`)

Ein Panel pro Maschine/Gebäude. Panels erhalten `state` und `dispatch` als Props,
enthalten **keine** Spiellogik — nur Darstellung und `dispatch`-Aufrufe.

Vorhandene Panels:
`AutoMinerPanel`, `AutoSmelterPanel`, `BatteryPanel`, `GeneratorPanel`,
`ManualAssemblerPanel`, `MapShopPanel`, `PowerPolePanel`, `SmithyPanel`,
`WarehousePanel`, `WorkbenchPanel`, `EnergyDebugOverlay`

### HUD (`ui/hud/`)

- `Hotbar.tsx` — 9-Slot-Leiste (unten, Tasten 1–9)
- `ResourceBar.tsx` — Ressourcenanzeige (oben rechts)
- `Notifications.tsx` — Schwebende Benachrichtigungen
- `AutoDeliveryFeed.tsx` — Lagerhaus-Lieferprotokoll

### Menüs (`ui/menus/`)

- `BuildMenu.tsx` — Gebäude-/Bodenfliesen-Auswahl
- `ModeSelect.tsx` — Startbildschirm (Debug vs. Release)

### CSS (`ui/styles/factory-game.css`)

- BEM-ähnlich, Präfix `fi-` für alle Klassen
- Beispiele: `.fi-root`, `.fi-panel`, `.fi-hotbar-slot`, `.fi-hotbar-slot--active`

---

## 10. Debug-System

Komplett tree-shaken in Production via `import.meta.env.DEV`.

| Komponente | Datei | Zweck |
|---|---|---|
| IS_DEV-Flag | `debugConfig.ts` | Zentrale Prüfung |
| Logger | `debugLogger.ts` | Kategorien: Building, Inventory, Mining, Warehouse, Hotbar, Smithy, HMR, Mock, General |
| HMR-State | `hmrState.ts` | State über `window.__FI_HMR_STATE__` bei Hot-Reload erhalten |
| Mock-Daten | `mockData.ts` | Presets: MOCK_RESOURCES, MOCK_TOOLS, MOCK_BUILDINGS, MOCK_ALL |
| Debug-Panel | `DebugPanel.tsx` | Mock-Buttons, HMR-Status (nur im Debug-Modus) |

Debug-Modus (`GameMode = "debug"`): Startet mit vollem Inventar und deterministischem Test-Setup
(Auto-Miner → Förderbänder → Auto-Smelter → Förderbänder → Warehouse, Generatoren + Poles).

---

## 11. Design-Konventionen

### Allgemein

- Kein globales State-Management außerhalb von `useReducer`
- Keine neuen npm-Abhängigkeiten ohne Rücksprache
- Alle Werte als benannte Konstanten in `store/reducer.ts`
- Reducer ist reine Funktion — nie `state` direkt mutieren
- `assetWidth(asset)` / `assetHeight(asset)` statt `asset.size` verwenden

### Dateinamen

| Typ | Konvention | Beispiel |
|---|---|---|
| React-Komponente | PascalCase `.tsx` | `AutoSmelterPanel.tsx` |
| Logik | camelCase `.ts` | `debugLogger.ts` |
| Rezepte | PascalCase + "Recipes" | `SmeltingRecipes.ts` |
| CSS | kebab-case | `factory-game.css` |

### Neue Maschine registrieren

1. Typ zu `AssetType` / `BuildingType` hinzufügen
2. In `ENERGY_DRAIN` eintragen
3. `BUILDING_SIZES`, `BUILDING_COSTS`, `BUILDING_LABELS`, `ASSET_LABELS`, `ASSET_COLORS`, `ASSET_EMOJIS` ergänzen
4. `GameState` um Entry-Record erweitern
5. Reducer-Cases für `LOGISTICS_TICK` / `ENERGY_NET_TICK` implementieren
6. Panel erstellen und in `FactoryApp.tsx` einbinden
7. Save-Migration in `save.ts` anpassen (falls neue Felder)
8. `normalizeLoadedState` via `loadAndHydrate` berücksichtigt Migration automatisch
9. Debug-Setup in `createInitialState("debug")` ergänzen

---

## 12. Hinweise

Factory Island nutzt:
- `vite.factory.config.ts` — Vite-Build-Konfiguration
- `tsconfig.factory.json` — TypeScript-Konfiguration
- `index.factory.html` — HTML-Einstiegspunkt
- `src/game/**` — Gesamter Spielcode

---

*Last updated: 2026-04-17 — Wartungshinweis: Bei Änderungen an der Projektstruktur, neuen Modulen oder Build-Konfiguration diese Datei aktualisieren. Vergleiche mit `AGENTS.md` für detaillierte Regeln.*
