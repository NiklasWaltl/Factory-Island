# `crafting/` — Crafting Subsystem

> Komplexestes Subsystem im Repo. Diese README ersetzt das Lesen von 5+ Dateien.

---

## Purpose

Verwaltet alle Crafting-Jobs (Workbench, Manual Assembler, Smithy via Output-Routing). Strikt getrennt: **Planning** (was soll gebaut werden) vs. **Execution** (laufende Jobs voranbringen). Reservierungen leben in [`../inventory/`](../inventory/), Output-Routing hier in [`output.ts`](./output.ts).

---

## Job-Lifecycle

```
                    ┌──────────────────────┐
                    │       queued         │  no reservations held
                    └──────────┬───────────┘
                               │ Phase 2: reservation phase
                               │ (alle Ingredients reservierbar?)
                               ▼
                    ┌──────────────────────┐
                    │      reserved        │  network holds active
                    └──────────┬───────────┘
                               │ Phase 3: workbench frei?
                               ▼
                    ┌──────────────────────┐
                    │      crafting        │  workbench timer läuft
                    └──────────┬───────────┘
                               │ Phase 1: progress + commit
                               ▼
                    ┌──────────────────────┐
                    │     delivering       │  warten auf Drone-Pickup/Output
                    └──────────┬───────────┘
                               │ routeOutput()
                               ▼
                    ┌──────────────────────┐
                    │        done          │  terminal
                    └──────────────────────┘

   Aus jedem Status → cancelled (terminal, Reservierungen released)
```

Reihenfolge der Phasen pro Tick (`crafting/tick.ts`):

1. **Progress active `crafting` jobs** — commit ingredients + transition → `delivering`
2. **Promote `queued` → `reserved`** — wenn Ingredients reservierbar
3. **Promote `reserved` → `crafting`** — wenn Workbench frei (instant fertig wenn `processingTime===0`)

→ Ein frisch enqueued Job kann in einem einzigen Tick `queued → reserved → crafting → delivering` durchlaufen.

Statusdefinition: [`crafting/types.ts:27`](./types.ts#L27).

---

## Planning vs. Execution (Architekturregel)

`JOB_TICK` ist in zwei Phasen geteilt ([`tickPhases.ts`](./tickPhases.ts)):

| Phase | Datei | Darf neue Jobs enqueuen? | Verantwortung |
|---|---|---|---|
| **Planning** | [`workflows/keepStockWorkflow.ts`](./workflows/keepStockWorkflow.ts) | **ja, einzig hier** | Keep-Stock-Refills entscheiden + planen + enqueuen |
| **Execution** | [`tick.ts`](./tick.ts) → `tick/job-lifecycle.ts` | **nein, niemals** | bestehende Jobs voranbringen |

**Regel:** Conveyor-, Drone- und Smelter-Ticks dürfen ebenfalls niemals neue Crafting-Jobs erzeugen. Wenn ein Feature neue Auto-Start-Logik braucht, kommt es in die Planning-Phase.

---

## Modulkarte

| Datei / Ordner | Zweck |
|---|---|
| [`types.ts`](./types.ts) | Pure Data-Types: `CraftingJob`, `CraftingQueueState`, `JobStatus`, `CraftingInventorySource`. |
| [`tick.ts`](./tick.ts) | Orchestrator. Re-Export-Hub. Phase 2 (Reservation) lebt hier. |
| [`tickPhases.ts`](./tickPhases.ts) | Splittet `JOB_TICK` in `applyPlanningTriggers` + `applyExecutionTick`. |
| [`tick/job-lifecycle.ts`](./tick/job-lifecycle.ts) | finish/cancel/release Helpers + DEV-Invarianten. |
| [`tick/source-selection.ts`](./tick/source-selection.ts) | `pickCraftingPhysicalSourceForIngredient` — wo kommt Zutat physisch her. |
| [`tick/hub-inventory-view.ts`](./tick/hub-inventory-view.ts) | Hub↔Inventory-Adapter (Hub-Inventar als virtuelles "Warehouse"). |
| [`queue/queue.ts`](./queue/queue.ts) | Pure Queue-Helper: enqueue/cancel/move/setPriority/sortByPriorityFifo. |
| [`queue/jobStatus.ts`](./queue/jobStatus.ts) | Read-only Statusabfragen für Planning + UI. |
| [`queue/index.ts`](./queue/index.ts) | Barrel. |
| [`planner/planner.ts`](./planner/planner.ts) | `buildWorkbenchAutoCraftPlan` — erzeugt Step-Liste für Keep-Stock-Refills (rekursiv über Recipes). |
| [`planner/index.ts`](./planner/index.ts) | Barrel. |
| [`policies/policies.ts`](./policies/policies.ts) | `RecipeAutomationPolicy`-Logik (autoCraftAllowed, keepInStockAllowed, manualOnly). |
| [`policies/keepStockDecision.ts`](./policies/keepStockDecision.ts) | Pro-Target Gate-Entscheidung (single source of truth, geteilt mit UI). |
| [`policies/index.ts`](./policies/index.ts) | Barrel. |
| [`workflows/keepStockWorkflow.ts`](./workflows/keepStockWorkflow.ts) | Planning-Side-Effect: Refill-Steps planen + enqueuen + per-Step neu prüfen. |
| [`crafting-sources.ts`](./crafting-sources.ts) | Auflösung von `CraftingInventorySource` → konkrete Inventar-Ansicht (`getCraftingSourceInventory`, `applyCraftingSourceInventory`). |
| [`output.ts`](./output.ts) | `routeOutput` — wohin landet fertiger Output (Warehouse → Hub → global Fallback). |
| [`workbench-input-buffer.ts`](./workbench-input-buffer.ts), [`workbench-input-complete.ts`](./workbench-input-complete.ts) | Drone-Input-Buffer pro Workbench (Drones liefern Zutaten; Job startet erst, wenn Buffer komplett). |

---

## Schichten-Überblick (Daten-Sicht)

```
              ┌────────────────────────────────────────┐
              │  Recipes (simulation/recipes/*)        │  ← statische Definitionen
              └─────────────────┬──────────────────────┘
                                │ Snapshot bei enqueue
                                ▼
   ┌────────────────────────────────────────────────────────┐
   │   CraftingQueueState  (state.crafting)                 │  ← Job-Liste mit Status
   └─────────────┬───────────────────────────┬──────────────┘
                 │                           │
       network reservations              physical stock
                 │                           │
                 ▼                           ▼
   ┌──────────────────────┐    ┌──────────────────────────────┐
   │  state.network       │    │ state.warehouseInventories   │
   │  (logical holds)     │    │ + state.inventory (global)   │
   │  inventory/          │    │ + state.serviceHubs[].inv    │
   └──────────────────────┘    └──────────────────────────────┘
```

**Source-of-Truth-Regel:** Physische Inventare sind autoritativ. `network.reserved` ist *immer* ≤ physisch verfügbar (DEV-Invariante in [`tick/job-lifecycle.ts`](./tick/job-lifecycle.ts)).

---

## Häufige Aufgaben → Einstiegspunkte

| Aufgabe | Datei zum Lesen/Editieren |
|---|---|
| Neue Recipe hinzufügen | [`../simulation/recipes/`](../simulation/recipes/) (kein crafting-Code-Change nötig) |
| Job-Statusübergang ändern | [`tick.ts`](./tick.ts) + [`tick/job-lifecycle.ts`](./tick/job-lifecycle.ts) |
| Output-Routing ändern (z. B. Hub-Priorität) | [`output.ts`](./output.ts) |
| Auto-Refill-Verhalten ändern | [`workflows/keepStockWorkflow.ts`](./workflows/keepStockWorkflow.ts) + [`policies/keepStockDecision.ts`](./policies/keepStockDecision.ts) |
| Reservierungs-Bug | [`../inventory/reservations.ts`](../inventory/reservations.ts) — *nicht* in `crafting/` |
| UI-Anzeige von Job-Status | [`../ui/panels/WorkbenchPanel.tsx`](../ui/panels/WorkbenchPanel.tsx) + [`../ui/hud/productionTransparency.ts`](../ui/hud/productionTransparency.ts) |
| Planner-Tiefe / Ingredient-Auflösung | [`planner/planner.ts`](./planner/planner.ts) (`DEFAULT_MAX_DEPTH = 12`) |

---

## Recipe Schema (`WorkbenchRecipe`)

Definiert in [`../simulation/recipes/WorkbenchRecipes.ts`](../simulation/recipes/WorkbenchRecipes.ts). Wichtig zu verstehen, *welches* Feld die Crafting-Pipeline tatsächlich liest:

| Feld | Typ | Wird vom Crafting-System wofür benutzt? |
|---|---|---|
| `key` | `string` | Recipe-ID (`recipeId`-Lookup via `getWorkbenchRecipe`). |
| `label`, `emoji` | `string` | UI-only (Workbench-Panel, Tooltips). |
| `outputItem` | `string` | Was der Job produziert; via `routeOutput` ausgeliefert. Muss in `isKnownItemId` registriert sein. |
| `outputAmount` | `number` | Output-Menge pro Job-Abschluss. |
| `processingTime` | `number` (Sekunden) | Workbench-Timer-Dauer. **`processingTime: 0` ist ein Sonderpfad** (siehe unten). |
| **`costs`** | `Partial<Record<keyof Inventory, number>>` | **Kanonische Ingredient-Quelle.** [`queue/queue.ts`](./queue/queue.ts) `recipeIngredientsToStacks` iteriert ausschließlich über `costs`, um die `ingredients: ItemStack[]` des Jobs zu bauen. Reservierungen + Plan-Ingredients ([`planner/planner.ts`](./planner/planner.ts)) lesen ebenfalls aus `costs`. |
| `inputItem` | `string` | **Wird im Crafting-Flow nicht gelesen.** Kein Treffer in `crafting/` für `recipe.inputItem`. Das Feld ist ein Legacy-Hint für UI/Smelter-ähnliche Pfade — bei Workbench-Recipes ist es informational. (*Notes: zu verifizieren bei späteren Erweiterungen — siehe Hinweis unten.*) |

> **Wenn du Kosten/Dauer eines Recipes änderst:**
> - Kosten ⇒ `costs` editieren (nicht `inputItem`).
> - Dauer ⇒ `processingTime` editieren.
> - Laufende Jobs nutzen den eingefrorenen Snapshot (siehe Recipe-Snapshot-Strategie unten) — der Effekt ist nur bei *neu enqueueten* Jobs sichtbar.

### `processingTime: 0` Sonderpfad

In [`tick.ts`](./tick.ts) (Phase 3, Promotion `reserved → crafting`):

```ts
if (promoted.processingTime === 0) {
  const completed = finishCraftingJob(promoted, …);
  …
}
```

Effekt: Der Job traversiert `queued → reserved → crafting → delivering` in **einem einzigen `JOB_TICK`**. `finishCraftingJob` committed Reservations sofort und routet den Output direkt. UI-seitig wird der `crafting`-Zustand nie sichtbar — der Job erscheint praktisch instant in `delivering`.

### Recipe-Familien-Disambiguierung

Drei verschiedene Recipe-Typen existieren parallel; das Crafting-Subsystem nutzt **nur** `WorkbenchRecipe`:

| Recipe-Typ | Datei | Konsumiert von |
|---|---|---|
| `WorkbenchRecipe` | [`recipes/WorkbenchRecipes.ts`](../simulation/recipes/WorkbenchRecipes.ts) | `crafting/` (Jobs, Planner, Queue) — `costs` als Ingredients |
| `SmeltingRecipe` | [`recipes/SmeltingRecipes.ts`](../simulation/recipes/SmeltingRecipes.ts) | [`store/action-handlers/logistics-tick/phases/auto-smelter.ts`](../store/action-handlers/logistics-tick/phases/auto-smelter.ts) — nutzt `inputItem`/`inputAmount`/`outputItem` |
| `ManualAssemblerRecipe` | [`recipes/ManualAssemblerRecipes.ts`](../simulation/recipes/ManualAssemblerRecipes.ts) | [`store/action-handlers/manual-assembler-actions.ts`](../store/action-handlers/manual-assembler-actions.ts) — nutzt `inputItem`/`inputAmount`/`outputItem` |

---

## Notes & Gotchas

- **Recipe-Snapshot-Strategie:** `CraftingJob` friert `ingredients`, `output`, `processingTime` beim Enqueue ein. Mid-Game-Recipe-Edits korrumpieren laufende Jobs nicht.
- **`enqueuedAt` ≠ Wallclock.** Es ist ein monotoner Sequence-Counter. `startedAt`/`finishesAt` sind dagegen Wallclock-`Date.now()` und nur informativ.
- **`done_pending_storage` existiert absichtlich nicht** — Warehouses haben kein hartes Item-Cap, das einen Deposit ablehnen könnte.
- **Owner-Konvention:** `job.owner === job.id`. Stored explizit, um die Verbindung sichtbar zu machen.
- **Planner ist rekursiv** mit `DEFAULT_MAX_DEPTH = 12`. Tiefe Recipe-Bäume können theoretisch abbrechen. (*Notes: in der Praxis nicht beobachtet — zu verifizieren.*)
- **Tests** liegen unter [`__tests__/`](./__tests__/) und [`workflows/__tests__/`](./workflows/__tests__/). Lifecycle-Übergänge sind dort verbindlich dokumentiert.
