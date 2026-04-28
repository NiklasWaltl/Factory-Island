# `logistics-tick/` — `LOGISTICS_TICK` Phasenkette

> Orchestrator: [`../logistics-tick.ts`](../logistics-tick.ts).
> Diese README dokumentiert die interne Phasenreihenfolge und die
> Schreibpfade der Auto-Smelter-Phase, weil beide nirgends sonst
> sichtbar sind.

---

## Phasenreihenfolge (fix, sequenziell)

| # | Phase | Datei | Zweck |
|---|---|---|---|
| 0 | Snapshot | `../logistics-tick.ts` | Baut `LogisticsTickContext` mit `poweredSet` + lazy "newXxxL" working sets. |
| 2 | Auto-Miner | [`phases/auto-miner.ts`](./phases/auto-miner.ts) | Produktion + Output-Routing der Auto-Miner. |
| 3 | Conveyor | [`phases/conveyor.ts`](./phases/conveyor.ts) | Conveyor-Movement, Transport-Matching, Destination-Handoff. |
| 4 | Auto-Smelter | [`phases/auto-smelter.ts`](./phases/auto-smelter.ts) | Belt-Input-Pull → Verarbeitung → Output-Flush → Status-Update. |
| 5 | Commit | `../logistics-tick.ts` | Mergt working sets zurück in `GameState` (No-Op falls `ctx.changed === false`). |

> Phase 1 fehlt absichtlich (historische Nummerierung aus dem extrahierten reducer-Case). Reihenfolge **nicht** umstellen ohne Conveyor↔Smelter-Review (siehe unten).

---

## Phase-4 Schreibpfade (Auto-Smelter)

`runAutoSmelterPhase(ctx)` schreibt — über das `ctx.newXxxL`-Working-Set, committed erst in Phase 5 — in:

- **`state.autoSmelters[smelterId]`** (immer der Hauptkandidat):
  - `status`: `"NO_POWER" | "MISCONFIGURED" | "PROCESSING" | "BLOCKED" | "IDLE" | …` (vollständige Liste in [`smelter-decisions.ts`](../../smelter-decisions.ts))
  - `processing` (start/progress/finish-Übergang)
  - `inputBuffer` (Pull aus Belt; gefiltert beim Batch-Start)
  - `pendingOutput` (Output-Queue; geleert beim Flush)
  - `lastRecipeInput` / `lastRecipeOutput` (für UI)
  - `throughputEvents` (60-s-Window, getrimmt jeden Tick)
- **`state.conveyors[*]`**:
  - **Pull** vom Input-Conveyor an `smelterIo.input` (entfernt 1 Item aus `queue`)
  - **Push** auf Output-Conveyor an `smelterIo.output` (append, respektiert `CONVEYOR_TILE_CAPACITY`)
- **Source-Inventar** (nur wenn Output-Conveyor blockiert/abwesend und Source erlaubt Fallback):
  - via `applySourceInventory(ctx, source, …)` → schreibt in `state.inventory` *oder* `state.warehouseInventories[*]` *oder* Zone-Inventar (abhängig von `resolveBuildingSource`).

`ctx.changed = true` muss bei jeder beobachtbaren Mutation gesetzt werden, sonst wird die Phase-5-Commit übersprungen.

---

## Reihenfolge-Risiken

- **Conveyor vor Smelter** ist beabsichtigt: Phase 3 verschiebt Items entlang der Belts; Phase 4 zieht das frisch eingelaufene Item am Smelter-Input-Tile. Würde man Phase 4 vor Phase 3 ausführen, lägen Items am Input-Tile einen Tick zu früh "alt" / einen Tick zu spät "neu" — Throughput-Bug.
- **Auto-Miner vor Conveyor** ist beabsichtigt: Auto-Miner platzieren neue Items auf ihrem Output-Tile; Phase 3 kann sie sofort weitertransportieren.
- Smelter-Output-Routing prüft den Output-Conveyor in derselben Phase, in der dieser bereits per Phase 3 bewegt wurde — Output kann also direkt an einer freien Tile-Stelle landen.
- Reihenfolge **nicht** umstellen, ohne Tests in [`store/__tests__/auto-smelter-conveyor-input.test.ts`](../../__tests__/auto-smelter-conveyor-input.test.ts) und Logistics-Tick-Tests durchzuspielen.

---

## Was diese Phase **nicht** tut

- Kein Crafting-Job-Lifecycle (`JOB_TICK` ist separat — siehe [`crafting/README.md`](../../../crafting/README.md)).
- Keine neuen Crafting-Jobs enqueuen (Architekturregel — Smelter ist auch Execution-Side).
- Keine direkten `network`-Reservierungen (Smelter nutzt `getCraftingSourceInventory`/`applySourceInventory` ohne den Reservation-Layer).
- Kein Asset-Placement (`assets`/`cellMap` werden hier nicht beschrieben).

---

## Verwandt

- Smelter-Recipes (`processingTime`, `inputItem`, `inputAmount`, `outputItem`): [`simulation/recipes/SmeltingRecipes.ts`](../../../simulation/recipes/SmeltingRecipes.ts).
- IO-Geometrie (Input-/Output-Tile pro Smelter): [`asset-geometry.ts`](../../asset-geometry.ts) → `getAutoSmelterIoCells`.
