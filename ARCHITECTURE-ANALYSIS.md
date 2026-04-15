# Factory Island – Rendering & Energy Architecture Analyse

**Datum:** 15. April 2026  
**Fokus:** Rendering-Architektur, Cable/Generator/Battery, Energy-Netz, Abhängigkeiten

---

## 1. Aktuelle Rendering-Architektur

### 1.1 Zweischichtiges Rendering-System

Die Spielwelt nutzt eine **Hybrid-Architektur** mit zwei parallelen Systemen:

| Layer | Verantwortung | Technologie | Frames |
|-------|---------------|-------------|--------|
| **Phaser** | Welt-Hintergrund (Gras, Steinboden), statische Ressourcen (Deposits, Bäume) | Canvas, Tilemaps | 30 FPS |
| **React** | Gebäude, UI, Overlays, Interaktionen | DOM + CSS Transform | React-getaktet |

**Wichtig:** Beide Renderer arbeiten auf derselben visuellen Welt. Der Phaser-Canvas wird mit `transparent: true` initialisiert und hat `pointerEvents: "none"`, damit React die Clicks abfängt.

### 1.2 Phaser-Setup (WorldScene)

**Datei:** `src/game/world/PhaserGame.ts`

```ts
// Scene name: "WorldScene"
class WorldScene extends Phaser.Scene {
  // Zwei Tilemap-Layer für die Welt:
  - floorLayer    // Steinboden (dynamisch via applyFloorMap())
  - grassLayer    // Gras-Checkerboard (statisch)
  
  // Statische Welt-Assets (nicht interaktiv):
  - staticAssetNodes: Map<string, Phaser.GameObjects.Container>
    Enthält: deposits, trees, saplings, map_shop etc.
}
```

**Event-Kommunikation React → Phaser:**
- `FLOOR_MAP_EVENT` ("floorMapChanged") – Pushed FloorMapData Snapshot
- `STATIC_ASSETS_EVENT` ("staticAssetsChanged") – Pushed StaticAssetSnapshot[]

**Größe:** `GAME_W = 5120px, GAME_H = 3200px` (80×50 Tiles × 64px)

### 1.3 React Grid-Rendering

**Datei:** `src/game/grid/Grid.tsx`

Die React Grid ist die **Hauptinteraktionsschicht**. Sie rendert:

1. **Gebäude & Machine** als absolute-positionierte `<div>` mit Sprite-Images
2. **UI-Overlays** (Warehouse-Marker, Auto-Smelter Input/Output-Boxen)
3. **Energie-Debug Overlays** (EnergyDebugOverlay.tsx)
4. **Kamera** via CSS Transform (Pan + Zoom)

**Transform-Basis (einziger Ort!):**
```ts
const WORLD_W = GRID_W * CELL_PX; // 5120px
const WORLD_H = GRID_H * CELL_PX; // 3200px

// Container-DIV mit:
style={{ 
  transform: `translate(${cam.x}px, ${cam.y}px) scale(${zoom})`,
  transformOrigin: "0 0"
}}
```

PhaserHost.tsx nutzt denselben Container-System, um die Canvas auf derselben Transform zu platzieren.

### 1.4 Viewport-Culling

Grid.tsx rendert nur Assets die sichtbar sind:
```ts
const minCellX = Math.max(0, Math.floor(worldX1 / CELL_PX) - 1);
const minCellY = Math.max(0, Math.floor(worldY1 / CELL_PX) - 1);
const maxCellX = Math.min(GRID_W - 1, Math.ceil(worldX2 / CELL_PX) + 1);
const maxCellY = Math.min(GRID_H - 1, Math.ceil(worldY2 / CELL_PX) + 1);
```

---

## 2. Cable, Generator, Battery – Aktuelle Rendering

### 2.1 Assets-Übersicht

| Asset | Typ | Größe | Rendering | Panel |
|-------|-----|-------|-----------|-------|
| **cable** | AssetType | 1×1 | React Grid | Kein eigenes Panel |
| **generator** | AssetType + State | 2×2 | React Grid | GeneratorPanel.tsx |
| **battery** | AssetType + State | 2×2 | React Grid | BatteryPanel.tsx |
| **power_pole** | AssetType | 1×1 | React Grid | PowerPolePanel.tsx |

### 2.2 Sprite-Definition

**Datei:** `src/game/assets/sprites/sprites.ts`

Alle Sprites sind **SVG data-URIs** (32×32 für 1×1, 64×64 für 2×2):

**Carbon:**
```ts
function makeCable(): string {
  let s = "";
  // Schwarze/dunkelrote Isolierung mit gelben Streifen
  s += r(4, 12, 24, 8, "#3a2020");  // Kern
  s += r(8, 12, 16, 8, "#c44040");  // Rot
  s += r(10, 14, 12, 4, "#ffd700"); // Gelbe Streifen
  return svgURI(32, 32, s);
}

function makeGenerator(): string {
  // Metallbox mit Chimney, Brennstoff-Slot, rote/orange Farbtöne
  // ~220 Zeilen Pixelart-Rechtecke
}

function makeBattery(): string {
  // Blaue Metallbox mit grünen Lade-Balken (3 Ebenen)
  // Terminals oben, +/− Symbole an den Seiten
  // ~220 Zeilen Pixelart-Rechtecke
}

function makePowerPole(): string {
  // Grauer/silberner Mast mit Querbalken, rote/grüne Lichter
  // Zeigt Konnektivitätsstatus via Border im Render
}
```

**Export:** `ASSET_SPRITES: Record<AssetType, string>` – enthält alle data-URIs

### 2.3 React Rendering (Grid.tsx)

Die Assets werden so gerendert:

```tsx
assetElements.push(
  <div
    key={asset.id}
    style={{
      position: "absolute",
      left: px,
      top: py,
      width: w,
      height: h,
    }}
  >
    <img
      src={ASSET_SPRITES[asset.type]}
      alt={label}
      style={{
        width: w - 4,
        height: h - 16,
        imageRendering: "pixelated",
        
        // ▼ POWER POLE: SPEZIAL-STYLING ▼
        border: isPowerPole
          ? `2px solid ${isConnected ? "rgba(0,255,100,0.9)" : "rgba(255,80,80,0.7)"}`
          : "none",
        borderRadius: isPowerPole ? 6 : 0,
        boxShadow: isPowerPole && isConnected
          ? "0 0 8px rgba(0,255,100,0.5)"
          : "0 2px 6px rgba(0,0,0,0.3)",
        filter: isPowerPole && !isConnected ? "saturate(0.5)" : "none",
      }}
    />
    
    {/* Label unter dem Asset */}
    <span style={{ fontSize: 9, color: "#fff", background: "rgba(0,0,0,0.6)" }}>
      {label}
    </span>
  </div>
);
```

**Konnektivitäts-Visualisierung:**
- ✅ **Verbunden:** Grüner Border (`rgba(0,255,100,0.9)`) + Glow
- ❌ **Nicht verbunden:** Roter Border (`rgba(255,80,80,0.7)`) + desaturiert

---

## 3. Energy-Netz & Konnektivität

### 3.1 computeConnectedAssetIds() – Zweiphasen-BFS

**Datei:** `src/game/simulation/game.ts`, Zeile 911–1000

```ts
export function computeConnectedAssetIds(state: Pick<GameState, "assets" | "cellMap">): string[] {
  // Phase 1: Cable BFS – verfolgt Kabel, Generator und Power Poles
  // Phase 2: Power-Pole Range BFS – Chebyshev-Distanz (Max(dx, dy) ≤ POWER_POLE_RANGE)
  
  return [...connected]; // Set aller Mesh-Assets
}
```

**Phase 1 (Kabel-Konnektivität):**
1. Seed vom Generator `asset.type === "generator"`
2. BFS über Nachbar-Zellen
3. Folge nur: `cable`, `generator`, `power_pole`
4. **Ergebnis:** `cableConnected` = alle Kabel/Poles die elektrisch mit Generator verbunden sind

**Phase 2 (Pole-Bereich):**
1. Für jeden Power Pole in `cableConnected`
2. Finde alle Assets innerhalb `POWER_POLE_RANGE` (Chebyshev-Distanz, default `= 3`)
3. Markiere diese als **connected**, auch ohne Kabel
4. Neue Poles in dieser Menge → verbreiten ihre Range über BFS

### 3.2 State-Verwaltung

**Datei:** `src/game/simulation/game.ts`

```ts
interface GameState {
  connectedAssetIds: string[];        // Hauptfeld – alle Assets im Netz
  assets: Record<string, PlacedAsset>; // Alle Assets (position, type, ...)
  cellMap: Record<string, string>;    // Schneller Lookup: cellKey(x,y) → assetId
  
  // Energy-spezifische State
  generator: GeneratorState;          // fuel, progress, running
  battery: BatteryState;              // stored, capacity
  
  machinePowerRatio: Record<string, number>; // 0–1 pro Machine-ID
  poweredMachineIds?: string[];       // Scheduler output: welche Machines bekommen Strom
}

interface GeneratorState {
  fuel: number;                       // Holz im Tank
  progress: number;                   // 0–1 (Verbrauch pro Tick)
  running: boolean;                   // Läuft der Generator?
}

interface BatteryState {
  stored: number;                     // Aktuelle Energie
  capacity: number;                   // Max Speica (BATTERY_CAPACITY = 1000)
}
```

### 3.3 Energy-Netz-Ticks

**ENERGY_NET_TICK_MS = 2000 ms** (alle 2 Sekunden)

```ts
// In FactoryApp.tsx:
const energyNetTick = () => {
  dispatch({ type: "ENERGY_NET_TICK" });
};

useEffect(() => {
  const timer = setInterval(energyNetTick, ENERGY_NET_TICK_MS);
  return () => clearInterval(timer);
}, [dispatch]);
```

**ENERGY_NET_TICK Action-Handler** (game.ts ~2040):
1. Berechne `connectedAssetIds` neu (falls Assets hinzugefügt/entfernt)
2. Prüfe: Ist Generator mit Pole verbunden? (`genConnectedToPole`)
3. Berechne **Produktion**: 
   ```
   production = state.generator.running && genConnectedToPole
     ? GENERATOR_ENERGY_PER_TICK * ticksPerPeriod
     : 0
   ```
4. Sammle **Verbraucher** (Assets mit `ENERGY_DRAIN[type]`)
5. Scheduling: Verteile Energie nach Priorität (`priority: 1–5`)
6. Update Battery + `machinePowerRatio`

### 3.4 ENERGY_DRAIN Mapping

**Datei:** `src/game/simulation/game.ts`, Zeile 524–553

```ts
export const ENERGY_DRAIN: Record<string, number> = {
  cable: 0,              // Kein Verbrauch
  power_pole: 0,         // Kein Verbrauch
  battery: 0,            // Speicher, kein Verbrauch
  generator: 0,          // Quelle
  
  auto_miner: 2,         // pro ENERGY_NET_TICK_PERIOD
  conveyor: 1,           // pro ENERGY_NET_TICK_PERIOD
  conveyor_corner: 1,
  
  smithy: 0,             // Benötigt kein Strom (uses Holz)
  workbench: 0,          // Benötigt kein Strom (uses Holz)
  warehouse: 0,          // Kein Verbrauch
  
  auto_smelter: 1,       // 1 pro Tick (setzt sich fort)
  manual_assembler: 0,   // Manuell, kein Verbrauch
};

// Helper:
export function isEnergyConsumer(type: AssetType): boolean {
  return ENERGY_DRAIN[type] != null;
}
```

### 3.5 Energy-Debug-Overlay

**Datei:** `src/game/ui/panels/EnergyDebugOverlay.tsx`

Rein visuelle Überlagerung (nur wenn `state.energyDebugOverlay === true`):

```tsx
<svg style={{ position: "absolute", zIndex: 15, pointerEvents: "none" }}>
  {/* Power-Pole Reichweite Circles */}
  {allPoles.map(pole => (
    <circle
      cx={pole.x * CELL_PX + CELL_PX / 2}
      cy={pole.y * CELL_PX + CELL_PX / 2}
      r={POWER_POLE_RANGE * CELL_PX + CELL_PX / 2}
      fill={isActive ? "rgba(59,130,246,0.07)" : "rgba(156,163,175,0.06)"}
      stroke={isActive ? "rgba(59,130,246,0.35)" : "rgba(156,163,175,0.25)"}
      strokeDasharray="8 4"
    />
  ))}
  
  {/* Consumer Status: Grün=Powered, Rot=Nicht verbunden, Gelb=Unter-versorgt */}
  {/* Generator/Cable Verbindungs-Linien */}
</svg>
```

---

## 4. Abhängigkeiten

### 4.1 React ↔ Game State

**Leserichtung:**
- Grid.tsx: Liest `state.assets`, `state.connectedAssetIds`, `state.energyDebugOverlay`
- Panels (GeneratorPanel, BatteryPanel, PowerPolePanel): Lesen State
- EnergyDebugOverlay: Liest `connectedAssetIds`, `poweredMachineIds`, `machinePowerRatio`

**Schreibrichtung:**
- Alle Änderungen gehen über `dispatch(action)` in den `gameReducer`
- Keine React-Logik modifiziert State direkt

### 4.2 React ↔ Phaser

**Normal:**
- Phaser rendert nur Welt-Layer (Gras, Steinboden, statische Ressourcen)
- React rendert Gebäude + UI
- Beide verwenden dieselbe CSS Transform für Pan/Zoom

**Event-Kommunikation:**
- `PhaserHost.tsx` emittet Events bei `floorMap` / `staticAssets` Änderung
- `WorldScene` empfängt und aktualisiert Tilemaps/Sprites

**Pointer-Events:**
- `canvas { pointer-events: none }` → React Grid fängt alle Clicks ab
- Kein Cross-Interference

### 4.3 State-Properties die Rendering beeinflussen

| Property | Leser | Zweck |
|----------|-------|-------|
| `assets` | Grid.tsx | Alle Assets rendern |
| `connectedAssetIds` | Grid.tsx, EnergyDebugOverlay | Energie-Status visuell anzeigen |
| `generator.running` | GeneratorPanel | UI-Status |
| `battery.stored` | BatteryPanel | UI-Anzeige |
| `conveyors[assetId].queue` | Grid.tsx | Item-Punkte auf Bändern |
| `autoMiners[assetId].progress` | Grid.tsx | Fortschritts-Bar |
| `autoSmelters[assetId].status` | Grid.tsx | Status-Indikator (Farbe) |
| `energyDebugOverlay` | Grid.tsx, EnergyDebugOverlay | Debug-Overlay ein/aus |
| `cellMap` | Grid.tsx, computeConnectedAssetIds | Schneller Asset-Lookup |

### 4.4 Panel-Abhängigkeiten

```
PowerPolePanel.tsx
├─ state.selectedPowerPoleId
├─ state.assets (zum Lesen der Pole-Position)
├─ state.connectedAssetIds (Verbindungs-Status)
└─ dispatch für interaktive Features

GeneratorPanel.tsx
├─ state.generator
├─ state.inventory
├─ state.connectedAssetIds (genConnectedToPole Check)
└─ dispatch für Brennstoff-Buttons

BatteryPanel.tsx
├─ state.battery
├─ state.connectedAssetIds
├─ state.generator.running (für Bilanz-Berechnung)
└─ (read-only, kein dispatch nötig in aktueller Version)
```

### 4.5 Platzierungs-Validierung

Bevor Cable/Generator/Battery platziert werden (in `gameReducer`):

```ts
case "BUILD_PLACE_BUILDING":
  const placeError = placeAsset(state, action.x, action.y, action.buildingType, action.direction);
  if (placeError) return state; // Fehler → nicht platzieren
  
  // Nach erfolgreichem Platz:
  const newState = { ...state, assets: newAssets, cellMap: newCellMap };
  // Energie-Netz neu berechnen
  return { ...newState, connectedAssetIds: computeConnectedAssetIds(newState) };
```

---

## 5. Rendering-Pipeline – Zusammengefasst

### Tick-Ablauf (20ms React-Render-Cycle)

1. **GameReducer** verarbeitet Actions
   - Assets hinzufügen/entfernen? → `cellMap` + `connectedAssetIds` updaten

2. **React re-render** (nur wenn State ≠)
   - Grid.tsx berechnet Viewport-Culling
   - Für jeden sichtbaren Asset: `<img src={sprite} />` rendern
   - Für Power Poles: spezial Border/Glow basierend auf `isConnected`
   - EnergyDebugOverlay: SVG-Overlay rendern (wenn aktiv)

3. **CSS Transform** wird angewendet
   - Alle absolut-positionierten Assets verschieben sich mit der Kamera

4. **Phaser Canvas** bleibt Static
   - WorldScene rendert Gras + Steinboden kontinuierlich
   - Canvas ist transparent, sitzt unter/hinter React-Grid

### 2-Sekunden-Cycle (ENERGY_NET_TICK)

1. **ENERGY_NET_TICK Action**
   - `connectedAssetIds` neu berechnen
   - Generator/Battery Zustand updaten
   - Consumer-Scheduler auführen
   - `machinePowerRatio` updaten

2. **React re-render**
   - Panels aktualisieren Anzeigen
   - Power-Pole Borders evtl. Farbe wechseln

---

## 6. Kritische Erkenntnisse & Stolperfallen

### ✅ Was funktioniert gut

1. **Viewport-Culling** reduziert DOM-Knoten drastisch
2. **CSS Transform** ist sehr performant für Pan/Zoom
3. **SVG data-URIs** für Sprites sparen HTTP-Requests
4. **Two-Phase BFS** berechnet Netz korrekt
5. **Event-basierte Phaser-Kommunikation** verhindert Tight Coupling

### ⚠️ Stolperfallen

| Problem | Grund | Lösung |
|---------|-------|--------|
| **connectedAssetIds wird nicht aktualisiert** | `computeConnectedAssetIds()` nicht aufgerufen nach Platzieren/Entfernen | Muss in jedem Build/Remove-Case sein |
| **Power Pole Rendering flackert** | CSS Transform Scale mit floating-point Zoom → pixelated Tiles verschieben sich | Verwende `Math.round()` für Transform-Werte |
| **Cable visuell nicht sichtbar** | Dünnes 1×1 Sprite, kann beim Zoomen verloren gehen | Debug-Overlay hilft, oder thicker Sprite |
| **Energy-Netz desynchronisiert** | Lokale Berechnung vs. zentrale Berechnung | Immer `ENERGY_NET_TICK_MS = 2000` konsistent halten |
| **Assets rendern über Schnittstellen** | Z-index Layering nicht klar | Grid.tsx nutzt `zIndex: 2` für Assets, PhaserHost `zIndex: 0` |

### 🎯 Zukünftige Überlegungen

1. **Phaser → React Migration**: Deposits/Trees in React verschieben? (Warnung: Asset-Count ↑ massiv)
2. **Instanziierung vs. Batching**: Viele Cables einzeln rendern vs. als Tiling-Layer?
3. **Energy-Visualisierung**: Pfeile für Stromfluss? (aufwendig, aber visuell herrlich)

---

## Appendix: File-Schnell-Referenz

| Datei | Zweck |
|-------|-------|
| `src/game/entry/FactoryApp.tsx` | App-Root, Ticks, State-Management |
| `src/game/grid/Grid.tsx` | Haupt-Render-Engine, Kamera, Asset-Rendering |
| `src/game/world/PhaserHost.tsx`, `PhaserGame.ts` | Phaser-Wrapper, Canvas, Tilemaps |
| `src/game/simulation/game.ts` | State-Typen, Reducer, `computeConnectedAssetIds()` |
| `src/game/assets/sprites/sprites.ts` | SVG-Sprite-Definitionen |
| `src/game/ui/panels/{Generator,Battery,PowerPole}Panel.tsx` | UI-Panels |
| `src/game/ui/panels/EnergyDebugOverlay.tsx` | Debug-Visualisierung |
| `src/game/debug/mockData.ts` | Test-Setup mit allen Assets |

---

**Ende der Analyse.**
