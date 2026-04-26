# `src/game` — Architektur-Karte

> AI-orientierte Übersicht. Ziel: in <10 Min ein tragfähiges Mentalmodell aufbauen.
> **Stand:** generiert; bei Konflikten gilt der Code.

---

## Purpose

Browser-basiertes Factory-Game. React-UI + React-`useReducer` als Single-Source-of-Truth + Phaser für World-Rendering. Alles deterministisch, Tick-getrieben, persistiert in `localStorage`.

---

## Reading Order

Für Onboarding genau in dieser Reihenfolge:

1. [`src/game/ARCHITECTURE.md`](./ARCHITECTURE.md) ← du bist hier
2. [`entry/FactoryApp.tsx`](./entry/FactoryApp.tsx) — alle `setInterval`-Tick-Dispatches sichtbar
3. [`store/types.ts`](./store/types.ts) — `GameState`-Shape (Zeile 432+) + alle Sub-Typen
4. [`store/reducer.ts`](./store/reducer.ts) ab Zeile 1332 — `gameReducer`-Dispatcher
5. [`store/game-actions.ts`](./store/game-actions.ts) — `GameAction`-Union (kanonische Quelle nach Wave 3; `actions.ts` und `reducer.ts` re-exportieren nur)
6. [`crafting/README.md`](./crafting/README.md) — Job-Lifecycle (komplexestes Subsystem)
7. Cluster-Header in [`store/action-handlers/*/index.ts`](./store/action-handlers/) je nach Aufgabe

---

## Main Runtime Flow

```
main.factory.tsx
  └─ FactoryApp.tsx
       ├─ ModeSelect (debug | release)
       └─ GameInner (key=mode)
            ├─ useReducer(gameReducer | gameReducerWithInvariants)
            │     state: GameState  •  dispatch: (GameAction) => void
            ├─ ~10× setInterval → dispatch({type: "X_TICK"})   (s. Tick Pipeline)
            ├─ localStorage save (alle 10 s + beforeunload)
            ├─ HMR-State-Restore (DEV)
            ├─ Grid (Phaser-Host + React-Overlays)
            └─ HUD + Panels (state als Prop, dispatch als Prop)
```

Alle Mutationen laufen über `dispatch`. Phaser ist read-only über `state`-Snapshots.

---

## Tick Pipeline

| Tick | Intervall (ms) | Action | Trigger | Handler | Primary state writes |
|---|---|---|---|---|---|
| Sapling Growth | 1000 | `GROW_SAPLINGS` | immer | [`growth-actions`](./store/action-handlers/growth-actions/) | `assets`, `cellMap`, `saplingGrowAt` |
| Natural Spawn | 60 000 | `NATURAL_SPAWN` | immer | [`growth-actions`](./store/action-handlers/growth-actions/) | `assets`, `cellMap`, `saplingGrowAt` |
| Smithy | 100 | `SMITHY_TICK` | nur wenn `smithy.processing` | [`machine-actions`](./store/action-handlers/machine-actions.ts) | `smithy` |
| Manual Assembler | 100 | `MANUAL_ASSEMBLER_TICK` | nur wenn `manualAssembler.processing` | [`manual-assembler-actions.ts`](./store/action-handlers/manual-assembler-actions.ts) | `manualAssembler`, Source-Inventar (`inventory` / `warehouseInventories` / Zone), `notifications` |
| Generator | 200 | `GENERATOR_TICK` | nur wenn min. 1 Generator läuft | [`machine-actions`](./store/action-handlers/machine-actions.ts) | `generators` |
| Energy Net | 2000 | `ENERGY_NET_TICK` | immer | inline `switch` → [`energy-net-tick.ts`](./store/energy-net-tick.ts) | `connectedAssetIds`, `poweredMachineIds`, `machinePowerRatio` |
| Logistics | 500 | `LOGISTICS_TICK` | immer | inline `switch` → [`logistics-tick.ts`](./store/action-handlers/logistics-tick.ts) | `autoMiners`, `conveyors`, `autoSmelters`, `inventory`, `warehouseInventories`, `smithy`, `notifications`, `autoDeliveryLog` |
| Crafting Jobs | 500 | `JOB_TICK` | nur wenn pending Jobs ODER aktive Keep-Stock-Targets | [`crafting-queue-actions`](./store/action-handlers/crafting-queue-actions/) | `crafting`, `network`, physische Inventare (`inventory` / `warehouseInventories` / `serviceHubs[*].inventory`), `keepStockByWorkbench` |
| Drones | 500 | `DRONE_TICK` | immer | [`drone-tick-actions`](./store/action-handlers/drone-tick-actions/) | `drones`, `starterDrone`, Ziel-Inventare (Hub / Warehouse / global), `crafting` (Input-Buffer + Delivery-Übergänge), `collectionNodes` |
| Notifications | 500 | `EXPIRE_NOTIFICATIONS` | immer | [`maintenance-actions`](./store/action-handlers/maintenance-actions/) | `notifications` |

**Reihenfolge innerhalb eines Browser-Frames ist nicht garantiert** — jeder Tick ist ein eigener `setInterval`. React batcht Dispatches, aber zwei gleichzeitige Ticks werden sequenziell durch den Reducer geschickt.

Konstanten in [`store/constants/timing.ts`](./store/constants/timing.ts), [`store/constants/energy/`](./store/constants/energy/), [`store/constants/workbench-timing.ts`](./store/constants/workbench-timing.ts).

---

## State Map

`GameState` (definiert in [`store/types.ts:432`](./store/types.ts#L432)) zerfällt logisch in folgende Slices. **Hinweis:** Die Aufteilung ist konzeptuell — im Code ist `GameState` ein einziges Flat-Interface mit ~62 Feldern.

| Slice (logisch) | Felder | Persistiert |
|---|---|---|
| **Identity** | `mode` | ja |
| **Inventories (3 Schichten)** | `inventory` (global), `warehouseInventories`, `network` (Reservierungen) | ja |
| **Assets / World** | `assets`, `cellMap`, `floorMap`, `collectionNodes`, `saplingGrowAt` | ja |
| **Build / Shop** | `purchasedBuildings`, `placedBuildings`, `warehousesPurchased`, `warehousesPlaced`, `cablesPlaced`, `powerPolesPlaced`, `buildMode`, `selectedBuildingType`, `selectedFloorTile` | tw. |
| **Hotbar** | `hotbarSlots`, `activeSlot` | ja |
| **Machines** | `smithy`, `manualAssembler`, `autoMiners`, `autoSmelters`, `conveyors`, `generators`, `battery` | ja |
| **Energy** | `connectedAssetIds`, `poweredMachineIds`, `machinePowerRatio`, `energyDebugOverlay` | tw. |
| **Drones / Hubs** | `starterDrone`, `drones`, `serviceHubs`, `constructionSites` | ja |
| **Zones** | `productionZones`, `buildingZoneIds`, `buildingSourceWarehouseIds` | ja |
| **Crafting** | `crafting` (CraftingQueueState), `keepStockByWorkbench`, `recipeAutomationPolicies` | ja |
| **UI (transient)** | `openPanel`, `selectedWarehouseId`, `selectedPowerPoleId`, `selectedAutoMinerId`, `selectedAutoSmelterId`, `selectedGeneratorId`, `selectedServiceHubId`, `selectedCraftingBuildingId`, `notifications`, `autoDeliveryLog` | nein |

**Inventar-Hierarchie (wichtigste Verwirrungsquelle):**
1. `inventory` — globaler Fallback-Pool (manuelle Ernte, Crafting-Kosten ohne explizite Quelle)
2. `warehouseInventories[id]` — physische Lager-Inventare (Auto-Delivery landet hier)
3. `network` — logische Reservierungen über (1)+(2). Physisches Inventar bleibt Source-of-Truth; `network` trackt nur `reserved`/`free`.

`starterDrone` und `drones[id]` werden synchron gehalten — Legacy für Backward-Compat. (*Notes: Migrationspfad unklar; `syncDrones` siehe [`drones/drone-state-helpers.ts`](./drones/drone-state-helpers.ts).*)

---

## Action System

### Architektur

`GameAction` ist eine diskriminierte Union, kanonisch definiert in [`store/game-actions.ts:20`](./store/game-actions.ts#L20) (Wave 3 extrahiert). [`actions.ts`](./store/actions.ts) und [`reducer.ts`](./store/reducer.ts) sind beide Compat-Facades, die von dort re-exportieren — `grep "type GameAction ="` trifft genau den Single Point of Truth.

`gameReducer` ist eine Dispatch-Kette aus `handleXAction(state, action, deps?) → GameState | null`. Jeder Handler entscheidet per `HANDLED_ACTION_TYPES`-Set, ob er zuständig ist; `null` = Fallthrough. Verbleibende Actions landen im inline `switch` ([`reducer.ts:1417`](./store/reducer.ts#L1417)).

### Action-Cluster-Map

| Cluster (Datei/Ordner unter `store/action-handlers/`) | Action-Types | Hat Deps? |
|---|---|---|
| [`crafting-queue-actions/`](./store/action-handlers/crafting-queue-actions/) | `NETWORK_RESERVE_BATCH`, `NETWORK_COMMIT_RESERVATION`, `NETWORK_COMMIT_BY_OWNER`, `NETWORK_CANCEL_RESERVATION`, `NETWORK_CANCEL_BY_OWNER`, `CRAFT_REQUEST_WITH_PREREQUISITES`, `JOB_ENQUEUE`, `JOB_CANCEL`, `JOB_MOVE`, `JOB_SET_PRIORITY`, `JOB_TICK`, `SET_KEEP_STOCK_TARGET`, `SET_RECIPE_AUTOMATION_POLICY` | ja |
| [`zone-actions.ts`](./store/action-handlers/zone-actions.ts) | `CREATE_ZONE`, `DELETE_ZONE`, `SET_BUILDING_ZONE` | nein |
| [`ui-actions.ts`](./store/action-handlers/ui-actions.ts) | `SET_ACTIVE_SLOT`, `TOGGLE_PANEL`, `CLOSE_PANEL`, `TOGGLE_ENERGY_DEBUG` | nein |
| [`building-placement.ts`](./store/action-handlers/building-placement.ts) (+ `building-placement/`) | `BUILD_PLACE_BUILDING`, `BUILD_REMOVE_ASSET` | ja (IO) |
| [`building-site.ts`](./store/action-handlers/building-site.ts) | `SET_BUILDING_SOURCE`, `UPGRADE_HUB` | ja |
| [`machine-actions.ts`](./store/action-handlers/machine-actions.ts) (+ `machine-actions/`) | `SMITHY_*` (alle Smithy-Lifecycle), `GENERATOR_*` (ohne `ENERGY_NET_TICK`) | ja |
| [`warehouse-hotbar-actions.ts`](./store/action-handlers/warehouse-hotbar-actions.ts) (+ `warehouse-hotbar-actions/`) | `EQUIP_FROM_WAREHOUSE`, `EQUIP_BUILDING_FROM_WAREHOUSE`, `TRANSFER_TO_WAREHOUSE`, `TRANSFER_FROM_WAREHOUSE`, `REMOVE_FROM_HOTBAR` | ja |
| [`manual-assembler-actions.ts`](./store/action-handlers/manual-assembler-actions.ts) | `MANUAL_ASSEMBLER_START`, `MANUAL_ASSEMBLER_TICK` | ja |
| [`floor-placement.ts`](./store/action-handlers/floor-placement.ts) | `BUILD_PLACE_FLOOR_TILE` | ja |
| [`shop.ts`](./store/action-handlers/shop.ts) | `BUY_MAP_SHOP_ITEM` | ja |
| [`machine-config.ts`](./store/action-handlers/machine-config.ts) | `SET_MACHINE_PRIORITY`, `SET_MACHINE_BOOST` | nein |
| [`build-mode-actions/`](./store/action-handlers/build-mode-actions/) | `TOGGLE_BUILD_MODE`, `SELECT_BUILD_BUILDING`, `SELECT_BUILD_FLOOR_TILE` | nein |
| [`maintenance-actions/`](./store/action-handlers/maintenance-actions/) | `CRAFT_WORKBENCH` (deprecated), `REMOVE_BUILDING`, `REMOVE_POWER_POLE`, `DEBUG_SET_STATE`, `EXPIRE_NOTIFICATIONS` | nein |
| [`growth-actions/`](./store/action-handlers/growth-actions/) | `GROW_SAPLING`, `GROW_SAPLINGS`, `NATURAL_SPAWN` | nein |
| [`hub-target-actions/`](./store/action-handlers/hub-target-actions/) | `SET_HUB_TARGET_STOCK` | nein |
| [`auto-smelter-actions/`](./store/action-handlers/auto-smelter-actions/) | `AUTO_SMELTER_SET_RECIPE` | nein |
| [`drone-role-actions/`](./store/action-handlers/drone-role-actions/) | `DRONE_SET_ROLE` | ja |
| [`drone-tick-actions/`](./store/action-handlers/drone-tick-actions/) | `DRONE_TICK` | ja |
| [`drone-assignment.ts`](./store/action-handlers/drone-assignment.ts) | `ASSIGN_DRONE_TO_HUB` | ja |
| [`click-cell.ts`](./store/action-handlers/click-cell.ts) (+ `click-cell-tools.ts`, `ui-cell-prelude.ts`) | `CLICK_CELL` | ja |
| [`logistics-tick.ts`](./store/action-handlers/logistics-tick.ts) (+ `logistics-tick/`) | `LOGISTICS_TICK` | ja (IO) |
| inline `switch` in [`reducer.ts`](./store/reducer.ts) | `ENERGY_NET_TICK`, `LOGISTICS_TICK` (*Notes: `AUTO_SMELTER_TICK` ist als Action-Type in der Union deklariert ([`game-actions.ts:40`](./store/game-actions.ts#L40)), wird aber **nirgends dispatched** — die Smelter-Logik läuft als Phase 4 von `LOGISTICS_TICK` (siehe [`logistics-tick/phases/auto-smelter.ts`](./store/action-handlers/logistics-tick/phases/auto-smelter.ts)). Im inline `switch` fällt der Type auf `default: return state` durch (No-Op).*) | — |

### Discoverability

`grep -rn "case \"X_ACTION\":" src/game` führt zuverlässig auf einen einzigen Treffer (den Phase- oder Cluster-Handler).

---

## Crafting System

Komplexestes Subsystem. Eigene README: [`crafting/README.md`](./crafting/README.md).

Kurz: Jobs durchlaufen `queued → reserved → crafting → delivering → done|cancelled`. Drei orthogonale Schichten:
- **Reservation** (`inventory/`) — logische Holds auf physischem Stock
- **Queue** (`crafting/queue/`) — geordnete Jobliste pro Workbench
- **Tick-Phasen** (`crafting/tick.ts` + `crafting/tickPhases.ts`) — Planning vs. Execution strikt getrennt

---

## Renderer / UI / Simulation Boundaries

| Layer | Verzeichnis(se) | Schreibt State? | Liest State? |
|---|---|---|---|
| **Simulation (Pure Logic)** | [`store/`](./store/) (inkl. [`store/selectors/`](./store/selectors/) für read-only Zone-/Source-/Conveyor-Status), [`crafting/`](./crafting/), [`drones/`](./drones/), [`inventory/`](./inventory/), [`logistics/`](./logistics/), [`zones/`](./zones/), [`power/`](./power/), [`buildings/`](./buildings/), [`simulation/`](./simulation/) | nur via Reducer | — |
| **UI (React)** | [`ui/`](./ui/), [`grid/Grid*.tsx`](./grid/) | nur via `dispatch` | ja, als Prop |
| **Renderer (Phaser)** | [`world/PhaserGame.ts`](./world/PhaserGame.ts), [`world/PhaserHost.tsx`](./world/PhaserHost.tsx), [`assets/sprites/`](./assets/sprites/) | nie | snapshot via Bridge |
| **Persistence** | [`simulation/save*.ts`](./simulation/) | nur Codec | hydratiert State |
| **Debug** | [`debug/`](./debug/) | via `DEBUG_SET_STATE` | ja |
| **Entry / Bootstrap** | [`entry/`](./entry/) | indirekt | ja |

**Goldene Regel:** Phaser darf nie `dispatch` aufrufen. UI-Events (`onClick`, etc.) sind die einzige Quelle interaktiver Mutationen außer Tickern.

---

## Known Friction for AI

Stolperfallen, die häufiger Tool-Calls kosten als nötig:

1. **Drei Wege zu `GameAction`** — kanonisch [`game-actions.ts:20`](./store/game-actions.ts#L20) (Wave 3 extrahiert). [`actions.ts`](./store/actions.ts) und [`reducer.ts`](./store/reducer.ts) sind beide Compat-Facades. `grep "type GameAction ="` trifft genau einen Treffer.
2. **`reducer.ts` ist 1508 Zeilen** — überwiegend Imports + Re-Export-Hub. Echte Reducer-Logik: Zeile 1332–1506 (`gameReducer`-Dispatcher + `gameReducerWithInvariants`-Wrapper).
3. **Resolver-Aliasings** in [`reducer.ts:82-97`](./store/reducer.ts#L82-L97) — Funktionen werden mit `as XResolver` umbenannt; Grep nach Originalnamen findet die Verwendung in `reducer.ts` nicht direkt.
4. **Drei Inventarsysteme koexistieren** — `inventory` (global) / `warehouseInventories` (physisch) / `network` (logisch reserviert). Wer ist kanonisch? Antwort: physisch ist Source-of-Truth, `network` ist abgeleitete Holds.
5. **`starterDrone` ↔ `drones[id]`** — duplizierter State, "kept in sync" via [`syncDrones`](./drones/drone-state-helpers.ts). Nicht beide editieren.
6. **Phase-File-Explosion** — Cluster wie `crafting-queue-actions/phases/` haben ≥6 Dateien + `index.ts` + `types.ts` + `deps.ts`. Eine Änderung berührt typischerweise 3 Dateien (Cluster-Index + Phase + Deps).
7. **Tick-Reihenfolge unbestimmt** — keine globale Tick-Orchestrierung. Jeder `setInterval` läuft unabhängig. Race-Conditions sind tolerierbar, weil jeder Tick einen kompletten Reducer-Pass macht.
8. **`AUTO_SMELTER_TICK` ist toter Action-Type** — in der `GameAction`-Union deklariert ([`game-actions.ts:40`](./store/game-actions.ts#L40)), aber niemand dispatched ihn (kein `setInterval`, kein UI-Handler). Im Reducer fällt er auf `default: return state` durch. Die Smelter-Logik läuft als Phase 4 von `LOGISTICS_TICK` (siehe [`logistics-tick/phases/auto-smelter.ts`](./store/action-handlers/logistics-tick/phases/auto-smelter.ts)).
9. **Action-Discoverability funktioniert** — `grep "case \"X\":"` führt zuverlässig zur Implementierung.

---

## Module Boundaries (Post-Refactor)

Wave 2/3/3.5 hat drei Sauberkeits-Verbesserungen eingeführt, die die Findability für LLMs verbessern:

**1. `GameAction` ist eigenständig**

[`store/game-actions.ts`](./store/game-actions.ts) ist die einzige kanonische Quelle der `GameAction`-Union. Kein Reducer-Code, kein Logik-Mix — reine Type-Definition. Wer eine neue Action hinzufügt oder die Union liest, berührt **nur** diese Datei. `reducer.ts` und `actions.ts` sind Compat-Facades und können mittelfristig entfallen.

**2. Read-only Selektoren in [`store/selectors/`](./store/selectors/)**

| Datei | Exportierte Funktionen |
|---|---|
| [`selectors/zone-selectors.ts`](./store/selectors/zone-selectors.ts) | `getZoneBuildingIds`, `getZoneItemCapacity` |
| [`selectors/source-status.ts`](./store/selectors/source-status.ts) | `getSourceStatusInfo`, `hasStaleWarehouseAssignment` |
| [`selectors/conveyor-zone-status.ts`](./store/selectors/conveyor-zone-status.ts) | Conveyor-Zone-Status-Abfragen |

Diese Selektoren *schreiben* nie State. `reducer.ts` re-exportiert sie aus Compat-Gründen, aber kanonische Imports kommen direkt aus `store/selectors/`. Wer Zone- oder Source-Anzeige in der UI baut, importiert von hier — nicht aus `reducer.ts`.

**3. Konstanten direkt aus `constants/`**

Grid- und Building-Konstanten (`GRID_W`, `GRID_H`, `CELL_PX`, `WAREHOUSE_CAPACITY`) werden in UI- und Grid-Code direkt aus [`constants/grid.ts`](./constants/grid.ts) bzw. [`store/constants/buildings.ts`](./store/constants/buildings.ts) importiert. `reducer.ts` ist kein Re-Export-Hub mehr für sie.

**Konsequenz:** Eine "Wo lebt X?"-Frage findet jetzt jeweils *eine* kanonische Datei. `grep "type GameAction ="` ⇒ ein Treffer. `grep "export function getZoneBuildingIds"` ⇒ ein Treffer in `selectors/`. Navigation durch `reducer.ts` ist seit Wave 3 die Ausnahme — direkter Modulzugriff ist der Default.

---

## Glossary

| Begriff | Bedeutung |
|---|---|
| **Asset** | Platziertes World-Object (Building, Tree, Deposit, Drone-fähig). Keyed by `assetId`. |
| **Cell** | 1×1 Grid-Tile. Adressiert via `cellKey(x,y)` aus [`store/cell-key.ts`](./store/cell-key.ts). |
| **Hub / Service Hub** | Drone-Heimatbasis mit eigenem Inventar (`ServiceHubInventory`). |
| **Workbench** | Crafting-Asset; wird von Crafting-Jobs belegt. |
| **Network Slice** | Logische Reservierungen auf physischem Inventar. Definiert in [`inventory/reservationTypes.ts`](./inventory/reservationTypes.ts). |
| **Owner** | Eigentümer einer Reservierung. Konvention: `ownerKey === jobId`. |
| **Source / CraftingInventorySource** | Diskriminierte Union: `global` \| `warehouse` \| `zone`. Bestimmt, woher ein Job liest und wohin Output geht. |
| **Zone / ProductionZone** | Logische Gruppierung von Buildings + Warehouses. Aggregierter Stock. |
| **Job-Lifecycle** | `queued → reserved → crafting → delivering → done|cancelled`. Siehe [`crafting/types.ts`](./crafting/types.ts). |
| **Keep-Stock-Target** | Pro-Workbench/Recipe Auto-Refill-Schwelle. Plant Jobs in der Planning-Phase. |
| **Tick-Phase** | Innerer Schritt eines Tick-Handlers (z. B. `auto-miner`, `conveyor`, `auto-smelter` in `LOGISTICS_TICK`). |
| **Cluster** | Gruppe verwandter Action-Types mit gemeinsamem Handler unter `store/action-handlers/`. |
| **Deps** | An Handler injizierte Reducer-interne Helper. Vermeidet ESM-Zyklen mit `reducer.ts`. |
| **HMR** | Hot Module Replacement. State wird in `sessionStorage` gespiegelt, damit Edits den Spielstand nicht zurücksetzen. |
| **Construction Site** | Building, das noch Ressourcen-Schulden hat (`isUnderConstruction(asset)`). Drones liefern. |
| **DroneRole** | `"auto" \| "construction" \| "supply"` (definiert in [`store/types.ts:292`](./store/types.ts#L292)). Beeinflusst nur das Task-Scoring: `construction` und `supply` erhalten einen `DRONE_ROLE_BONUS` für ihre Kandidatensätze in [`drones/selection/select-drone-task.ts`](./drones/selection/select-drone-task.ts). `auto` ist der neutrale Default. Rollenwechsel mutiert ausschließlich `drone.role` ([`drone-set-role-phase.ts`](./store/action-handlers/drone-role-actions/phases/drone-set-role-phase.ts)) — laufende Tasks oder Cargo werden **nicht** abgebrochen; die neue Rolle greift erst bei der nächsten Task-Auswahl. |
