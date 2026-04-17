# TROUBLESHOOTING.md — Factory Island

Häufige Fehler, Ursachen und Lösungen für Entwicklung und Build.

---

## 1. Build & TypeScript

### `tsc` schlägt fehl bei `yarn build`

| Ursache | Lösung |
|---|---|
| Pfad-Alias fehlt | Factory Island nutzt nur relative Imports innerhalb `src/game/`. Einziger Alias: `game/*`. |
| Typ fehlt in `store/reducer.ts` | Neue Typen müssen in `store/reducer.ts` definiert und ggf. in `types/game.ts` re-exportiert werden. |
| `tsconfig.factory.json` nicht verwendet | Prüfen: `tsc --project tsconfig.factory.json` (nicht `tsconfig.json`). |
| Fehlende `vite/client`-Typen | `tsconfig.factory.json` muss `"types": ["vite/client"]` enthalten. |

### Import-Fehler: `Cannot find module 'features/...'`

Factory Island hat nur den Pfad-Alias `game/*` → `src/game/*`.

- ❌ `import { something } from "features/game"` — existiert nicht
- ✅ `import { something } from "../store/reducer"` — relativer Import

### Import-Fehler: Rezepte direkt importiert

```
// ❌ Fehler: Rezepte nur via Barrel importieren
import { getSmeltingRecipe } from "./recipes/SmeltingRecipes";

// ✅ Korrekt
import { getSmeltingRecipe } from "./recipes";
```

---

## 2. Dev-Server

### `yarn dev` startet nicht

| Prüfpunkt | Aktion |
|---|---|
| Port belegt | Port 3000 wird verwendet (`server.port: 3000`). Anderen Prozess beenden. |
| `node_modules` fehlt | `yarn install` ausführen. |
| Vite-Version inkompatibel | `vite@^5.4.21` wird benötigt (siehe `package.json`). |

### HMR funktioniert nicht / State geht verloren

- HMR-State wird über `window.__FI_HMR_STATE__` gesichert (nur im DEV-Modus).
- Falls HMR nicht greift: Browser-Konsole auf `[HMR]`-Meldungen prüfen.
- Bei Problemen: Seite manuell neu laden (F5). Debug-Modus startet mit vollständigem Test-Setup.

### Phaser-Canvas bleibt schwarz / fehlt

- `PhaserHost.tsx` mountet das Canvas in `Grid.tsx`. Prüfen, ob `PhaserHost` gerendert wird.
- Phaser-Sprites müssen in `PhaserGame.ts` `preload()` geladen werden — fehlende Sprites loggen Fehler in der Konsole.
- Canvas hat `pointer-events: none` — das ist korrekt, Klicks laufen über React.

---

## 3. White Screen / App lädt nicht

### Checkliste

1. **Browser-Konsole öffnen** (F12) → Fehlermeldung lesen.
2. **GameErrorBoundary prüfen**: Bei Render-Fehlern fängt die Error-Boundary den Crash ab und zeigt "Etwas ist schiefgelaufen" mit einem "Erneut versuchen"-Button (löscht localStorage-Save + remountet App). Wenn stattdessen eine blanke Seite ohne Text → JavaScript-Fehler vor React-Mount prüfen (z.B. in `main.factory.tsx`).
3. **Entry-Point prüfen**: `index.factory.html` muss auf `/src/game/entry/main.factory.tsx` verweisen.
4. **Reducer-Fehler**: Unbehandelte Action-Typen im Reducer werfen keinen Fehler, können aber zu unerwartetem State führen.
5. **Corrupt Save**: Wenn `localStorage` einen ungültigen Save enthält:
   - Konsole: `localStorage.removeItem("factory-island-save")` → Seite neu laden.
   - Alternativ: Application-Tab → Local Storage → Eintrag löschen.
6. **Fehlende Felder in GameState**: Wenn neue Felder hinzugefügt wurden, aber `save.ts` nicht migriert → Crash beim Laden alter Saves (siehe Abschnitt 4).

---

## 4. Save/Load-Probleme

### Alter Save crasht nach Code-Änderung

**Ursache**: Neue Felder in `GameState` ohne entsprechende Migration in `save.ts`.

**Lösung**:
1. `CURRENT_SAVE_VERSION` in `save.ts` erhöhen.
2. Neues Interface `SaveGameV{N}` definieren.
3. Migrationsfunktion `migrateV{N-1}ToV{N}()` schreiben.
4. Eintrag `{ from: N-1, to: N, migrate: migrateV{N-1}ToV{N} }` in `MIGRATIONS`-Array.
5. `SaveGameLatest`-Alias auf neues Interface zeigen lassen.

**Schneller Workaround** (nur Entwicklung):
```javascript
// Browser-Konsole
localStorage.removeItem("factory-island-save");
```

### Save wird beim Laden ignoriert (leerer State nach Refresh)

**Ursache**: `loadAndHydrate(raw, mode)` lädt nur wenn `save.mode === mode`. Debug-Save wird im Release-Modus nicht geladen und umgekehrt.

**Lösung**: Beim Neustart denselben Modus (Debug/Release) wie beim letzten Speichern wählen.

### Save enthält abgeleiteten State

`serializeState()` persistiert nur Kern-Felder. Transiente Felder werden beim Laden neu gesetzt:
- `connectedAssetIds` → `computeConnectedAssetIds()` (sofort in `deserializeState`)
- `poweredMachineIds` → nächster `ENERGY_NET_TICK`
- `openPanel`, `notifications`, `buildMode` → Defaults
- `autoDeliveryLog`, `energyDebugOverlay` → leer / false

Falls ein neues Feld transient sein soll: **nicht** in `SaveGameV*` aufnehmen, sondern in `deserializeState()` mit Default initialisieren.

---

## 5. Energie-Netz-Probleme

### Maschine bekommt keinen Strom

| Prüfpunkt | Detail |
|---|---|
| Generator platziert? | Muss auf Steinboden stehen (`REQUIRES_STONE_FLOOR`). |
| Generator hat Brennstoff? | Holz hinzufügen + starten. |
| Kabelverbindung? | Nur `cable`, `generator`, `power_pole` sind Kabelleiter (Phase-1-BFS). Maschinen und Batterien leiten keine Energie durch Kabel weiter. |
| Power Pole in Reichweite? | Chebyshev-Distanz ≤ 3 Tiles (`POWER_POLE_RANGE`). Maschine muss im Bereich eines über Kabel verbundenen Poles liegen. |
| Maschine in `ENERGY_DRAIN` registriert? | Neue Maschinen müssen dort eingetragen sein. |
| Priorität zu niedrig? | `MachinePriority` 5 = niedrigste. Bei Engpass werden niedrige Prioritäten gedrosselt. |
| Auto-Smelter zieht zu viel? | Im Processing-Zustand 60 J/Periode (statt 10 J idle). Bei Vollbetrieb ausreichend Generatorkapazität einplanen. |

### Debug: Energienetz visualisieren

Im Debug-Modus: `TOGGLE_ENERGY_DEBUG`-Action oder UI-Button → `EnergyDebugOverlay` zeigt Netzwerk-Topologie.

---

## 6. Förderband / Logistik

### Förderband wird im Logistics-Tick ignoriert

**Ursache**: `conveyors[id]` wurde beim Platzieren nicht initialisiert.

**Lösung**: Beim Platzieren eines Förderbands muss `conveyors[id] = { queue: [] }` im Reducer gesetzt werden.

### Items stauen sich / Maschine zeigt OUTPUT_BLOCKED

- Output-Tile hat maximale Kapazität: `CONVEYOR_TILE_CAPACITY = 4`.
- Maschine wartet, bis Platz auf dem Ausgangs-Förderband frei wird.
- Prüfen: Ist das nächste Förderband richtig ausgerichtet (`direction`)?

### Warehouse nimmt keine Items an

Der Warehouse-Eingang ist **richtungsabhängig** — abhängig von `warehouse.direction`:

| warehouse.direction | Eingang-Position | Förderband muss zeigen |
|---|---|---|
| `"south"` (Default) | `(x, y + height)` | `"north"` |
| `"north"` | `(x, y - 1)` | `"south"` |
| `"east"` | `(x + width, y)` | `"west"` |
| `"west"` | `(x - 1, y)` | `"east"` |

Validierung: `isValidWarehouseInput(entityX, entityY, entityDir, warehouse)` aus `store/reducer`.

---

## 7. Asset-Platzierung

### Gebäude lässt sich nicht platzieren

| Prüfpunkt | Detail |
|---|---|
| Kollision? | `placeAsset()` prüft auf überlappende Assets. |
| Falscher Boden? | Generator braucht Steinboden. |
| Auto-Miner nicht auf Deposit? | Muss direkt auf `stone_deposit`, `iron_deposit` oder `copper_deposit` stehen. |
| Richtung nicht gesetzt? | Default ist `"east"`. R-Taste zum Wechseln. |

### Größen-Bugs bei rotierbaren Maschinen

`PlacedAsset` hat `size`, `width` und `height`. `assetWidth`/`assetHeight` sind **interne Funktionen** in `reducer.ts` — nicht exportiert. Außerhalb von `reducer.ts` direkt verwenden:

```typescript
// ✅ Korrekt
const w = asset.width ?? asset.size;
const h = asset.height ?? asset.size;

// ❌ Falsch — asset.size ignoriert width/height-Override
const w = asset.size;
```

Auto-Smelter: `size=2, width=2, height=1` — mit `asset.size` allein wäre die Höhe falsch.

---

## 8. Phaser / Sprites

### Sprite wird nicht angezeigt

1. Prüfen, ob Sprite in `assets/sprites/sprites.ts` (`ASSET_SPRITES`) definiert ist.
2. Prüfen, ob `PhaserGame.ts` `preload()` den Sprite-Key lädt.
3. Browser-Konsole auf 404-Fehler für Sprite-URLs prüfen.

### Phaser-Welt und React-UI sind versetzt

- Beide müssen dieselbe Transform-Basis (`Grid.tsx`) verwenden.
- Keine zweite Kamera- oder Offset-Logik erstellen.
- `PhaserHost` liegt innerhalb des World-Containers in `Grid.tsx`.

---

## 9. Debug-Modus

### Debug-Panel erscheint nicht

- Nur sichtbar wenn `IS_DEV = true` (Vite DEV-Build) UND `state.mode === "debug"`.
- In Production ist alles via `import.meta.env.DEV` tree-shaken.
- Beim Start über `ModeSelect.tsx` "debug" wählen.

### Debug-Logs erscheinen nicht in der Konsole

Debug-Logger prüft **zwei Bedingungen**:
1. `import.meta.env.DEV` — muss true sein (DEV-Build, nicht Production)
2. `isDebugEnabled()` — Runtime-Toggle, kann aus Debug-UI deaktiviert werden

Beide müssen true sein. Runtime-Toggle zurücksetzen: `import { setDebugEnabled } from "./debug/debugConfig"; setDebugEnabled(true)` in der Browser-Konsole (DEV-Build vorausgesetzt).

### Mock-Daten haben keinen Effekt

- Mock-Actions (`DEBUG_MOCK_RESOURCES` etc.) werden über `applyMockToState()` verarbeitet.
- Nur im Debug-Modus verfügbar (Guard: `IS_DEV`).
- Ergebnis wird als `DEBUG_SET_STATE`-Action dispatched.

---

## 10. Schnell-Checkliste

| Problem | Erste Aktion |
|---|---|
| Build schlägt fehl | `tsc --project tsconfig.factory.json` separat ausführen → Fehlermeldung lesen |
| White Screen (blank) | Browser-Konsole (F12) → JS-Fehler prüfen |
| White Screen mit Text | GameErrorBoundary fing Fehler — "Erneut versuchen" oder Save manuell löschen |
| Alter Save crasht | `localStorage.removeItem("factory-island-save")` |
| Save wird ignoriert | Mode-Mismatch? Debug-Save wird im Release-Modus nicht geladen |
| Maschine ohne Strom | Energienetz-Debug-Overlay aktivieren; Kabelleiter prüfen (nur cable/generator/power_pole) |
| Auto-Smelter ohne Strom | Hohen Drain (60 J/Periode processing) beachten — mehr Generator-Kapazität |
| Förderband ignoriert | `conveyors[id]` im Reducer-Case prüfen |
| Warehouse nimmt nichts an | Richtungsabhängiger Eingang: `getWarehouseInputCell()` prüfen |
| Sprite fehlt | `ASSET_SPRITES` in `sprites.ts` + `preload()` in `PhaserGame.ts` prüfen |
| HMR-State verloren | Seite neu laden — Debug-Modus startet mit Test-Setup |
| Import-Fehler | Nur relative Imports in `src/game/`, einziger Alias: `game/*` |
| Neues Feld crasht Saves | Migration in `save.ts` ergänzen, `CURRENT_SAVE_VERSION` erhöhen |
| Panel zeigt nichts | Prüfen ob Panel in `GameInner` (FactoryApp.tsx) eingebunden und `UIPanel`-Union erweitert |
| assetWidth/assetHeight fehlt | Nicht exportiert — direkt `asset.width ?? asset.size` verwenden |
| Debug-Logs fehlen | Beide Bedingungen prüfen: `import.meta.env.DEV` AND `isDebugEnabled()` |

---

*Last updated: 2026-04-17 — Wartungshinweis: Bei neuen Fehlermustern oder Build-Änderungen diese Datei ergänzen. Keine Duplikation mit `ARCHITECTURE.md` — dort steht die Struktur, hier die Problemlösung.*
