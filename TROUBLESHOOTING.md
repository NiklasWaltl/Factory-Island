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
| Port belegt | `--port 3000` wird verwendet. Anderen Port prüfen oder Prozess beenden. |
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
2. **Entry-Point prüfen**: `index.factory.html` muss auf `/src/game/entry/main.factory.tsx` verweisen.
3. **Reducer-Fehler**: Unbehandelte Action-Typen im Reducer werfen keinen Fehler, können aber zu unerwartetem State führen.
4. **Corrupt Save**: Wenn `localStorage` einen ungültigen Save enthält:
   - Konsole: `localStorage.removeItem("factory-island-save")` → Seite neu laden.
   - Alternativ: Application-Tab → Local Storage → Eintrag löschen.
5. **Fehlende Felder in GameState**: Wenn neue Felder hinzugefügt wurden, aber `save.ts` nicht migriert → Crash beim Laden alter Saves (siehe Abschnitt 4).

---

## 4. Save/Load-Probleme

### Alter Save crasht nach Code-Änderung

**Ursache**: Neue Felder in `GameState` ohne entsprechende Migration in `save.ts`.

**Lösung**:
1. `CURRENT_SAVE_VERSION` in `save.ts` erhöhen.
2. Neue Migration schreiben (z. B. `migrateV1ToV2()`).
3. Migration in `MIGRATIONS`-Array eintragen.
4. `SaveGameV2`-Interface definieren, `SaveGameLatest` aktualisieren.

**Schneller Workaround** (nur Entwicklung):
```javascript
// Browser-Konsole
localStorage.removeItem("factory-island-save");
```

### Save enthält abgeleiteten State

`serializeState()` persistiert nur Kern-Felder. Transiente Felder werden beim Laden neu berechnet:
- `connectedAssetIds` → `computeConnectedAssetIds()`
- `poweredMachineIds` → nächster `ENERGY_NET_TICK`
- `openPanel`, `notifications`, `buildMode` → Defaults

Falls ein neues Feld transient sein soll: **nicht** in `SaveGameV*` aufnehmen, sondern in `deserializeState()` mit Default initialisieren.

---

## 5. Energie-Netz-Probleme

### Maschine bekommt keinen Strom

| Prüfpunkt | Detail |
|---|---|
| Generator platziert? | Muss auf Steinboden stehen (`REQUIRES_STONE_FLOOR`). |
| Generator hat Brennstoff? | Holz hinzufügen + starten. |
| Kabelverbindung? | Generator → Kabel → Power Pole → Maschine (oder direkte Adjacency). |
| Power Pole in Reichweite? | Chebyshev-Distanz ≤ 3 Tiles (`POWER_POLE_RANGE`). |
| Maschine in `ENERGY_DRAIN` registriert? | Neue Maschinen müssen dort eingetragen sein. |
| Priorität zu niedrig? | `MachinePriority` 5 = niedrigste. Bei Engpass werden niedrige Prioritäten gedrosselt. |

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

- Eingang ist genau eine Zelle: `(warehouse.x, warehouse.y + height)`, Richtung muss `"north"` sein.
- Prüfen mit `isValidWarehouseInput()`.

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

`PlacedAsset` hat `size`, `width` und `height`. Für Größenberechnungen immer:
```typescript
// ✅ Korrekt
const w = assetWidth(asset);   // asset.width ?? asset.size
const h = assetHeight(asset);  // asset.height ?? asset.size

// ❌ Falsch
const w = asset.size;  // Ignoriert width/height-Override
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

- Nur sichtbar wenn `IS_DEV = true` UND `state.mode === "debug"`.
- In Production ist alles via `import.meta.env.DEV` tree-shaken.
- Beim Start über `ModeSelect.tsx` "debug" wählen.

### Mock-Daten haben keinen Effekt

- Mock-Actions (`DEBUG_MOCK_RESOURCES` etc.) werden über `applyMockToState()` verarbeitet.
- Nur im Debug-Modus verfügbar (Guard: `import.meta.env.DEV`).
- Ergebnis wird als `DEBUG_SET_STATE`-Action dispatched.

---

## 10. Schnell-Checkliste

| Problem | Erste Aktion |
|---|---|
| Build schlägt fehl | `tsc --project tsconfig.factory.json` separat ausführen → Fehlermeldung lesen |
| White Screen | Browser-Konsole (F12) → Fehler prüfen |
| Alter Save crasht | `localStorage.removeItem("factory-island-save")` |
| Maschine ohne Strom | Energienetz-Debug-Overlay aktivieren |
| Förderband ignoriert | `conveyors[id]` im Reducer-Case prüfen |
| Sprite fehlt | `ASSET_SPRITES` in `sprites.ts` + `preload()` in `PhaserGame.ts` prüfen |
| HMR-State verloren | Seite neu laden, Debug-Modus startet mit Test-Setup |
| Import-Fehler | Nur relative Imports in `src/game/`, einziger Alias: `game/*` |
| Neues Feld crasht Saves | Migration in `save.ts` ergänzen, `CURRENT_SAVE_VERSION` erhöhen |
| Panel zeigt nichts | Prüfen ob Panel in `FactoryApp.tsx` eingebunden und `openPanel`-Case vorhanden |

---

*Last updated: 2026-04-17 — Wartungshinweis: Bei neuen Fehlermustern oder Build-Änderungen diese Datei ergänzen. Keine Duplikation mit `ARCHITECTURE.md` — dort steht die Struktur, hier die Problemlösung.*
