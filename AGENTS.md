# AGENTS.md — Factory Island

Dieses Dokument richtet sich an KI-Coding-Agenten, die an diesem Projekt arbeiten.
Es beschreibt Architektur, Konventionen und Grenzen, die einzuhalten sind.

Trennzeichen in den Regeln:
- **[Code]** = Direkt aus dem Code ablesbar
- **[Vorgabe]** = Explizite Projektvorgabe (gilt auch wenn kein bisheriger Code vorhanden ist)

---

## 1. Projektübersicht

| Eigenschaft     | Wert                                                                                |
|-----------------|-------------------------------------------------------------------------------------|
| Name            | Factory Island                                                                      |
| Kontext         | Mini-Game im Sunflower-Land-Portal-Builder                                          |
| Engine          | React 18 + Vite, custom CSS-Transform-Viewport (kein Phaser) **[Code]**            |
| Sprache         | TypeScript (strict), TSX für React-Komponenten **[Code]**                          |
| Tile-Größe      | `CELL_PX = 64` px **[Code]**                                                        |
| Grid            | 80 × 50 Tiles (`GRID_W = 80`, `GRID_H = 50`) **[Code]**                            |
| State-Verwaltung| `useReducer` mit purem `gameReducer` in `FactoryApp.tsx` **[Code]**                |
| Persistenz       | `localStorage`, Key `"factory-island-save"` **[Code]**                            |

Kurzbeschreibung: Ein 2D-Fabrik-Aufbauspiel. Der Spieler baut Maschinen, Förderbänder und ein
Energienetz auf. Rohstoffe werden abgebaut, über Förderbänder transportiert und in Maschinen
verarbeitet. Alles wird in einem einzigen React-State-Tree verwaltet.

---

## 2. Ordnerstruktur

### `src/game/` — Factory-Island-Code (hier wird entwickelt)

```
src/game/
├── assets/sprites/     Sprite-Definitionen (sprites.ts) – nur Grafik, keine Logik
├── debug/              Debug-System; vollständig tree-shaken in Production
│   ├── debugConfig.ts  IS_DEV-Flag, setDebugEnabled()
│   ├── debugLogger.ts  Strukturierter Logger (Kategorien: Building, Inventory, …)
│   ├── DebugPanel.tsx  Debug-UI (nur DEV)
│   ├── hmrState.ts     HMR-State-Preservation via window.__FI_HMR_STATE__
│   └── mockData.ts     Mock-Presets (DEBUG_MOCK_RESOURCES etc.)
├── entry/
│   ├── FactoryApp.tsx  App-Root: useReducer, alle setInterval-Ticks, Panel-Routing
│   └── main.factory.tsx  Einstiegspunkt
├── grid/
│   └── Grid.tsx        Grid-Rendering, Kamera (Pan/Zoom via CSS transform), Klick-Handler
├── simulation/
│   ├── game.ts         EINZIGE Quelle für State, Typen, Konstanten, Reducer, Aktionen
│   └── recipes/        Alle Rezepte – jeden Typ in eigener Datei
│       ├── index.ts    Barrel-Re-Export (einziger erlaubter Rezept-Import-Pfad)
│       ├── SmeltingRecipes.ts
│       ├── WorkbenchRecipes.ts
│       └── ManualAssemblerRecipes.ts
└── ui/
    ├── hud/            HUD-Elemente (Hotbar, Notifications, ResourceBar)
    ├── menus/          BuildMenu, ModeSelect
    ├── panels/         Ein Panel pro Maschine/Gebäude
    └── styles/         factory-game.css (BEM-ähnlich, Präfix fi-)
```

### `src/core/` — Sunflower-Land-Kern **[Vorgabe]**

Dieser Ordner gehört zum Sunflower-Land-Portal-Framework. **Nicht verändern.**
Falls eine Änderung dort nötig scheint: zuerst beim Projektverantwortlichen nachfragen.

### Was gehört wohin

| Inhalt                        | Zielort                                      |
|-------------------------------|----------------------------------------------|
| Neues Rezept                  | `src/game/simulation/recipes/<Typ>Recipes.ts`, Re-Export in `index.ts` |
| Neue Maschinen-Logik          | `game.ts` (State-Interface, Konstanten, Reducer-Case) |
| Neues UI-Panel                | `src/game/ui/panels/<MaschinenName>Panel.tsx` |
| Debug-Hilfsfunktionen         | `src/game/debug/mockData.ts` oder eigene Datei in `debug/` |
| Sprite-Mapping                | `src/game/assets/sprites/sprites.ts`         |
| Timer/Tick-Registrierung      | `FactoryApp.tsx`                             |

### Was gehört **nicht** wohin

- Rezepte außerhalb von `simulation/recipes/` **[Vorgabe]**
- Spiellogik in Panel-Komponenten (Panels leiten nur `dispatch` weiter) **[Code]**
- Globale Singletons oder Stores außerhalb von React-State **[Vorgabe]**

---

## 3. Architekturregeln

### 3.1 Rezepte

- Alle Rezepte liegen in `src/game/simulation/recipes/` **[Vorgabe]**
- Jeder Rezept-Typ hat eine eigene Datei (z. B. `SmeltingRecipes.ts`) **[Code]**
- Alle Rezepte werden via `recipes/index.ts` re-exportiert **[Code]**
- Maschinen importieren Rezepte ausschließlich aus `"./recipes"` (Barrel) **[Code]**
  ```ts
  // ✅ korrekt
  import { getSmeltingRecipe, SMELTING_RECIPES } from "./recipes";
  // ❌ falsch
  import { getSmeltingRecipe } from "./recipes/SmeltingRecipes";
  ```

### 3.2 Maschinen-Architektur

**Auto-Miner ist die technische Referenz für neue automatische Maschinen** **[Vorgabe]**

| Regel | Beleg |
|---|---|
| Jede automatische Maschine ist ein Energie-Verbraucher und muss in `ENERGY_DRAIN` registriert werden | `ENERGY_DRAIN` in `game.ts` **[Code]** |
| Input- und Output-Felder müssen klar identifizierbar sein (IO-Zellen-Funktion analog `getAutoSmelterIoCells`) | **[Vorgabe]** |
| Platzierungsvalidierung ist Pflicht (Kollisionscheck vor `placeAsset`) | `placeAsset()` in `game.ts` **[Code]** |
| Jede produzierende Maschine hat einen Input-Buffer (z. B. `inputBuffer: ConveyorItem[]`) | `AutoSmelterEntry.inputBuffer` **[Code]** |
| Output blockiert wenn Ziel-Tile voll ist (`OUTPUT_BLOCKED`-Status) | `AutoSmelterStatus` **[Code]** |
| Items ohne passendes Rezept blockieren die Maschine (`MISCONFIGURED`) | `AutoSmelterStatus` **[Code]** |
| Unter 50 % Energieversorgung: Drosselung; bei 0 %: Stopp | `machinePowerRatio` in `GameState` **[Code]** |
| Jede Maschine hat ein klickbares UI-Panel (zeigt Zustand, Durchsatz, Energieverbrauch) | alle `*Panel.tsx`-Dateien **[Code]** |
| Jede neue automatische Maschine bekommt eine Debug-Funktion mit vollständigem Test-Setup in `createInitialState("debug")` | Debug-Setup in `game.ts` **[Vorgabe]** |

### 3.3 Maschinenzustände (Mindestanforderung) **[Vorgabe]**

Jede automatische Maschine muss mindestens diese Zustände haben:
```ts
type MachineStatus =
  | "IDLE"           // Läuft, wartet auf Input
  | "PROCESSING"     // Verarbeitet aktiv
  | "OUTPUT_BLOCKED" // Output-Tile voll
  | "NO_POWER"       // Keine Stromversorgung
  | "MISCONFIGURED"; // Kein Rezept oder falscher Input
```
Vorlage: `AutoSmelterStatus` in `game.ts` **[Code]**

### 3.4 Gebäudegrößen **[Code]**

| Größe    | Gebäude                                                                 |
|----------|-------------------------------------------------------------------------|
| 2×2      | workbench, warehouse, smithy, generator, battery, manual_assembler     |
| 2×1 rotierbar | auto_smelter (`width=2, height=1`, orientierbar via `direction`) |
| 1×1      | cable, power_pole, auto_miner, conveyor, conveyor_corner               |

Faustregel: Große passive Gebäude = 2×2; aktive Automaten = 2×1 rotierbar oder 1×1.

### 3.5 Konstanten statt Magic Numbers **[Code]**

Alle Werte müssen als benannte Konstanten in `game.ts` definiert werden.
Beispiele die bereits vorhanden sind:
```ts
CELL_PX, GRID_W, GRID_H, CONVEYOR_TILE_CAPACITY,
BATTERY_CAPACITY, POWER_POLE_RANGE,
AUTO_SMELTER_BUFFER_CAPACITY,
AUTO_SMELTER_IDLE_ENERGY_PER_SEC, AUTO_SMELTER_PROCESSING_ENERGY_PER_SEC,
LOGISTICS_TICK_MS, AUTO_MINER_PRODUCE_TICKS, ENERGY_NET_TICK_MS
```

### 3.6 Energie-Netz

- Energienetz wird per BFS berechnet: Phase 1 Kabel-Adjacency, Phase 2 Power-Pole-Reichweite (Chebyshev, `POWER_POLE_RANGE = 3`) **[Code]**
- Kein zentraler Energie-Pool — Batterien sind der einzige Speicher **[Code]** (Kommentar in `GameState`)
- Generator benötigt Steinboden (`REQUIRES_STONE_FLOOR`) **[Code]**
- `machinePowerRatio[id]` gibt den aktuellen Versorgungsgrad jeder Maschine (0–1) an **[Code]**
- Neue Energie-Verbraucher müssen in `ENERGY_DRAIN` (in `game.ts`) eingetragen werden **[Code]**

### 3.7 Prioritätssystem **[Code]**

```ts
type MachinePriority = 1 | 2 | 3 | 4 | 5; // 1 = höchste Priorität
const DEFAULT_MACHINE_PRIORITY = 3;
```
Jeder Energy-Consumer bekommt beim Platzieren automatisch `priority: DEFAULT_MACHINE_PRIORITY` via `withDefaultMachinePriority()`.

### 3.8 Förderband / Logistik **[Code]**

- Förderbänder haben eine maximale Queue-Kapazität: `CONVEYOR_TILE_CAPACITY = 4`
- Lagerhaus-Input: genau eine Eingangs-Zelle (`x: warehouse.x, y: warehouse.y + height`), Richtung muss `"north"` sein (`isValidWarehouseInput()`)
- Takt: `LOGISTICS_TICK_MS = 500` ms

---

## 4. Bestehende Systeme

### Grid **[Code]**
- `Grid.tsx`: React-Komponente, rendert das Spielfeld als absolute-positionierte Divs
- Kamera: Pan via Maus-Drag, Zoom via Mausrad, beide via CSS `transform`
- Richtungsauswahl beim Platzieren: `buildDirection` (State im Grid, R-Taste zum Wechseln)

### Energie-Netz **[Code]**
- `computeConnectedAssetIds()` berechnet alle verbundenen Assets (2-Phasen-BFS)
- `ENERGY_NET_TICK_MS = 2000` ms Takt-Intervall
- `EnergyDebugOverlay.tsx` + `EnergyDebugHud`: visuelle Debug-Darstellung der Netzwerktopologie (nur DEV)
- `energyDebugOverlay: boolean` in `GameState` steuert die Sichtbarkeit

### Förderbänder **[Code]**
- `conveyor` (1×1 gerade) und `conveyor_corner` (1×1 Ecke)
- Pro Asset-ID: `ConveyorState { queue: ConveyorItem[] }`
- Beide sind Energie-Verbraucher (`ENERGY_DRAIN.conveyor = 1`)

### Auto-Miner **[Code]** (Referenz-Implementierung)
- 1×1, wird direkt auf ein Deposit-Tile (stone/iron/copper_deposit) platziert
- Deposits sind 2×2, fix, nicht abbaubar
- Pro Asset-ID: `AutoMinerEntry { depositId, resource, progress }`
- Produktionstakt: `AUTO_MINER_PRODUCE_TICKS = 6` Logistics-Ticks = 3 Sekunden
- Schiebt Items in die Queue des benachbarten Förderbands (Richtung = Ausgabe-Seite)

### Auto Smelter **[Code]**
- 2×1 rotierbar, hat Input- und Output-Seite (via `getAutoSmelterIoCells()`)
- `AutoSmelterEntry`: `inputBuffer`, `processing`, `pendingOutput`, `status`, `throughputEvents`
- Rezept-Auswahl im Panel (`selectedRecipe: "iron" | "copper"`)
- Durchsatz: rolling window der letzten 60 s via `throughputEvents: number[]`

### Lagerhaus **[Code]**
- 2×2, max. 2 Stück (`MAX_WAREHOUSES = 2`)
- Separate Inventar-Instanzen: `warehouseInventories: Record<string, Inventory>`
- Kapazität: `WAREHOUSE_CAPACITY = 20` pro Ressource (Infinity im Debug-Modus)

### Manuelle Schmiede (Smithy) **[Code]**
- 2×2, direkter Betrieb via UI-Panel
- `SmithyState` enthält Treibstoff, Input-Material, Fortschritt, Output
- Takt: `SMITHY_TICK_MS = 100` ms, Prozessdauer: `SMITHY_PROCESS_MS = 5000` ms

### Debug-System **[Code]**
- Komplett tree-shaken in Production via `import.meta.env.DEV`
- Mock-Presets: `DEBUG_MOCK_RESOURCES`, `DEBUG_MOCK_TOOLS`, `DEBUG_MOCK_BUILDINGS`, `DEBUG_MOCK_ALL`
- HMR: State über `window.__FI_HMR_STATE__` gespeichert, wird nach Hot-Reload wiederhergestellt
- Debug-Modus (`GameMode = "debug"`): startet mit vollem Inventar und deterministischem Test-Setup
  (Auto-Miner → 3 Förderbänder → Auto Smelter → 3 Förderbänder → Lagerhaus, 2 Generatoren + Pole)
- Logger-Kategorien: `"Building" | "Inventory" | "Mining" | "Warehouse" | "Hotbar" | "Smithy" | "HMR" | "Mock" | "General"`

---

## 5. Konventionen

### Dateinamen **[Code]**

| Typ               | Konvention               | Beispiel                  |
|-------------------|--------------------------|---------------------------|
| React-Komponente  | PascalCase `.tsx`        | `AutoSmelterPanel.tsx`    |
| Reine Logik       | camelCase `.ts`          | `debugLogger.ts`          |
| Rezept-Datei      | PascalCase + "Recipes"   | `SmeltingRecipes.ts`      |
| Barrel-Export     | `index.ts`               | `recipes/index.ts`        |
| CSS               | kebab-case               | `factory-game.css`        |

### CSS-Klassen **[Code]**
- Präfix `fi-` für alle Factory-Island-Klassen (z. B. `fi-panel`, `fi-btn`, `fi-hotbar-slot`)

### State-Updates **[Code]**
- Reducer ist eine reine Funktion: nie `state` direkt mutieren
- Jede Aktion im `GameAction`-Union-Typ registrieren
- Tick-Aktionen kommen aus `setInterval` in `FactoryApp.tsx`

### Registrierung eines neuen Energie-Verbrauchers **[Code]** + **[Vorgabe]**

1. Typ zu `AssetType` und ggf. `BuildingType` in `game.ts` hinzufügen
2. In `ENERGY_DRAIN` eintragen: `{ meine_maschine: <Verbrauch pro ENERGY_NET_TICK_PERIOD> }`
3. `BUILDING_SIZES`, `BUILDING_COSTS`, `BUILDING_LABELS`, `ASSET_LABELS`, `ASSET_COLORS`, `ASSET_EMOJIS` ergänzen
4. `GameState` um ein Eintrags-Record erweitern (z. B. `meinejMaschinen: Record<string, MeineMaschineEntry>`)
5. Reducer-Case für `LOGISTICS_TICK` / `ENERGY_NET_TICK` implementieren
6. Panel erstellen und in `FactoryApp.tsx` einbinden
7. Debug-Setup in `createInitialState("debug")` ergänzen

### Referenz für neue automatische Maschinen **[Vorgabe]**
→ Immer `AutoSmelterEntry` + `AutoSmelterStatus` als Vorlage verwenden.

---

## 6. Verboten

| Regel | Typ |
|---|---|
| Kein globales State-Management (kein Redux, Zustand, Context-Store) außerhalb von React-`useReducer` | **[Vorgabe]** |
| Keine neuen npm-Abhängigkeiten ohne Rücksprache mit dem Projektverantwortlichen | **[Vorgabe]** |
| Keine Rezepte außerhalb von `src/game/simulation/recipes/` | **[Vorgabe]** |
| Keine still verworfenen Items — Items die nicht weiterverarbeitet werden können müssen `MISCONFIGURED` oder `OUTPUT_BLOCKED` auslösen | **[Vorgabe]** |
| Keine mehreren Features in einer einzigen Aufgabe/PR | **[Vorgabe]** |
| `src/core/` nicht verändern — das ist Sunflower Land Framework-Code | **[Vorgabe]** |
| Keine Magic Numbers — alle Werte als benannte Konstanten in `game.ts` | **[Code + Vorgabe]** |
| Keine Spiellogik in Panel-Komponenten — Panels nur `dispatch` und props darstellen | **[Code]** |
| Debug-Code niemals ohne `import.meta.env.DEV`-Guard schreiben | **[Code]** |

---

## 7. Risiken & Stolperfallen

Diese Punkte sind direkt aus dem Code ablesbar und haben in der Vergangenheit oder
potenziell zu Fehlern geführt:

### State-Normalisierung beim Laden **[Code]**
`normalizeLoadedState()` in `FactoryApp.tsx` repariert inkompatible Saves.
Wenn neue Felder in `GameState` eingeführt werden, muss diese Funktion angepasst werden,
sonst laden alte Saves ohne das neue Feld und der Code crasht.

### Asset-Dimensionen: `width`/`height` vs. `size` **[Code]**
`PlacedAsset` hat `size: 1 | 2` UND optionale `width?: 1 | 2` / `height?: 1 | 2`.
Immer `assetWidth(asset)` / `assetHeight(asset)` (via `asset.width ?? asset.size`) verwenden,
nie direkt `asset.size` für Größenberechnungen. Beispiel: Auto Smelter hat `size=2, width=2, height=1`.

### IO-Zellen müssen zur `direction` passen **[Code]**
Rotierbare Maschinen (auto_smelter, auto_miner, conveyor) lesen ihre Nachbarzellen via
`direction`. Wird `direction` nicht gesetzt, greift der Default `"east"`, was falsche IO-Zellen ergibt.

### Förderbänder müssen in `conveyors`-Record eingetragen werden **[Code]**
Beim Platzieren eines Förderbands muss `conveyors[id] = { queue: [] }` gesetzt werden,
sonst wird es im Logistics-Tick ignoriert.

### `connectedAssetIds` ist berechneter State, kein persistierter **[Code]**
Wird bei `createInitialState` neu berechnet. Beim Laden aus localStorage muss
`computeConnectedAssetIds()` erneut aufgerufen werden (bereits in `normalizeLoadedState` berücksichtigt).

### Generator benötigt Steinboden **[Code]**
`REQUIRES_STONE_FLOOR` enthält `"generator"`. Platzierungsvalidierung prüft das — neue
Gebäude die Steinboden benötigen müssen dort eingetragen werden.

## Verbindliche Architekturregeln

Diese Regeln sind strikt einzuhalten.

### Rollenverteilung
- Phaser rendert **ausschließlich** die Spielwelt.
- React rendert **ausschließlich** UI und erlaubte Overlays.
- Warehouse-Marker bleiben in React.
- Steinboden, Gras, Tilemaps und andere Welt-Layer gehören zu Phaser.

### Transform-Grenze
- Die gemeinsame World-Transform ist **nur** in `Grid.tsx` definiert.
- `PhaserHost` und alle React-World-Overlays müssen exakt dieselbe Transform-Basis verwenden.
- Es darf keine zweite Kamera-, Zoom- oder Offset-Logik für dieselbe Welt geben.
- Transform-Logik darf nicht dupliziert oder an anderer Stelle nachgebaut werden.

### Rendering-Regeln
- Es darf niemals zwei aktive Renderpfade für denselben visuellen Weltinhalt geben.
- React darf keine Welt-Tiles rendern, wenn Phaser dafür zuständig ist.
- Phaser darf keine UI-Overlays rendern, wenn React dafür zuständig ist.
- Jede neue visuelle Komponente muss klar einer Seite zugeordnet werden: Phaser oder React.

### Overlay-Regeln
- React-Overlays müssen innerhalb des gemeinsamen World-Roots liegen.
- Overlays dürfen keine eigene Welt-Transform besitzen.
- Nicht-interaktive Overlay-Layer müssen explizit als solche markiert sein.
- Pointer-Verhalten darf keine stillschweigende Nebenwirkung sein, sondern muss bewusst festgelegt werden.

### Änderungspflicht
Vor jeder Änderung an Welt-, Overlay- oder Transform-Code gilt:
1. Zuständigkeit klären.
2. Renderpfad festlegen.
3. Transform-Basis prüfen.
4. Doppelrendering ausschließen.
5. Nur dann ändern.

### Verbote
- Kein paralleler Steinboden-Renderpfad in React.
- Kein zweiter World-Root.
- Kein impliziter Fallback-Renderer.
- Keine versteckte Kamera-Synchronisierung an mehreren Stellen.
- Keine Mischzustände ohne klare Begründung.

### Ziel
- Phaser = Welt.
- React = UI/Overlay.

