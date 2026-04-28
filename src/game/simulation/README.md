# `simulation/` — Save/Load Pipeline

> Persistence- und Migrations-Layer. Diese README ist ein **Runbook**
> für den häufigsten gefährlichen Flow: ein neues Feld in den
> persistierten `GameState` aufnehmen.

---

## Pipeline-Überblick

```
GameState (runtime)
   │
   │ serializeState()  ← WHITELIST in save-codec.ts
   ▼
SaveGameLatest  ──►  JSON.stringify  ──►  localStorage[SAVE_KEY]
                                              (alle 10 s + beforeunload)

localStorage[SAVE_KEY]  ──►  JSON.parse  ──►  unknown
   │
   │ migrateSave()  ← Kette migrateV0ToV1 … migrateV15ToV16
   ▼
SaveGameLatest
   │
   │ deserializeState()  ← derives runtime-only fields
   │     + sanitizeXxx()  ← save-normalizer.ts
   ▼
GameState (runtime, hydratiert)
```

**Parallelpfad HMR (DEV only):** `saveHmrState`/`loadHmrState` ([`debug/hmrState.ts`](../debug/hmrState.ts)) speichert Live-State und lädt ihn beim Hot-Reload. Beide Pfade (HMR und localStorage) gehen durch `normalizeLoadedState` in [`entry/FactoryApp.tsx`](../entry/FactoryApp.tsx) → das wiederum ruft `migrateSave` + `deserializeState`.

---

## Modulkarte

| Datei | Zweck |
|---|---|
| [`save.ts`](./save.ts) | Top-Level Public API. |
| [`save-codec.ts`](./save-codec.ts) | `serializeState` (Whitelist!) + `deserializeState` (re-derive runtime-only fields). |
| [`save-migrations.ts`](./save-migrations.ts) | `CURRENT_SAVE_VERSION`, alle `SaveGameVN`-Interfaces, `migrateVNToVN+1`-Funktionen, Migrations-Chain. |
| [`save-normalizer.ts`](./save-normalizer.ts) | `sanitizeXxx`-Funktionen für inkonsistente / verlorengegangene Sub-Slices (z. B. `sanitizeNetworkSlice`, `sanitizeCraftingQueue`, `sanitizeStarterDrone`). |
| [`save-legacy.ts`](./save-legacy.ts) | V0 (pre-versioned) → V1 Sonderfall + Runtime-Snapshot-Detection. |
| [`recipes/`](./recipes/) | Statische Recipe-Definitionen (Workbench / Smelting / ManualAssembler). Nicht persistenz-relevant. |

---

## Runbook: Neues persistiertes Feld hinzufügen

Beispiel: `state.fooBar: Record<string, number>` soll persistiert werden.

### Schritt 1 — Type erweitern
[`../store/types.ts`](../store/types.ts): Feld in `GameState` ergänzen.

### Schritt 2 — Default in initial-state
[`../store/initial-state.ts`](../store/initial-state.ts): `fooBar: {}` (oder sinnvoller Default) in `createInitialState` setzen.
**Wichtig:** Auch bestehende Saves greifen indirekt darauf zu (`deserializeState` startet von `createInitialState(save.mode)`).

### Schritt 3 — Save-Schema-Versionsbump
[`save-migrations.ts`](./save-migrations.ts):

1. Neues Interface `SaveGameV<N+1>` — Copy aus `SaveGameV<N>` + neues Feld.
2. Update `type SaveGameLatest = SaveGameV<N+1>`.
3. `CURRENT_SAVE_VERSION` von `N` → `N+1` bumpen.
4. Neue Migrations-Funktion `migrateV<N>ToV<N+1>(save: SaveGameV<N>): SaveGameV<N+1>` schreiben — typischer Inhalt: `{ ...save, version: N+1, fooBar: {} }`.
5. In der `migrations`-Chain einen Eintrag `{ from: N, to: N+1, migrate: migrateV<N>ToV<N+1> }` ergänzen.

### Schritt 4 — Whitelist im Codec
[`save-codec.ts`](./save-codec.ts) → `serializeState`: Feld in den zurückgegebenen Object-Literal aufnehmen. **Ohne diesen Schritt wird das Feld nie gespeichert**, egal was im Type steht.

### Schritt 5 — Hydrate
[`save-codec.ts`](./save-codec.ts) → `deserializeState`: Feld aus `save.fooBar` ins `partial: GameState` übernehmen. Bei optionalen Feldern Fallback auf `base.fooBar`.

### Schritt 6 — (optional) Sanitizer
Wenn das Feld inhaltliche Invarianten hat (z. B. Foreign Keys auf andere `state`-Slices, die bereits sanitized werden): Sanitizer in [`save-normalizer.ts`](./save-normalizer.ts) ergänzen und in `deserializeState` aufrufen.

### Schritt 7 — Tests
- Roundtrip: `serializeState(state) → migrateSave → deserializeState` muss `fooBar` erhalten.
- Migrations-Test: Ein V<N>-Save (ohne `fooBar`) muss durch `migrateV<N>ToV<N+1>` einen sinnvollen Default bekommen.
- DEV-Invarianten in [`../store/reducer.ts`](../store/reducer.ts) `gameReducerWithInvariants` (z. B. `devAssertInventoryNonNegative`) prüfen, falls das neue Feld inventarähnlich ist.

### Schritt 8 — Konsumenten
- UI-Komponenten, die `state.fooBar` lesen, ergänzen.
- `DEBUG_SET_STATE` (siehe [`../store/action-handlers/maintenance-actions/`](../store/action-handlers/maintenance-actions/)) umgeht Invarianten — beim Schreiben von Test-Fixtures auch den neuen Default mitliefern.

---

## Stolperfallen

- **Whitelist-Codec:** `serializeState` ist eine harte Whitelist. Ein Feld nur in `GameState` zu deklarieren bewirkt **nichts** für Persistenz.
- **HMR-Path geht ebenfalls durch Migration:** Wer den Versionsbump vergisst, bekommt im DEV nach Hot-Reload eine "alte" Save-Version → Migration läuft → Feld könnte zurückgesetzt werden.
- **`deserializeState` startet von `createInitialState`:** Fehlt der Default dort, ist der hydratisierte State für *neue* Spielstände inkonsistent mit migrated-Saves.
- **`autoDeliveryLog`, `notifications`, `openPanel`, `selected*Id` sind absichtlich NICHT persistiert** — UI-transient. Nicht in `serializeState` aufnehmen, sonst überschreibt Save den UI-State.
- **`connectedAssetIds`, `poweredMachineIds`, `machinePowerRatio`** werden in `deserializeState` re-derived (über `computeConnectedAssetIds`). Persistieren wäre redundant und driftet.
- **`drones[id]` und `starterDrone`** sind redundant gespeichert (Legacy). `deserializeState` sanitisiert beide separat über `sanitizeStarterDrone` — neue Drone-Felder müssen dort auch ergänzt werden.

---

## Verwandt

- `ARCHITECTURE.md` "Known Friction" Punkt 1 (Action-Union live in `reducer.ts`).
- `ARCHITECTURE.md` State Map "Persistiert"-Spalte als Wahrheitsquelle, *welche* Slices durch diese Pipeline gehen.
- DEV-Invarianten: [`../store/reducer.ts`](../store/reducer.ts) `gameReducerWithInvariants`.
