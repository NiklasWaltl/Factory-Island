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
│   ├── debugConfig.ts       IS_DEV-Flag, isDebugEnabled() Runtime-Toggle
│   ├── debugLogger.ts       Strukturierter Logger (Kategorien, Ring-Buffer 500)
│   ├── DebugPanel.tsx       Debug-UI (nur DEV + debug-Mode)
│   ├── hmrState.ts          HMR-State via window.__FI_HMR_STATE__
│   ├── mockData.ts          Mock-Presets
│   └── index.ts             Barrel-Export
├── entry/
│   ├── main.factory.tsx     Standalone-Einstiegspunkt (createRoot)
│   └── FactoryApp.tsx       App-Root: FactoryGame + GameInner + GameErrorBoundary
├── grid/
│   └── Grid.tsx             Kamera (Pan/Zoom), Klick-Handler, Phaser-Mount
├── simulation/
│   ├── game.ts              Kompatibilitäts-Wrapper: export * from "../store/reducer"
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
    └── PhaserGame.ts         WorldScene (Tilemap, Sprites, Events)
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
# → vite --config vite.factory.config.ts (port 3000, host: true)
```

### Produktion

```bash
yarn build
# → tsc --project tsconfig.factory.json && vite build --config vite.factory.config.ts
```

### Konfiguration

- **Vite-Config** (`vite.factory.config.ts`):
  - Plugin: `@vitejs/plugin-react` mit `babel-plugin-react-compiler`
  - Custom-Middleware: Rewrites `/` und `/index.html` → `/index.factory.html` im Dev-Server
  - Keine Pfad-Aliase im Vite-Build (`src/game/**` nutzt nur relative Imports)
  - Phaser wird als separater Chunk gebaut (`manualChunks: { phaser: ["phaser"] }`)
  - Output: `dist-factory/`, `base: "./"`

- **TypeScript-Config** (`tsconfig.factory.json`):
  - `target: ESNext`, `strict: true`, `jsx: react-jsx`
  - Pfad-Alias: `game/* → src/game/*` (nur für tsc, nicht Vite)
  - Include: `src/game/**/*`
  - Exclude: `node_modules`, `src/game/**/__tests__/**`

---

## 4. Zentrale Spielmodule

### 4.1 State & Reducer (`store/reducer.ts`)

**Einzige Quelle** für State-Interface, Typen, Konstanten und Reducer-Logik.

- `GameState` — vollständiger Spielzustand (Assets, Inventar, Maschinen, UI, Energie)
- `GameAction` — Union-Typ aller Dispatch-Aktionen
- `gameReducer(state, action) → GameState` — reine Funktion, kein Side-Effect

Zugriffspfade (Facades):
- `simulation/game.ts` → Kompatibilitäts-Wrapper: `export * from "../store/reducer"`
- `store/actions.ts` → Action-Type-Facade: `export type { GameAction } from "./reducer"`
- `types/game.ts` → Type-Facade (re-exportiert alle Domain-Typen)

Interne Hilfsfunktionen (NICHT exportiert, nur in `reducer.ts` verwendbar):
- `assetWidth(asset)` → `asset.width ?? asset.size`
- `assetHeight(asset)` → `asset.height ?? asset.size`
- Außerhalb von `reducer.ts`: Direkt `asset.width ?? asset.size` verwenden.

### 4.2 App-Root (`entry/FactoryApp.tsx`)

Drei Schichten:

| Komponente | Zweck |
|---|---|
| `FactoryGame` (Default-Export) | Mode-Selection: zeigt `ModeSelect`, startet `GameInner` per `key={mode}` |
| `GameInner` | Hält `useReducer`, alle `setInterval`-Ticks, Keyboard-Handler, Panel-Routing |
| `GameErrorBoundary` | React-Error-Boundary — fängt Render-Fehler, zeigt Recovery-UI, löscht Save bei Reset |

`main.factory.tsx` importiert den Default-Export als `FactoryApp` (Name irrelevant beim Default-Import).

Keyboard-Shortcuts (registriert in `GameInner`):
- `1`–`9` → Hotbar-Slot aktivieren
- `B` / `b` → Build-Modus umschalten
- `Escape` → Panel schließen oder Build-Modus verlassen (Eingabefelder ausgenommen)

Auto-Save: State wird alle **10 Sekunden** + bei `beforeunload` in `localStorage["factory-island-save"]` gespeichert.

### 4.3 Save/Load (`simulation/save.ts`)

Versioniertes Migrationssystem:

```
loadAndHydrate(raw, mode)
  → migrateSave(raw)          // v0 → v1 → ... → CURRENT (MIGRATIONS-Array)
  → deserializeState(save)    // GameState aufbauen, Derived State berechnen
```

- `CURRENT_SAVE_VERSION = 1`
- `MIGRATIONS = [{ from: 0, to: 1, migrate: migrateV0ToV1 }]`
- `serializeState()` extrahiert nur persistierbare Felder (kein abgeleiteter State)
- `deserializeState()` berechnet `connectedAssetIds` neu via `computeConnectedAssetIds()`
- **Mode-Guard**: Wenn `save.mode !== mode` → `createInitialState(mode)` zurückgeben (kein Laden)
- `normalizeLoadedState()` in `FactoryApp.tsx` ist ein Thin-Wrapper um `loadAndHydrate()`

Transiente Felder (nicht persistiert — bei Laden als Default gesetzt):

```
connectedAssetIds, poweredMachineIds, openPanel, notifications, buildMode,
selectedBuildingType, selectedFloorTile, selectedWarehouseId, selectedPowerPoleId,
selectedAutoMinerId, selectedAutoSmelterId, energyDebugOverlay, autoDeliveryLog
```

Um ein neues Feld transient zu halten: **nicht** in `SaveGameV*` aufnehmen, in `deserializeState()` mit Default initialisieren.

### 4.4 Timer-System (`entry/FactoryApp.tsx` — `GameInner`)

Alle Ticks laufen als `setInterval`:

| Timer | Intervall | Aktion | Bedingung |
|---|---|---|---|
| `NATURAL_SPAWN_MS` | 60 000 ms | Bäume/Ressourcen spawnen (20% Chance, Cap 30) | immer |
| Sapling Growth | 1 000 ms | `GROW_SAPLINGS` — prüft `saplingGrowAt`-Timestamps per Ref | immer |
| `SMITHY_TICK_MS` | 100 ms | Schmiede-Verarbeitung | nur wenn `smithy.processing === true` |
| `MANUAL_ASSEMBLER_TICK_MS` | 100 ms | Assembler-Verarbeitung | nur wenn `manualAssembler.processing === true` |
| `GENERATOR_TICK_MS` | 200 ms | Generator-Brennstoffverbrauch | nur wenn `generator.running === true` |
| `ENERGY_NET_TICK_MS` | 2 000 ms | Energienetz-Berechnung | immer |
| `LOGISTICS_TICK_MS` | 500 ms | Auto-Miner, Förderbänder, Auto-Smelter | immer |
| Notification Cleanup | 500 ms | Abgelaufene Notifications entfernen | immer |
| localStorage-Save | 10 000 ms | State persistent speichern | immer |

Smithy-, ManualAssembler- und Generator-Timer werden erst gestartet wenn der jeweilige Prozess aktiv ist — kein Leerlauf-Polling. Sapling-Timer liest `saplingGrowAt` über `useRef` um stale-Closure-Fehler zu vermeiden.

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
- `WorldScene` empfängt Daten via Phaser-Events:
  - `FLOOR_MAP_EVENT` — floorMap-Updates (Steinboden/Gras)
  - `STATIC_ASSETS_EVENT` — Asset-Snapshots für Sprite-Rendering
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
  1. **Kabel-BFS**: Seeds bei allen Generatoren. Expandiert **ausschließlich** durch `cable`, `generator`, `power_pole` via direkter Zellen-Adjacency. Maschinen und Batterien sind **keine** Kabelleiter.
  2. **Pole-Range-BFS**: Jeder in Phase 1 erreichte Power Pole verteilt drahtlos (Chebyshev, `POWER_POLE_RANGE = 3`) zu allen Assets in Reichweite. Erreichte Poles verteilen wiederum.
- Kein zentraler Energie-Pool — Batterie (`BATTERY_CAPACITY = 1000` J) ist einziger Speicher
- Generator benötigt Steinboden (`REQUIRES_STONE_FLOOR`)
- `machinePowerRatio[id]` = Versorgungsgrad [0–1] pro Maschine, aktualisiert bei `ENERGY_NET_TICK`
- Prioritätssystem: `MachinePriority = 1 | 2 | 3 | 4 | 5` (1 = höchste, Default = 3)
- Tie-Break bei gleicher Priorität: `ENERGY_ALLOCATION_RANK` (conveyor/corner: 0, auto_miner: 1, smithy/workbench: 2, auto_smelter: 3) — niedrigerer Rank wird zuerst versorgt

### Registrierte Verbraucher

```typescript
ENERGY_DRAIN = {
  smithy: 2, workbench: 3, auto_miner: 5,
  conveyor: 1, conveyor_corner: 1,
  auto_smelter: 10,  // Fallback-Eintrag — wird für auto_smelter dynamisch überschrieben
}
```

**Auto-Smelter Sonderfall** — zustandsabhängiger Drain (überschreibt ENERGY_DRAIN-Eintrag):
- Idle: `AUTO_SMELTER_IDLE_DRAIN_PER_PERIOD = 10` J (5 W × 2 s)
- Processing: `AUTO_SMELTER_PROCESSING_DRAIN_PER_PERIOD = 60` J (30 W × 2 s)

Neue Verbraucher: in `ENERGY_DRAIN` eintragen (und ggf. dynamische Logik in `getConnectedConsumerDrainEntries()` ergänzen).

---

## 7. Maschinen

### Übersicht

| Maschine | Größe | Typ | Hinweis |
|---|---|---|---|
| Auto-Miner | 1×1 | Automatisch, auf Deposit | Cycle: 6×500ms = 3s; Referenz-Implementierung |
| Auto-Smelter | 2×1 rotierbar | Automatisch, Input/Output | Dynamischer Drain; InputBuffer-Kap: 5 |
| Förderband | 1×1 | Transport | `conveyor` |
| Förderband-Ecke | 1×1 | Transport | `conveyor_corner` |
| Generator | 2×2 | Energieerzeugung | Benötigt Steinboden, verbrennt Holz |
| Batterie | 2×2 | Energiespeicher | Kapazität: 1000 J |
| Power Pole | 1×1 | Energieverteilung | Chebyshev-Reichweite 3 Tiles |
| Smithy | 2×2 | Manuell (UI) | |
| Workbench | 2×2 | Crafting (UI) | |
| Warehouse | 2×2 | Lager (max. 2) | Eigenes Inventar nur für Tools/Equip |
| Manual Assembler | 2×2 | Manuell (UI) | |

### Maschinenzustände (Pflicht für automatische Maschinen)

```
IDLE → PROCESSING → OUTPUT_BLOCKED
                  → MISCONFIGURED
NO_POWER (bei 0 % Energieversorgung)
```

### IO-Zellen

Rotierbare Maschinen berechnen Input/Output-Zellen anhand von `direction`.

**Auto-Smelter** (`getAutoSmelterIoCells(asset)`):

| direction | Input | Output |
|---|---|---|
| `east` (default) | links vom Asset | rechts vom Asset |
| `west` | rechts vom Asset | links vom Asset |
| `north` | unterhalb | oberhalb |
| `south` | oberhalb | unterhalb |

**Warehouse** (`getWarehouseInputCell(warehouse)`) — Eingang ist genau 1 Tile, abhängig von `warehouse.direction` (Default: `"south"`):

| warehouse.direction | Eingang-Position | Förderband requiredDir |
|---|---|---|
| `south` (default) | `(x, y + height)` | `north` |
| `north` | `(x, y - 1)` | `south` |
| `east` | `(x + width, y)` | `west` |
| `west` | `(x - 1, y)` | `east` |

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

Panel-Routing in `GameInner`: `state.openPanel` (UIPanel-Union) bestimmt welches Panel gerendert wird.

### HUD (`ui/hud/`)

- `Hotbar.tsx` — 9-Slot-Leiste (unten, Tasten 1–9), max. 5 Items pro Slot (`HOTBAR_STACK_MAX`)
- `ResourceBar.tsx` — Ressourcenanzeige (oben rechts)
- `Notifications.tsx` — Schwebende Benachrichtigungen (max. 5 gleichzeitig, TTL: 4s, Batching)
- `AutoDeliveryFeed.tsx` — Lagerhaus-Lieferprotokoll: max. 50 Einträge, gleiche sourceId+resource innerhalb 8s werden gebatcht. Transientes Feld — nicht persistiert.

### Menüs (`ui/menus/`)

- `BuildMenu.tsx` — Gebäude-/Bodenfliesen-Auswahl (aktiv wenn `state.buildMode === true`, Taste B)
- `ModeSelect.tsx` — Startbildschirm (Debug vs. Release)

### CSS (`ui/styles/factory-game.css`)

- BEM-ähnlich, Präfix `fi-` für alle Klassen
- Beispiele: `.fi-root`, `.fi-panel`, `.fi-hotbar-slot`, `.fi-hotbar-slot--active`

---

## 10. Inventar & Kapazitäten

| Konstante | Wert | Bedeutung |
|---|---|---|
| `WAREHOUSE_CAPACITY` | 20 | Items pro Ressource (Stack-Cap) |
| `MAX_WAREHOUSES` | 2 | Maximale Anzahl platzierbarer Warehouses |
| `getCapacityPerResource(state)` | `(warehousesPlaced + 1) × 20` | Effektive Kapazität pro Resource; ∞ im Debug-Modus |
| `HOTBAR_SIZE` | 9 | Hotbar-Slots |
| `HOTBAR_STACK_MAX` | 5 | Max. Stack-Größe pro Slot |

`warehouseInventories`: Speichert **ausschließlich Tools und Equippables** (axe, pickaxe, sapling) pro Warehouse-Asset-ID. Normale Ressourcen (wood, stone, iron, etc.) liegen immer in `state.inventory`.

Floor-Tiles (`FloorTileType`):
- `"stone_floor"` — Kosten: 2 Stein. Voraussetzung für Generator. Wird in `floorMap` gespeichert.
- `"grass_block"` — Kosten: 1 Setzling. Wandelt Steinboden zurück zu Gras (entfernt Eintrag aus `floorMap`). Nicht in `floorMap` gespeichert, da Abwesenheit = Gras.

---

## 11. Debug-System

Komplett tree-shaken in Production via `import.meta.env.DEV`.

| Komponente | Datei | Zweck |
|---|---|---|
| IS_DEV-Flag | `debugConfig.ts` | `import.meta.env.DEV` — statisch false in Production |
| `isDebugEnabled()` | `debugConfig.ts` | Runtime-Toggle, default true in DEV. Togglebar aus Debug-UI. |
| Logger | `debugLogger.ts` | Kategorien: Building, Inventory, Mining, Warehouse, Hotbar, Smithy, HMR, Mock, General; Ring-Buffer: 500 Entries |
| HMR-State | `hmrState.ts` | State über `window.__FI_HMR_STATE__` bei Hot-Reload erhalten |
| Mock-Daten | `mockData.ts` | Presets: MOCK_RESOURCES, MOCK_TOOLS, MOCK_BUILDINGS, MOCK_ALL |
| Debug-Panel | `DebugPanel.tsx` | Mock-Buttons, HMR-Status (nur wenn `IS_DEV && state.mode === "debug"`) |

**Logging-Bedingung**: Beide Checks müssen true sein: `import.meta.env.DEV` UND `isDebugEnabled()`.

Debug-Modus (`GameMode = "debug"`): Deterministisches Test-Setup — Auto-Miner (Eisen) → 3 Förderbänder → Auto-Smelter → 3 Förderbänder → Warehouse + 2 Generatoren + Stromknoten. Debug-Free-Zone (~48% des kleineren Grid-Maßes) verhindert zufälligen Resource-Spawn im Arbeitsbereich.

---

## 12. Design-Konventionen

### Allgemein

- Kein globales State-Management außerhalb von `useReducer`
- Keine neuen npm-Abhängigkeiten ohne Rücksprache
- Alle Werte als benannte Konstanten in `store/reducer.ts`
- Reducer ist reine Funktion — nie `state` direkt mutieren
- Für Größen: `asset.width ?? asset.size` und `asset.height ?? asset.size` (nicht `asset.size` allein)

### Dateinamen

| Typ | Konvention | Beispiel |
|---|---|---|
| React-Komponente | PascalCase `.tsx` | `AutoSmelterPanel.tsx` |
| Logik | camelCase `.ts` | `debugLogger.ts` |
| Rezepte | PascalCase + "Recipes" | `SmeltingRecipes.ts` |
| CSS | kebab-case | `factory-game.css` |

### Neue Maschine registrieren

1. Typ zu `AssetType` / `BuildingType` hinzufügen
2. In `ENERGY_DRAIN` eintragen (falls Verbraucher); ggf. dynamische Drain-Logik in `getConnectedConsumerDrainEntries()` ergänzen
3. `BUILDING_SIZES`, `BUILDING_COSTS`, `BUILDING_LABELS`, `ASSET_LABELS`, `ASSET_COLORS`, `ASSET_EMOJIS` ergänzen
4. `STACKABLE_BUILDINGS` ergänzen falls mehrfach platzierbar
5. `GameState` um Entry-Record erweitern falls nötig
6. Reducer-Cases für `LOGISTICS_TICK` / `ENERGY_NET_TICK` implementieren
7. Panel erstellen, in `GameInner` (FactoryApp.tsx) einbinden
8. `UIPanel`-Union erweitern
9. Save-Migration in `save.ts` anpassen — `CURRENT_SAVE_VERSION` erhöhen, `SaveGameV{N}` definieren, Migration schreiben, `MIGRATIONS`-Array ergänzen
10. Debug-Setup in `createInitialState("debug")` ergänzen

---

## 13. Hinweise

Factory Island nutzt:
- `vite.factory.config.ts` — Vite-Build-Konfiguration
- `tsconfig.factory.json` — TypeScript-Konfiguration
- `index.factory.html` — HTML-Einstiegspunkt
- `src/game/**` — Gesamter Spielcode

---

*Last updated: 2026-04-17 — Wartungshinweis: Bei Änderungen an der Projektstruktur, neuen Modulen oder Build-Konfiguration diese Datei aktualisieren. Vergleiche mit `AGENTS.md` für detaillierte Regeln.*
